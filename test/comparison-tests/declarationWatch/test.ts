import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

jest.retryTimes(utils.TEST_RETRY_TIMES).setTimeout(utils.TEST_TIMEOUT)

test('build', (done) => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts')))
  const memfs = utils.createMemfs()

  const build = utils.runWatchBuild(memfs, compiler, {
    iteration: 2,
    directory: __dirname,
    path: 'thing.d.ts',
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
