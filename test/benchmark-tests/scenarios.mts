import fs from 'node:fs';
import path from 'node:path';
import webpack from 'webpack';
import type { Configuration, Stats } from 'webpack';

interface BuildWebpackConfigOptions {
  fixtureDir: string;
  tsconfigPath: string;
  entryFile: string;
  tsLoaderRoot: string;
  transpileOnly: boolean;
  outputPath: string;
}

export function buildWebpackConfig({
  fixtureDir,
  tsconfigPath,
  entryFile,
  tsLoaderRoot,
  transpileOnly,
  outputPath,
}: BuildWebpackConfigOptions): Configuration {
  return {
    mode: 'development',
    context: fixtureDir,
    entry: entryFile,
    output: { path: outputPath, filename: 'bundle.js' },
    resolve: { extensions: ['.ts', '.js'] },
    module: {
      rules: [
        {
          test: /\.ts$/,
          loader: 'ts-loader',
          options: { transpileOnly, configFile: tsconfigPath },
        },
      ],
    },
    // Same pattern used by test/execution-tests/*/webpack.config.js: point
    // the loader resolution at a specific ts-loader checkout's entry point
    // (which itself requires ./dist), so the same fixture can be compiled
    // against two different builds without touching node_modules.
    resolveLoader: {
      alias: { 'ts-loader': path.join(tsLoaderRoot, 'index.js') },
    },
    stats: 'errors-only',
    infrastructureLogging: { level: 'error' },
  };
}

function statsError(stats: Stats): Error {
  return new Error(stats.toString({ preset: 'errors-only' }));
}

/**
 * Runs a single non-watch compile and returns its wall-clock duration in ms.
 * A fresh `webpack(config)` call gets a fresh compiler instance, and
 * ts-loader's instance cache is keyed on the compiler (see
 * src/instance-cache.ts), so this is a genuinely cold build each time.
 */
export function runColdBuild(config: Configuration): Promise<number> {
  return new Promise((resolve, reject) => {
    // webpack() only returns null when called with a callback (async form);
    // called with just a config, it always returns a Compiler synchronously.
    const compiler = webpack(config)!;
    const start = process.hrtime.bigint();
    compiler.run((err, stats) => {
      const end = process.hrtime.bigint();
      compiler.close(() => {
        if (err) return reject(err);
        if (stats?.hasErrors()) return reject(statsError(stats));
        resolve(Number(end - start) / 1e6);
      });
    });
  });
}

export interface WatchSession {
  nextCompile(): Promise<number>;
  close(): Promise<void>;
}

interface Waiter {
  resolve: (ms: number) => void;
  reject: (err: Error) => void;
  start: bigint;
}

/**
 * Starts webpack in watch mode and resolves once the first compile
 * completes, with a `nextCompile()`/`close()` API for timing subsequent
 * incremental rebuilds against the same long-lived compiler - matching how
 * ts-loader actually behaves across a real watch session.
 */
export function createWatchSession(config: Configuration): Promise<WatchSession> {
  return new Promise((resolveReady, rejectReady) => {
    let ready = false;
    let waiter: Waiter | null = null;
    // webpack() only returns null when called with a callback (async form);
    // called with just a config, it always returns a Compiler synchronously.
    const compiler = webpack(config)!;
    const watching = compiler.watch({ aggregateTimeout: 100 }, (err, stats) => {
      const error = err || (stats && stats.hasErrors() ? statsError(stats) : null);
      if (!ready) {
        ready = true;
        if (error) return rejectReady(error);
        return resolveReady({
          nextCompile() {
            return new Promise((resolve, reject) => {
              waiter = { resolve, reject, start: process.hrtime.bigint() };
            });
          },
          close() {
            return new Promise<void>((resolve) => watching.close(() => resolve()));
          },
        });
      }
      if (!waiter) return;
      const { resolve, reject, start } = waiter;
      waiter = null;
      if (error) return reject(error);
      resolve(Number(process.hrtime.bigint() - start) / 1e6);
    });
  });
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${ms}ms waiting for ${label}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** Overwrites a fixture file with its original content plus a marker line, so re-touching never leaves stale duplicate declarations behind. */
export function touchFile(filePath: string, originalContent: string, iteration: number): void {
  fs.writeFileSync(filePath, `${originalContent}\nexport const __benchmarkTouch = ${iteration};\n`);
}
