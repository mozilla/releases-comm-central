/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
/* eslint-env node */

import chromeMap from "./chrome-map.mjs";
// Storybook somehow loads us in a cursed semi-mjs land where default exports
// work more like the old commonJS workaround.
const [ prefixMap, aliasMap, sourceMap ] = chromeMap.default;

export function rewriteChromeUri(uri) {
  if (uri in aliasMap) {
    return rewriteChromeUri(aliasMap[uri]);
  }
  for (let [prefix, [bundlePath]] of Object.entries(prefixMap)) {
    if (uri.startsWith(prefix)) {
      if (!bundlePath.endsWith("/")) {
        bundlePath += "/";
      }
      let relativePath = uri.slice(prefix.length);
      let objdirPath = bundlePath + relativePath;
      for (let [_objdirPath, [filePath]] of Object.entries(sourceMap)) {
        if (_objdirPath == objdirPath) {
          // We're just hoping this is the actual path =\
          return filePath;
        }
      }
    }
  }
  return "";
}
