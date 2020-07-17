import * as path from 'path'
import * as webpack from 'webpack'
import { IFs, createFsFromVolume, Volume } from 'memfs'
import { LoaderOptions } from '../../src/interfaces'

const RE_STACK = /\((?:[a-zA-Z]:)?[\w-_\\\/\.]+:\d+:\d+\)/g
const RE_SIZE = /\d+(?:\.\d+)?\s(?:KiB|bytes)/g
const RE_CWD = new RegExp(process.cwd().replace(/\\/g, '\\\\'), 'g')
const RE_PATH = /\.[\w-_\\\/\.]+\.\w+/g
const RE_WINDOWS_PATH_SEPARATOR = /\\/g
const RE_WINDOWS_LINEBREAK = /\r\n/g
const RE_WINDOWS_LINEBREAK_LITERAL = /\\r\\n/g
const RE_TABLE_HEADER = /\s+Asset\s+Size\s+Chunks\s+Chunk\sNames/

const TABLE_HEADER = '    Asset    Size  Chunks             Chunk Names'

export function webpackConfig(entry: string, options: Partial<LoaderOptions> = {}): webpack.Configuration {
  return {
    mode: 'development',
    entry,
    output: {
      filename: 'bundle.js',
      path: '/',
    },
    resolve: {
      extensions: ['.ts', '.js']
    },
    module: {
      rules: [
        { test: /\.tsx?$/, loader: require.resolve(path.join(process.cwd(), 'dist')), options }
      ]
    }
  }
}

export function runSingleBuild(memfs: IFs, compiler: webpack.Compiler): Promise<webpack.Stats> {
  // @ts-ignore TODO: remove this in webpack 5
  memfs.join = path.join.bind(memfs)
  compiler.outputFileSystem = memfs as IFs & { join(...paths: string[]): string }

  return new Promise((resolve, reject) => {
    compiler.run((err, stats) => {
      if (err) {
        reject(err)
      } else {
        resolve(stats)
      }
    })
  })
}

export function createMemfs(): IFs {
  return createFsFromVolume(new Volume())
}

export function normalizeBundle(content: string | Buffer): string {
  return content.toString()
    .replace(/\\{4}/g, '\\')
    .replace(RE_WINDOWS_LINEBREAK, '\n')
    .replace(RE_WINDOWS_LINEBREAK_LITERAL, '\\n')
    .replace(RE_CWD, '.')
    .replace(RE_PATH, path => path.replace(RE_WINDOWS_PATH_SEPARATOR, '/'))
    .replace(RE_STACK, '(ts-loader)')
}

export function serializeStats(stats: webpack.Stats): string {
  return stats.toString({ hash: false, version: false, timings: false, builtAt: false })
    .replace(RE_WINDOWS_LINEBREAK, '\n')
    .replace(RE_WINDOWS_LINEBREAK_LITERAL, '\\n')
    .replace(RE_CWD, '.')
    .replace(RE_PATH, path => path.replace(RE_WINDOWS_PATH_SEPARATOR, '/'))
    .replace(RE_STACK, '(ts-loader)')
    .replace(RE_TABLE_HEADER, TABLE_HEADER)
    .replace(RE_SIZE, '<size>')
}
