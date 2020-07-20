import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts')))
  const memfs = utils.createMemfs()

  const build = await utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'app.ts',
  })
  for await (const stats of build) {
    const bundle = await utils.readFile(memfs, '/bundle.js')

    expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
    expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
  }
}, 10000)

test('transpile only', async () => {
  const compiler = webpack(utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true }))
  const memfs = utils.createMemfs()

  const build = await utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'app.ts',
  })
  for await (const stats of build) {
    const bundle = await utils.readFile(memfs, '/bundle.js')

    expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
    expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
  }
}, 10000)
