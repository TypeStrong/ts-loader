import * as ts from 'typescript';
import { LoaderOptions } from './interfaces';

export function getCustomTransformers(
  loaderOptions: LoaderOptions,
  program: ts.Program
) {
  // same strategy as https://github.com/s-panferov/awesome-typescript-loader/pull/531/files
  let { getCustomTransformers: customerTransformers } = loaderOptions;
  let getCustomTransformers = Function.prototype;

  if (typeof customerTransformers === 'function') {
    getCustomTransformers = customerTransformers;
  } else if (typeof customerTransformers === 'string') {
    try {
      customerTransformers = require(customerTransformers);
    } catch (err) {
      throw new Error(
        `Failed to load customTransformers from "${loaderOptions.getCustomTransformers}": ${err.message}`
      );
    }

    if (typeof customerTransformers !== 'function') {
      throw new Error(
        `Custom transformers in "${
          loaderOptions.getCustomTransformers
        }" should export a function, got ${typeof getCustomTransformers}`
      );
    }
    getCustomTransformers = customerTransformers;
  }
  return getCustomTransformers(program);
}

/**
 * @returns a ts.CustomTransformers merged from tr1 and tr2 (does not check for duplicates)
 */
function mergeTransformers(tr1: ts.CustomTransformers | undefined, tr2: ts.CustomTransformers | undefined ):ts.CustomTransformers | undefined{
  if(tr1){
    const result:ts.CustomTransformers = {
      after : [],
      before :[],
      afterDeclarations:[]
    };
    //add tr1 values in result
    if(tr1.after){
      result.after!.push(...tr1.after);
    }
    if(tr1.before){
      result.before!.push(...tr1.before);
    }
    if(tr1.afterDeclarations){
      result.afterDeclarations!.push(...tr1.afterDeclarations);
    }

    //add tr2 values
    if(tr2?.after){
      result.after!.push(...tr2.after);
    }
    if(tr2?.before){
      result.before!.push(...tr2.before);
    }
    if(tr2?.afterDeclarations){
      result.afterDeclarations!.push(...tr2.afterDeclarations);
    }

    return result;
  }else{
    return tr2;
  }
}

/**
 * For now we need to patch typescript to force transformers passed to the program.emit function.
 * We will be able to remove this code once typescript will add customTransformers to SolutionBuilder
 * SolutionBuilder is used when watch is enabled
 */
let patched = false;
export function installTransformers(loaderOptions: LoaderOptions) {
  if (!loaderOptions.getCustomTransformers) {
    return; //no need to patch if there is no transformer
  }
  if (patched) {
    return; //do not patch twice
  }
  patched = true;
  const originalCreateProgram = ts.createProgram;

  //override createProgram in order to override emit function and use overrideTransformers
  function createProgram(
    rootNamesOrOptions: ReadonlyArray<string> | ts.CreateProgramOptions,
    options?: ts.CompilerOptions,
    host?: ts.CompilerHost,
    oldProgram?: ts.Program,
    configFileParsingDiagnostics?: ReadonlyArray<ts.Diagnostic>
  ): ts.Program {
    let program: ts.Program;
    if (Array.isArray(rootNamesOrOptions)) {
      program = originalCreateProgram(
        rootNamesOrOptions as ReadonlyArray<string>,
        options!,
        host,
        oldProgram,
        configFileParsingDiagnostics
      );
    } else {
      program = originalCreateProgram(
        rootNamesOrOptions as ts.CreateProgramOptions
      );
    }

    const transformers: ts.CustomTransformers | undefined = getCustomTransformers(loaderOptions, program);

    const originalEmit = program.emit;

    function newEmit(
      targetSourceFile?: ts.SourceFile,
      writeFile?: ts.WriteFileCallback,
      cancellationToken?: ts.CancellationToken,
      emitOnlyDtsFiles?: boolean,
      customTransformers?: ts.CustomTransformers
    ): ts.EmitResult {
      /* Invoke TS emit */
      const result: ts.EmitResult = originalEmit(
        targetSourceFile,
        writeFile,
        cancellationToken,
        emitOnlyDtsFiles,
        mergeTransformers(transformers, customTransformers)
      );

      return result;
    }

    program.emit = newEmit;

    return program;
  }

  Object.assign(ts, { createProgram });
}
