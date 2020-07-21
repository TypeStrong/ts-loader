import * as path from 'path'
import * as fs from 'fs-extra'
import { PassThrough } from 'stream'
import { promisify } from 'util'
import * as webpack from 'webpack'
import { IFs, createFsFromVolume, Volume } from 'memfs'
import { LoaderOptions } from '../../src/interfaces'

const RE_STACK = /\((?:[a-zA-Z]:)?[\w-_\\\/\.]+:\d+:\d+\)/g
const RE_SIZE = /\s+\d+(?:\.\d+)?\s(?:KiB|bytes)/g
const RE_CWD = new RegExp(process.cwd().replace(/\\/g, '/'), 'g')
const RE_WINDOWS_CWD = new RegExp(process.cwd().replace(/\\/g, String.raw`\\`), 'g')
const RE_PATH = /\.[\w-_\\\/\.]+\.\w+/g
const RE_WINDOWS_PATH_SEPARATOR = /\\/g
const RE_WINDOWS_LINEBREAK = /\r\n/g
const RE_WINDOWS_LINEBREAK_LITERAL = /\\r\\n/g
const RE_TABLE_HEADER = /\s+Asset\s+Size\s+Chunks\s+Chunk\sNames/

const TABLE_HEADER = '    Asset   Size  Chunks             Chunk Names'

export function webpackConfig(entry: webpack.Configuration['entry'], options: Partial<LoaderOptions> = {}): webpack.Configuration {
  return {
    mode: 'development',
    entry,
    context: typeof entry === 'string' ? path.dirname(entry) : undefined,
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

interface WatchBuildOptions {
  iteration: number
  directory: string
  path: string
}

export async function runWatchBuild(memfs: IFs, compiler: webpack.Compiler, options: WatchBuildOptions) {
  // @ts-ignore TODO: remove this in webpack 5
  memfs.join = path.join.bind(memfs)
  compiler.outputFileSystem = memfs as IFs & { join(...paths: string[]): string }

  const stream = new PassThrough({ objectMode: true })
  let timer: NodeJS.Timer
  let lastHash = ''
  let iteration = 0

  const targetPath = path.join(options.directory, options.path)
  const originalFileContent = await fs.readFile(targetPath)

  const watcher = compiler.watch({}, async (err, stats) => {
    if (err) {
      watcher.close(() => {
        stream.end(async () => {
          await fs.writeFile(targetPath, originalFileContent)
          clearTimeout(timer)
          stream.emit('error', err)
        })
      })
      return
    }

    if (stats.hash === lastHash) {
      return
    }

    stream.write(stats)
    lastHash = stats.hash

    timer = setTimeout(async (iteration: number) => {
      if (iteration < options.iteration) {
        await fs.copyFile(path.join(options.directory, `patch${iteration}`, options.path), targetPath)
      } else {
        await fs.writeFile(targetPath, originalFileContent)
        watcher.close(() => stream.end())
      }
    }, 250, iteration)
    iteration += 1
  })

  return stream
}

export function createMemfs(): IFs {
  return createFsFromVolume(new Volume())
}

export function readFile(memfs: IFs, path: string): Promise<string> {
  // @ts-ignore
  return promisify(memfs.readFile)(path, 'utf8')
}

export function normalizeBundle(content: string | Buffer): string {
  return content.toString()
    .replace(/\\{4}/g, '\\')
    .replace(RE_WINDOWS_LINEBREAK, '\n')
    .replace(RE_WINDOWS_LINEBREAK_LITERAL, '\\n')
    .replace(RE_CWD, '.')
    .replace(RE_WINDOWS_CWD, '.')
    .replace(RE_PATH, path => path.replace(RE_WINDOWS_PATH_SEPARATOR, '/'))
    .replace(RE_STACK, '(ts-loader)')
}

export function serializeStats(stats: webpack.Stats): string {
  return stats.toString({ hash: false, version: false, timings: false, builtAt: false })
    .replace(RE_WINDOWS_LINEBREAK, '\n')
    .replace(RE_WINDOWS_LINEBREAK_LITERAL, '\\n')
    .replace(RE_CWD, '.')
    .replace(RE_WINDOWS_CWD, '.')
    .replace(RE_PATH, path => path.replace(RE_WINDOWS_PATH_SEPARATOR, '/'))
    .replace(RE_STACK, '(ts-loader)')
    .replace(RE_TABLE_HEADER, TABLE_HEADER)
    .replace(RE_SIZE, ' <size>')
}
