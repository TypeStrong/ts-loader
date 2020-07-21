import * as path from 'path'
import * as webpack from 'webpack'
import * as utils from '../utils'
import { inspect } from 'util'

test('build', async () => {
  const config = utils.webpackConfig({
    a: path.join(__dirname, 'a.ts'),
    b: path.join(__dirname, 'b.ts'),
  })
  config.context = __dirname
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
  const error0 = stats.compilation.errors[0]
  const error1 = stats.compilation.errors[1]
  // correct the errors order for Windows
  if (error0 && error0.module.id.endsWith('b.ts') && error1 && error1.module.id.endsWith('a.ts')) {
    stats.compilation.errors[0] = error1
    stats.compilation.errors[1] = error0
  }

  const bundle = await utils.readFile(memfs, '/bundle.js')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const config = utils.webpackConfig({
    a: path.join(__dirname, 'a.ts'),
    b: path.join(__dirname, 'b.ts'),
  })
  config.context = __dirname
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
