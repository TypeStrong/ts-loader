import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

jest.retryTimes(4).setTimeout(12000)

test('build', (done) => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'))
  config.plugins = [
    new webpack.IgnorePlugin(/\.d\.ts$/),
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 2,
    directory: __dirname,
    path: 'styles.d.ts',
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
