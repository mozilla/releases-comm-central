/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { parse } from "postcss";

const nativeCSSURL =
  /(@import\s+|url\(\s*)(["']?)((?:chrome:\/\/|moz-src:\/\/\/)[^\s"'()]+)\2/g;
const stylesheetLink =
  /(\.href\s*=\s*|\.setAttribute\(\s*["']href["']\s*,\s*)(["'])((?:chrome:\/\/|moz-src:\/\/\/)[^\s"']+\.css(?:[?#][^\s"']*)?)\2/g;

/**
 * Returns PostCSS options that resolve native URLs before Vite reads imports.
 *
 * @param {(uri: string) => string} resolveURI - Maps a URI to a source path.
 * @returns {import("postcss").ProcessOptions & {plugins: import("postcss").Plugin[]}}
 *   The PostCSS parser and fallback check.
 */
function cssOptions(resolveURI) {
  return {
    parser(source, options) {
      const css = String(source).replace(
        nativeCSSURL,
        (_match, prefix, _quote, uri) =>
          prefix + JSON.stringify(resolveURI(uri))
      );

      return parse(css, options);
    },
    plugins: [
      {
        postcssPlugin: "thunderbird-native-urls",
        OnceExit(root) {
          // postcss-import can retry a failed parser with the default parser.
          const [unresolved] = root.toString().matchAll(nativeCSSURL);

          if (unresolved) {
            throw root.error(
              `No Thunderbird source mapping for ${unresolved[3]}`
            );
          }
        },
      },
    ],
  };
}

/**
 * Returns a Vite plugin that serves component styles from the source tree.
 *
 * @param {(uri: string) => string} resolveURI - Maps a URI to a source path.
 * @returns {import("vite").Plugin} The Storybook stylesheet plugin.
 */
export function thunderbirdStyles(resolveURI) {
  return {
    name: "thunderbird-styles",
    enforce: "pre",
    config() {
      return { css: { postcss: cssOptions(resolveURI) } };
    },
    transform(code, id) {
      if (
        !/\.m?js$/.test(id) ||
        id.includes("/node_modules/") ||
        id.includes("/storybook/")
      ) {
        return null;
      }

      const imports = [];
      let bindingPrefix = "__thunderbirdStyle";

      while (code.includes(bindingPrefix)) {
        bindingPrefix += "_";
      }

      const rewritten = code.replace(
        stylesheetLink,
        (_match, prefix, _quote, uri) => {
          const binding = `${bindingPrefix}${imports.length}`;
          const [target, fragment] = resolveURI(uri).split("#");
          const request =
            target +
            (target.includes("?") ? "&url" : "?url") +
            (fragment ? `#${fragment}` : "");

          imports.push(`import ${binding} from ${JSON.stringify(request)};`);

          return prefix + binding;
        }
      );

      if (!imports.length) {
        return null;
      }

      return { code: imports.join("\n") + "\n" + rewritten, map: null };
    },
  };
}
