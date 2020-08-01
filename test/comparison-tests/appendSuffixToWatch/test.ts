import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

jest.retryTimes(10).setTimeout(utils.TEST_TIMEOUT)

test('build', (done) => {
  const config = utils.webpackConfig({
    entry1: path.join(__dirname, 'entry1.ts'),
    entry2: path.join(__dirname, 'entry2.ts'),
  })
  config.context = __dirname
  config.output.filename = 'bundle.[name].js'
  config.stats = 'errors-only'
  config.module.rules = [
    {
      test: /\.(?:ts|vue)$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
      options: {
        appendTsSuffixTo: [/\.vue$/],
      }
    },
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'entry1.ts'
  })
  build.subscribe({
    next: async stats => {
      const entry1 = await utils.readFile(memfs, '/bundle.entry1.js')
      const entry2 = await utils.readFile(memfs, '/bundle.entry2.js')

      expect(utils.normalizeBundle(entry1)).toMatchSnapshot('entry1 bundle')
      expect(utils.normalizeBundle(entry2)).toMatchSnapshot('entry2 bundle')
      expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
    },
    complete: done,
    error: done,
  })
})
