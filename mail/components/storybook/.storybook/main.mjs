/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig, normalizePath } from "vite";
import { rewriteChromeUri } from "./chrome-uri-utils.mjs";
import { thunderbirdStyles } from "./thunderbird-styles.mjs";

const projectRoot = normalizePath(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

/**
 * Returns a native URI's source path with its query and fragment preserved.
 *
 * @param {string} uri - A chrome:// or moz-src:/// URI.
 * @returns {string} The absolute source path.
 * @throws {Error} If the chrome map does not contain the URI.
 */
function resolveNativeURI(uri) {
  const [, target, suffix] = uri.match(/^([^?#]*)(.*)$/);
  const source = target.startsWith("chrome://")
    ? rewriteChromeUri(target)
    : target.slice("moz-src:///".length);

  if (!source) {
    throw new Error(`No Thunderbird source mapping for ${uri}`);
  }

  return normalizePath(path.resolve(projectRoot, "..", source)) + suffix;
}

export default {
  stories: ["../stories/**/*.stories.@(mjs|jsx|ts|tsx)"],
  addons: [
    "@storybook/addon-docs",
    "@storybook/addon-a11y",
    fileURLToPath(import.meta.resolve("./addon-fluent/index.mjs")),
  ],
  framework: {
    name: "@storybook/web-components-vite",
    options: {},
  },
  async viteFinal(config) {
    return mergeConfig(config, {
      resolve: {
        alias: [
          { find: "mail", replacement: path.join(projectRoot, "mail") },
          { find: "comm", replacement: projectRoot },
          { find: /^moz-src:\/\/\/comm\//, replacement: projectRoot },
          // Vite only passes native URLs to our resolver when an alias matches.
          { find: /^chrome:\/\//, replacement: "chrome://" },
        ],
      },
      server: {
        fs: { allow: [path.dirname(projectRoot)] },
      },
      plugins: [
        thunderbirdStyles(resolveNativeURI),
        {
          name: "thunderbird-modules",
          enforce: "pre",
          async resolveId(source, importer) {
            let request = source;

            if (source.startsWith("chrome://")) {
              request = resolveNativeURI(source);
            }

            // Vite requires ?raw for imported HTML; Thunderbird uses type:text.
            if (
              request.endsWith(".html") &&
              importer?.startsWith(projectRoot) &&
              !importer.includes("/node_modules/")
            ) {
              request += "?raw";
            }

            if (request === source) {
              return null;
            }

            return this.resolve(request, importer, { skipSelf: true });
          },
        },
      ],
      build: {
        minify: false,
        cssMinify: false,
        rolldownOptions: { treeshake: false },
      },
    });
  },
};
