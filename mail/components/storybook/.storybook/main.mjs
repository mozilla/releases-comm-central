/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mergeConfig, normalizePath } from "vite";
import { rewriteChromeUri } from "./chrome-uri-utils.mjs";

const projectRoot = normalizePath(
  fileURLToPath(new URL("../../../../", import.meta.url))
);

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
        {
          name: "thunderbird-modules",
          enforce: "pre",
          async resolveId(source, importer) {
            let request = source;

            if (source.startsWith("chrome://")) {
              request = rewriteChromeUri(source);

              if (!request) {
                this.error(`No Thunderbird source mapping for ${source}`);
              }
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
        // Native chrome:// CSS imports must not block async story loading.
        cssCodeSplit: false,
        rolldownOptions: { treeshake: false },
      },
    });
  },
};
