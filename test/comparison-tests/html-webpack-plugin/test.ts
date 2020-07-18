import * as path from 'path'
import * as webpack from 'webpack'
import * as HtmlWebpackPlugin from 'html-webpack-plugin'
import * as utils from '../utils'

const HtmlWebpackPlugin = require('html-webpack-plugin')

test('build', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'))
  config.plugins = [
    new HtmlWebpackPlugin({
      inject: true,
      template: path.join(__dirname, 'index.html'),
    })
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')
  const html = await utils.readFile(memfs, '/index.html')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(html).toMatchSnapshot('html')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})

test('transpile only', async () => {
  const config = utils.webpackConfig(path.join(__dirname, 'app.ts'), { transpileOnly: true })
  config.plugins = [
    new HtmlWebpackPlugin({
      inject: true,
      template: path.join(__dirname, 'index.html'),
    })
  ]
  const compiler = webpack(config)
  const memfs = utils.createMemfs()

  const stats = await utils.runSingleBuild(memfs, compiler)
  const bundle = await utils.readFile(memfs, '/bundle.js')
  const html = await utils.readFile(memfs, '/index.html')

  expect(utils.normalizeBundle(bundle)).toMatchSnapshot('bundle')
  expect(html).toMatchSnapshot('html')
  expect(utils.serializeStats(stats)).toMatchSnapshot('stats')
})
