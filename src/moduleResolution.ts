import * as fs from 'fs';
import * as path from 'path';
import type {
  API,
  CompilerOptions,
  CreateSnapshotProgramParams,
  ModuleResolver,
  ParsedCommandLine,
} from 'typescript/sync';

import type {
  CustomModuleResolution,
  CustomResolveModuleName,
  ModuleResolutionHost,
  ParentResolveModuleName,
} from './types';

// The API's callback only gets the containing directory, but classic
// resolvers (e.g. pnp-webpack-plugin) expect a file to take `dirname` of.
const containingFilePlaceholder = '__ts-loader-containing-file__.ts';

const moduleResolutionHost: ModuleResolutionHost = {
  fileExists: fileName => fs.existsSync(fileName),
  readFile: fileName =>
    fs.existsSync(fileName) ? fs.readFileSync(fileName, 'utf8') : undefined,
  directoryExists: directoryName =>
    fs.existsSync(directoryName) && fs.statSync(directoryName).isDirectory(),
  realpath: fileName => fs.realpathSync(fileName),
  getCurrentDirectory: () => process.cwd(),
};

export function createCustomModuleResolution(
  resolveModuleName: CustomResolveModuleName,
): CustomModuleResolution {
  return { resolveModuleName, programs: new Map() };
}

/**
 * Re-parses the primary config, recreating the resolver if its compiler
 * options changed. Returns whether the config changed at all (so existing
 * programs need reconfiguring), plus any replaced resolvers for the caller to
 * dispose once no snapshot references them.
 */
export function refreshCustomModuleResolutionConfig(
  api: API,
  state: CustomModuleResolution,
  configFilePath: string,
): { configChanged: boolean; replacedResolvers: ModuleResolver[] } {
  const previousConfig = state.config;
  const config = api.parseConfigFile(configFilePath);
  state.config = config;

  const optionsChanged =
    previousConfig === undefined ||
    JSON.stringify(previousConfig.options) !== JSON.stringify(config.options);
  const configChanged =
    optionsChanged ||
    !sameStrings(previousConfig.fileNames, config.fileNames) ||
    previousConfig.errors.length !== config.errors.length;

  if (!optionsChanged && state.resolvers) {
    return { configChanged, replacedResolvers: [] };
  }

  const replacedResolvers = state.resolvers
    ? [state.resolvers.resolver, state.resolvers.defaultResolver]
    : [];
  state.resolvers = createAdaptedResolvers(
    api,
    config.options,
    state.resolveModuleName,
  );
  return { configChanged, replacedResolvers };
}

export function toSyntheticProgramParams(
  config: ParsedCommandLine,
  resolver: ModuleResolver,
  rootFiles: readonly string[],
): CreateSnapshotProgramParams {
  return {
    rootFiles,
    compilerOptions: config.options,
    options: {
      moduleResolver: resolver,
      configFileParsingDiagnostics: config.errors,
    },
  };
}

function createAdaptedResolvers(
  api: API,
  compilerOptions: CompilerOptions,
  customResolveModuleName: CustomResolveModuleName,
): NonNullable<CustomModuleResolution['resolvers']> {
  const defaultResolver = api.createModuleResolver(compilerOptions);
  const resolver = api.createModuleResolver(compilerOptions, {
    resolveModuleName: (
      moduleName,
      containingDirectory,
      resolutionMode,
      { snapshot },
    ) => {
      // Passing `snapshot` through keeps the default resolver on the same
      // file system view as the program build, and records what it touched
      // as dependencies of the program.
      const parentResolver: ParentResolveModuleName = (
        parentModuleName,
        containingFile,
      ) =>
        defaultResolver.resolveModuleName(
          parentModuleName,
          path.dirname(containingFile),
          resolutionMode,
          { snapshot },
        );
      const resolvedModule = customResolveModuleName(
        moduleName,
        path.posix.join(containingDirectory, containingFilePlaceholder),
        compilerOptions,
        moduleResolutionHost,
        parentResolver,
      )?.resolvedModule;
      return resolvedModule
        ? {
            resolvedFileName: resolvedModule.resolvedFileName,
            originalPath: resolvedModule.originalPath,
            packageId: resolvedModule.packageId,
          }
        : undefined;
    },
  });
  return { resolver, defaultResolver };
}

function sameStrings(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}
