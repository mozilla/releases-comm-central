/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* eslint-env node */

const path = require("path");
const webpack = require("webpack");
const rewriteChromeUri = require("./chrome-uri-utils.js");

// ./mach environment --format json
// topobjdir should be the build location

module.exports = {
  stories: [
    "../stories/**/*.stories.mdx",
    "../stories/**/*.stories.@(mjs|jsx|ts|tsx)",
  ],
  addons: [
    "@storybook/addon-links",
    "@storybook/addon-essentials",
    "@storybook/addon-a11y"
  ],
  framework: "@storybook/web-components",
  webpackFinal: async (config, { configType }) => {
    // `configType` has a value of 'DEVELOPMENT' or 'PRODUCTION'
    // You can change the configuration based on that.
    // 'PRODUCTION' is used when building the static version of storybook.

    // Make whatever fine-grained changes you need
    const projectRoot = path.resolve(__dirname, "../../../../");
    config.resolve.alias.mail = `${projectRoot}/mail`;
    config.resolve.alias.comm = projectRoot;

    config.plugins.push(
      // Rewrite chrome:// URI imports to file system paths.
      new webpack.NormalModuleReplacementPlugin(/^chrome:\/\//, resource => {
        resource.request = rewriteChromeUri(resource.request);
      })
    );

    config.module.rules.push({
      test: /\.ftl$/,
      type: "asset/source",
    });

    config.optimization = {
      splitChunks: false,
      runtimeChunk: false,
      sideEffects: false,
      usedExports: false,
      concatenateModules: false,
      minimizer: [],
    };

    // Return the altered config
    return config;
  },
  core: {
    builder: "webpack5",
  },
};
