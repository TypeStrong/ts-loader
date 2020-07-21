import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'src/index.js'))
  config.context = __dirname
  config.module.rules = [
    {
      test: /\.js$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
    },
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'src/index.js'))
  config.context = __dirname
  config.module.rules = [
    {
      test: /\.js$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
      options: {
        transpileOnly: true,
      },
    },
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})
