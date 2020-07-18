import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts')))
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')
  const bundle0 = await utils.readFile(memfs, '/0.bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.normalizeBundle(bundle0)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true }))
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')
  const bundle0 = await utils.readFile(memfs, '/0.bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.normalizeBundle(bundle0)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})
