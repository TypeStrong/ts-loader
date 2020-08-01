import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

const TEST_TIMEOUT = 60000

jest.retryTimes(10).setTimeout(TEST_TIMEOUT)

test('build', (done) => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'))
  config.resolve.alias = {
    externalLib: path.join(__dirname, './lib/externalLib.js'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 2,
    directory: __dirname,
    path: 'app.ts',
    timeout: TEST_TIMEOUT,
  })
  build.subscribe({
    next: async stats => {
      const bundle = await utils.readFile(memfs, '/bundle.js')

      expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
      expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
    },
    complete: done,
    error: done,
  })
})

test('transpile only', (done) => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true })
  config.resolve.alias = {
    externalLib: path.join(__dirname, './lib/externalLib.js'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 2,
    directory: __dirname,
    path: 'app.ts',
    timeout: TEST_TIMEOUT,
  })
  build.subscribe({
    next: async stats => {
      const bundle = await utils.readFile(memfs, '/bundle.js')

      expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
      expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
    },
    complete: done,
    error: done,
  })
})
