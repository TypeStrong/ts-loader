import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

jest.retryTimes(4).setTimeout(12000)

test('build', (done) => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'))
  config.resolve.alias = {
    components: path.resolve(__dirname, 'common/components'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'common/components/myComponent.ts',
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
    components: path.resolve(__dirname, 'common/components'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'common/components/myComponent.ts',
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
