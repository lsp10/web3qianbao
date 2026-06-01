const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
  entry: {
    background: './src/background/index.js',
    'content-script': './src/content/content-script.js',
    inpage: './src/inpage/inpage.js',
    popup: './src/popup/popup.js',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  resolve: {
    fallback: {
      // ethers.js v6 is designed to work in browsers without polyfills
    },
  },
  plugins: [
    new CopyWebpackPlugin({
      patterns: [
        { from: 'manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup.html' },
        { from: 'src/popup/popup.css', to: 'popup.css' },
        { from: 'assets/icons', to: 'icons' },
      ],
    }),
  ],
  // Manifest V3 service workers don't support eval
  devtool: 'source-map',
};
