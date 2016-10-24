import typescript = require('typescript');
import path = require('path');
import fs = require('fs');
import loaderUtils = require('loader-utils');
import objectAssign = require('object-assign');
import arrify = require('arrify');
import makeResolver = require('./resolver');
import interfaces = require('./interfaces');
import constants = require('./constants');
import utils = require('./utils');
import getLogger = require('./logger');
const semver = require('semver');
require('colors');

let instances = <interfaces.TSInstances> {};
let webpackInstances: any = [];
let scriptRegex = /\.tsx?$/i;

/**
 * The tsconfig.json is found using the same method as `tsc`, starting in the current directory
 * and continuing up the parent directory chain.
 */
function findConfigFile(compiler: typeof typescript, searchPath: string, configFileName: string): string {
    while (true) {
        const fileName = path.join(searchPath, configFileName);
        if (compiler.sys.fileExists(fileName)) {
            return fileName;
        }
        const parentPath = path.dirname(searchPath);
        if (parentPath === searchPath) {
            break;
        }
        searchPath = parentPath;
    }
    return undefined;
}

/**
 * The loader is executed once for each file seen by webpack. However, we need to keep
 * a persistent instance of TypeScript that contains all of the files in the program
 * along with definition files and options. This function either creates an instance
 * or returns the existing one. Multiple instances are possible by using the
 * `instance` property.
 */
function ensureTypeScriptInstance(loaderOptions: interfaces.LoaderOptions, loader: any): { instance?: interfaces.TSInstance, error?: interfaces.WebpackError } {
    if (utils.hasOwnProperty(instances, loaderOptions.instance)) {
        return { instance: instances[loaderOptions.instance] };
    }

    let compiler: typeof typescript;
    try {
        compiler = require(loaderOptions.compiler);
    } catch (e) {
        let message = loaderOptions.compiler === 'typescript'
            ? 'Could not load TypeScript. Try installing with `npm install typescript`. If TypeScript is installed globally, try using `npm link typescript`.'
            : `Could not load TypeScript compiler with NPM package name \`${loaderOptions.compiler}\`. Are you sure it is correctly installed?`;
        return { error: {
            message: message.red,
            rawMessage: message,
            loaderSource: 'ts-loader',
        } };
    }

    const log = getLogger(loaderOptions);
    const motd = `ts-loader: Using ${loaderOptions.compiler}@${compiler.version}`;
    let compilerCompatible = false;
    if (loaderOptions.compiler === 'typescript') {
        if (compiler.version && semver.gte(compiler.version, '1.6.2-0')) {
            // don't log yet in this case, if a tsconfig.json exists we want to combine the message
            compilerCompatible = true;
        } else {
            log.logError(`${motd}. This version is incompatible with ts-loader. Please upgrade to the latest version of TypeScript.`.red);
        }
    } else {
        log.logWarning(`${motd}. This version may or may not be compatible with ts-loader.`.yellow);
    }

    const files: interfaces.TSFiles = {};
    const instance: interfaces.TSInstance = instances[loaderOptions.instance] = {
        compiler,
        compilerOptions: null,
        loaderOptions,
        files,
        languageService: null,
        version: 0,
        dependencyGraph: {},
        reverseDependencyGraph: {},
        modifiedFiles: null,
    };

    const compilerOptions: typescript.CompilerOptions = {
        skipDefaultLibCheck: true,
        suppressOutputPathCheck: true, // This is why: https://github.com/Microsoft/TypeScript/issues/7363
    };

    // Load any available tsconfig.json file
    let filesToLoad: string[] = [];
    const configFilePath = findConfigFile(compiler, path.dirname(loader.resourcePath), loaderOptions.configFileName);
    let configFile: {
        config?: any;
        error?: typescript.Diagnostic;
    };
    if (configFilePath) {
        if (compilerCompatible) {
            log.logInfo(`${motd} and ${configFilePath}`.green);
        } else {
            log.logInfo(`ts-loader: Using config file at ${configFilePath}`.green);
        }

        // HACK: relies on the fact that passing an extra argument won't break
        // the old API that has a single parameter
        configFile = (<interfaces.TSCompatibleCompiler> <any> compiler).readConfigFile(
            configFilePath,
            compiler.sys.readFile
        );

        if (configFile.error) {
            const configFileError = utils.formatErrors([configFile.error], instance, {file: configFilePath })[0];
            return { error: configFileError };
        }
    } else {
        if (compilerCompatible) { log.logInfo(motd.green); }

        configFile = {
            config: {
                compilerOptions: {},
                files: [],
            },
        };
    }

    configFile.config.compilerOptions = objectAssign({},
        configFile.config.compilerOptions,
        loaderOptions.compilerOptions);

    // do any necessary config massaging
    if (loaderOptions.transpileOnly) {
        configFile.config.compilerOptions.isolatedModules = true;
    }

    // if allowJs is set then we should accept js(x) files
    if (configFile.config.compilerOptions.allowJs) {
        scriptRegex = /\.tsx?$|\.jsx?$/i;
    }

    let configParseResult: typescript.ParsedCommandLine;
    if (typeof (<any> compiler).parseJsonConfigFileContent === 'function') {
        // parseConfigFile was renamed between 1.6.2 and 1.7
        configParseResult = (<interfaces.TSCompatibleCompiler> <any> compiler).parseJsonConfigFileContent(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    } else {
        configParseResult = (<interfaces.TSCompatibleCompiler> <any> compiler).parseConfigFile(
            configFile.config,
            compiler.sys,
            path.dirname(configFilePath || '')
        );
    }

    if (configParseResult.errors.length) {
        utils.pushArray(
            loader._module.errors,
            utils.formatErrors(configParseResult.errors, instance, { file: configFilePath }));

        return { error: {
            file: configFilePath,
            message: 'error while parsing tsconfig.json'.red,
            rawMessage: 'error while parsing tsconfig.json',
            loaderSource: 'ts-loader',
        }};
    }

    instance.compilerOptions = objectAssign<typescript.CompilerOptions>(compilerOptions, configParseResult.options);
    filesToLoad = configParseResult.fileNames;

    // if `module` is not specified and not using ES6 target, default to CJS module output
    if ((!compilerOptions.module) && compilerOptions.target !== 2 /* ES6 */) {
        compilerOptions.module = 1; /* CommonJS */
    } else if (compilerCompatible && semver.lt(compiler.version, '1.7.3-0') && compilerOptions.target === 2 /* ES6 */) {
       // special handling for TS 1.6 and target: es6
        compilerOptions.module = 0 /* None */;
    }

    if (loaderOptions.transpileOnly) {
        // quick return for transpiling
        // we do need to check for any issues with TS options though
        const program = compiler.createProgram([], compilerOptions);
        const diagnostics = program.getOptionsDiagnostics();

        utils.pushArray(
            loader._module.errors,
            utils.formatErrors(diagnostics, instance, {file: configFilePath || 'tsconfig.json'}));

        return { instance: instances[loaderOptions.instance] = { compiler, compilerOptions, loaderOptions, files, dependencyGraph: {}, reverseDependencyGraph: {} }};
    }

    // Load initial files (core lib files, any files specified in tsconfig.json)
    let filePath: string;
    try {
        filesToLoad.forEach(fp => {
            filePath = path.normalize(fp);
            files[filePath] = {
                text: fs.readFileSync(filePath, 'utf-8'),
                version: 0,
            };
          });
    } catch (exc) {
        let filePathError = `A file specified in tsconfig.json could not be found: ${ filePath }`;
        return { error: {
            message: filePathError.red,
            rawMessage: filePathError,
            loaderSource: 'ts-loader',
        }};
    }

    let newLine =
        compilerOptions.newLine === 0 /* CarriageReturnLineFeed */ ? constants.CarriageReturnLineFeed :
        compilerOptions.newLine === 1 /* LineFeed */ ? constants.LineFeed :
        constants.EOL;

    // make a (sync) resolver that follows webpack's rules
    let resolver = makeResolver(loader.options);

    const moduleResolutionHost = {
        fileExists: (fileName: string) => utils.readFile(fileName) !== undefined,
        readFile: (fileName: string) => utils.readFile(fileName),
    };

    // Create the TypeScript language service
    const servicesHost = {
        getProjectVersion: () => `${instance.version}`,
        getScriptFileNames: () => Object.keys(files).filter(filePath => scriptRegex.test(filePath)),
        getScriptVersion: (fileName: string) => {
            fileName = path.normalize(fileName);
            return files[fileName] && files[fileName].version.toString();
        },
        getScriptSnapshot: (fileName: string) => {
            // This is called any time TypeScript needs a file's text
            // We either load from memory or from disk
            fileName = path.normalize(fileName);
            let file = files[fileName];

            if (!file) {
                let text = utils.readFile(fileName);
                if (!text) { return; }

                file = files[fileName] = { version: 0, text };
            }

            return compiler.ScriptSnapshot.fromString(file.text);
        },
        /**
         * getDirectories is also required for full import and type reference completions.
         * Without it defined, certain completions will not be provided
         */
        getDirectories: typescript.sys ? (<any> typescript.sys).getDirectories : undefined,

        /**
         * For @types expansion, these two functions are needed.
         */
        directoryExists: typescript.sys ? (<any> typescript.sys).directoryExists : undefined,
        getCurrentDirectory: () => process.cwd(),

        getCompilationSettings: () => compilerOptions,
        getDefaultLibFileName: (options: typescript.CompilerOptions) => compiler.getDefaultLibFilePath(options),
        getNewLine: () => newLine,
        log: log.log,
        resolveModuleNames: (moduleNames: string[], containingFile: string) => {
            let resolvedModules: interfaces.ResolvedModule[] = [];

            for (let moduleName of moduleNames) {
                let resolvedFileName: string;
                let resolutionResult: any;

                try {
                    resolvedFileName = resolver.resolveSync(path.normalize(path.dirname(containingFile)), moduleName);

                    if (!resolvedFileName.match(scriptRegex)) resolvedFileName = null;
                    else resolutionResult = { resolvedFileName };
                }
                catch (e) { resolvedFileName = null; }

                let tsResolution = compiler.resolveModuleName(moduleName, containingFile, compilerOptions, moduleResolutionHost);

                if (tsResolution.resolvedModule) {
                    if (resolvedFileName) {
                        if (resolvedFileName === tsResolution.resolvedModule.resolvedFileName) {
                            resolutionResult.isExternalLibraryImport = tsResolution.resolvedModule.isExternalLibraryImport;
                        }
                    }
                    else resolutionResult = tsResolution.resolvedModule;
                }

                resolvedModules.push(resolutionResult);
            }

            const importedFiles = resolvedModules
                .filter(m => m !== null && m !== undefined)
                .map(m => m.resolvedFileName);
            instance.dependencyGraph[path.normalize(containingFile)] = importedFiles;
            importedFiles.forEach(importedFileName => {
                if (!instance.reverseDependencyGraph[importedFileName]) {
                    instance.reverseDependencyGraph[importedFileName] = {};
                }
                instance.reverseDependencyGraph[importedFileName][path.normalize(containingFile)] = true;
            });

            return resolvedModules;
        },
    };

    const languageService = instance.languageService = compiler.createLanguageService(servicesHost, compiler.createDocumentRegistry());

    let getCompilerOptionDiagnostics = true;
    let checkAllFilesForErrors = true;

    loader._compiler.plugin("after-compile", (compilation: interfaces.WebpackCompilation, callback: () => void) => {
        // Don't add errors for child compilations
        if (compilation.compiler.isChild()) {
            callback();
            return;
        }

        // handle all other errors. The basic approach here to get accurate error
        // reporting is to start with a "blank slate" each compilation and gather
        // all errors from all files. Since webpack tracks errors in a module from
        // compilation-to-compilation, and since not every module always runs through
        // the loader, we need to detect and remove any pre-existing errors.

        function removeTSLoaderErrors(errors: interfaces.WebpackError[]) {
            let index = -1, length = errors.length;
            while (++index < length) {
                if (errors[index].loaderSource === 'ts-loader') {
                    errors.splice(index--, 1);
                    length--;
                }
            }
        }

        /**
         * Recursive collect all possible dependats of passed file
         */
        function collectAllDependants(fileName: string, collected: any = {}): string[] {
            let result = {};
            result[fileName] = true;
            collected[fileName] = true;
            if (instance.reverseDependencyGraph[fileName]) {
                Object.keys(instance.reverseDependencyGraph[fileName]).forEach(dependantFileName => {
                    if (!collected[dependantFileName]) {
                        collectAllDependants(dependantFileName, collected).forEach(fName => result[fName] = true);
                    }
                });
            }
            return Object.keys(result);
        }

        removeTSLoaderErrors(compilation.errors);

        // handle compiler option errors after the first compile
        if (getCompilerOptionDiagnostics) {
            getCompilerOptionDiagnostics = false;
            utils.pushArray(
                compilation.errors,
                utils.formatErrors(languageService.getCompilerOptionsDiagnostics(), instance, {file: configFilePath || 'tsconfig.json'}));
        }

        // build map of all modules based on normalized filename
        // this is used for quick-lookup when trying to find modules
        // based on filepath
        let modules: { [modulePath: string]: interfaces.WebpackModule[]} = {};
        compilation.modules.forEach(module => {
            if (module.resource) {
                let modulePath = path.normalize(module.resource);
                if (utils.hasOwnProperty(modules, modulePath)) {
                    let existingModules = modules[modulePath];
                    if (existingModules.indexOf(module) === -1) {
                        existingModules.push(module);
                    }
                }
                else {
                    modules[modulePath] = [module];
                }
            }
        });

        // gather all errors from TypeScript and output them to webpack
        let filesWithErrors: interfaces.TSFiles = {};
        // calculate array of files to check
        let filesToCheckForErrors: interfaces.TSFiles = null;
        if (checkAllFilesForErrors) {
            // check all files on initial run
            filesToCheckForErrors = instance.files;
            checkAllFilesForErrors = false;
        } else {
            filesToCheckForErrors = {};
            // check all modified files, and all dependants
            Object.keys(instance.modifiedFiles).forEach(modifiedFileName => {
                collectAllDependants(modifiedFileName).forEach(fName => {
                    filesToCheckForErrors[fName] = instance.files[fName];
                });
            });
        }
        // re-check files with errors from previous build
        if (instance.filesWithErrors) {
            Object.keys(instance.filesWithErrors).forEach(fileWithErrorName =>
                filesToCheckForErrors[fileWithErrorName] = instance.filesWithErrors[fileWithErrorName]
            );
        }

        Object.keys(filesToCheckForErrors)
            .filter(filePath => !!filePath.match(/(\.d)?\.ts(x?)$/))
            .forEach(filePath => {
                let errors = languageService.getSyntacticDiagnostics(filePath).concat(languageService.getSemanticDiagnostics(filePath));
                if (errors.length > 0) {
                    if (null === filesWithErrors) {
                        filesWithErrors = {};
                    }
                    filesWithErrors[filePath] = instance.files[filePath];
                }

                // if we have access to a webpack module, use that
                if (utils.hasOwnProperty(modules, filePath)) {
                    let associatedModules = modules[filePath];

                    associatedModules.forEach(module => {
                        // remove any existing errors
                        removeTSLoaderErrors(module.errors);

                        // append errors
                        let formattedErrors = utils.formatErrors(errors, instance, { module });
                        utils.pushArray(module.errors, formattedErrors);
                        utils.pushArray(compilation.errors, formattedErrors);
                    });
                }
                // otherwise it's a more generic error
                else {
                    utils.pushArray(compilation.errors, utils.formatErrors(errors, instance, {file: filePath}));
                }
            });


        // gather all declaration files from TypeScript and output them to webpack
        Object.keys(filesToCheckForErrors)
            .filter(filePath => !!filePath.match(/\.ts(x?)$/))
            .forEach(filePath => {
                let output = languageService.getEmitOutput(filePath);
                let declarationFile = output.outputFiles.filter(filePath => !!filePath.name.match(/\.d.ts$/)).pop();
                if (declarationFile) {
                    let assetPath = path.relative(compilation.compiler.context, declarationFile.name);
                    compilation.assets[assetPath] = {
                        source: () => declarationFile.text,
                        size: () => declarationFile.text.length,
                    };
                }
            });

        instance.filesWithErrors = filesWithErrors;
        instance.modifiedFiles = null;
        callback();
    });

    // manually update changed files
    loader._compiler.plugin("watch-run", (watching: interfaces.WebpackWatching, cb: () => void) => {
        const mtimes = watching.compiler.watchFileSystem.watcher.mtimes;
        if (null === instance.modifiedFiles) {
            instance.modifiedFiles = {};
        }

        Object.keys(mtimes)
            .filter(filePath => !!filePath.match(/\.tsx?$|\.jsx?$/))
            .forEach(filePath => {
                filePath = path.normalize(filePath);
                const file = instance.files[filePath];
                if (file) {
                    file.text = utils.readFile(filePath) || '';
                    file.version++;
                    instance.version++;
                    instance.modifiedFiles[filePath] = file;
                }
            });
        cb();
    });

    return { instance };
}

function loader(contents: string) {
    this.cacheable && this.cacheable();
    const callback = this.async();
    const filePath = path.normalize(this.resourcePath);

    const queryOptions = loaderUtils.parseQuery<interfaces.LoaderOptions>(this.query);
    const configFileOptions = this.options.ts || {};

    const options = objectAssign<interfaces.LoaderOptions>({}, {
        silent: false,
        logLevel: 'INFO',
        logInfoToStdOut: false,
        instance: 'default',
        compiler: 'typescript',
        configFileName: 'tsconfig.json',
        transpileOnly: false,
        compilerOptions: {},
    }, configFileOptions, queryOptions);
    options.ignoreDiagnostics = arrify(options.ignoreDiagnostics).map(Number);
    options.logLevel = options.logLevel.toUpperCase();

    // differentiate the TypeScript instance based on the webpack instance
    let webpackIndex = webpackInstances.indexOf(this._compiler);
    if (webpackIndex === -1) {
        webpackIndex = webpackInstances.push(this._compiler) - 1;
    }
    options.instance = webpackIndex + '_' + options.instance;

    const { instance, error } = ensureTypeScriptInstance(options, this);

    if (error) {
        callback(error);
        return;
    }

    // Update file contents
    let file = instance.files[filePath];
    if (!file) {
        file = instance.files[filePath] = <interfaces.TSFile> { version: 0 };
    }

    if (file.text !== contents) {
        file.version++;
        file.text = contents;
        instance.version++;
    }

    // push this file to modified files hash.
    if (!instance.modifiedFiles) {
        instance.modifiedFiles = {};
    }
    instance.modifiedFiles[filePath] = file;

    let outputText: string, sourceMapText: string, diagnostics: typescript.Diagnostic[] = [];

    if (options.transpileOnly) {
        const fileName = path.basename(filePath);
        const transpileResult = instance.compiler.transpileModule(contents, {
            compilerOptions: instance.compilerOptions,
            reportDiagnostics: true,
            fileName,
        });

        ({ outputText, sourceMapText, diagnostics } = transpileResult);

        utils.pushArray(this._module.errors, utils.formatErrors(diagnostics, instance, {module: this._module}));
    }
    else {
        let langService = instance.languageService;

        // Emit Javascript
        const output = langService.getEmitOutput(filePath);

        // Make this file dependent on *all* definition files in the program
        this.clearDependencies();
        this.addDependency(filePath);

        let allDefinitionFiles = Object.keys(instance.files).filter(filePath => /\.d\.ts$/.test(filePath));
        allDefinitionFiles.forEach(this.addDependency.bind(this));

        // Additionally make this file dependent on all imported files
        let additionalDependencies = instance.dependencyGraph[filePath];
        if (additionalDependencies) {
            additionalDependencies.forEach(this.addDependency.bind(this));
        }

        this._module.meta.tsLoaderDefinitionFileVersions = allDefinitionFiles
            .concat(additionalDependencies)
            .map(filePath => filePath + '@' + (instance.files[filePath] || {version: '?'}).version);

        const outputFile = output.outputFiles.filter(file => !!file.name.match(/\.js(x?)$/)).pop();
        if (outputFile) { outputText = outputFile.text; }

        const sourceMapFile = output.outputFiles.filter(file => !!file.name.match(/\.js(x?)\.map$/)).pop();
        if (sourceMapFile) { sourceMapText = sourceMapFile.text; }
    }

    if (outputText === null || outputText === undefined) {
        throw new Error(`Typescript emitted no output for ${filePath}`);
    }

    let sourceMap: { sources: any[], file: string; sourcesContent: string[] };
    if (sourceMapText) {
        sourceMap = JSON.parse(sourceMapText);
        sourceMap.sources = [loaderUtils.getRemainingRequest(this)];
        sourceMap.file = filePath;
        sourceMap.sourcesContent = [contents];
        outputText = outputText.replace(/^\/\/# sourceMappingURL=[^\r\n]*/gm, '');
    }

    // Make sure webpack is aware that even though the emitted JavaScript may be the same as
    // a previously cached version the TypeScript may be different and therefore should be
    // treated as new
    this._module.meta.tsLoaderFileVersion = file.version;

    callback(null, outputText, sourceMap);
}

export = loader;
