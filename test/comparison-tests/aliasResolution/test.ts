import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'))
  config.resolve.alias = {
    components: path.resolve(__dirname, 'common/components'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = await utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'common/components/myComponent.ts',
  })
  for await (const stats of build) {
    const bundle = await utils.readFile(memfs, '/bundle.js')

    expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
    expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
  }
}, 10000)

test('transpile only', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true })
  config.resolve.alias = {
    components: path.resolve(__dirname, 'common/components'),
  }
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const build = await utils.runWatchBuild(memfs, compiler, {
    iteration: 1,
    directory: __dirname,
    path: 'common/components/myComponent.ts',
  })
  for await (const stats of build) {
    const bundle = await utils.readFile(memfs, '/bundle.js')

    expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
    expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
  }
}, 10000)
