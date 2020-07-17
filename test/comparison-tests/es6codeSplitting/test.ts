import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts')))
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = memfs.readFileSync('/bundle.js', 'utf8')
  const bundle0 = memfs.readFileSync('/0.bundle.js', 'utf8')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.normalizeBundle(bundle0)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true }))
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = memfs.readFileSync('/bundle.js', 'utf8')
  const bundle0 = memfs.readFileSync('/0.bundle.js', 'utf8')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.normalizeBundle(bundle0)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})
