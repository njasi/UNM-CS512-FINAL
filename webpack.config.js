const path = require("path");
const TerserPlugin = require("terser-webpack-plugin");

module.exports = {
  mode: "development",
  entry: "./src/index.js",
  output: {
    filename: "bundle.js",
    path: path.resolve(__dirname, "dist"),
    publicPath: "/dist/",
    hotUpdateChunkFilename: 'hot/hot-update.js',
    hotUpdateMainFilename: 'hot/hot-update.json'
  },
  devServer: {
    static: {
      directory: path.resolve(__dirname),
      watch: {
        ignored: /dist/,
      },
    },

    devMiddleware: {
      writeToDisk: true,
    },

    hot: true,
    liveReload: true,
    compress: true,
    port: 8080,
    open: false,
  },
  optimization: {
    minimize: true,
    minimizer: [
      new TerserPlugin({
        terserOptions: {
          keep_classnames: true,
        },
      }),
    ],
  },
};
