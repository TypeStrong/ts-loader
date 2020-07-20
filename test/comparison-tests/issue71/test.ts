import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts')))
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})