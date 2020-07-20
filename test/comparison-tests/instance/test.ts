import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'

test('build', async () => {
  const config = utils.webpackConfig({
    a: path.join(__dirname, 'a.ts'),
    b: path.join(__dirname, 'b.ts'),
  })
  config.module.rules = [
    {
      test: /a\.ts$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
    },
    {
      test: /b\.ts$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
      options: {
        instance: 'different',
      }
    }
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const config = utils.webpackConfig({
    a: path.join(__dirname, 'a.ts'),
    b: path.join(__dirname, 'b.ts'),
  })
  config.module.rules = [
    {
      test: /a\.ts$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
      options: {
        transpileOnly: true,
      },
    },
    {
      test: /b\.ts$/,
      loader: require.resolve(path.join(process.cwd(), 'dist')),
      options: {
        instance: 'different',
        transpileOnly: true,
      }
    }
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})
