/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPService"];

/**
 * @implements {nsILDAPService}
 */
class LDAPService {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPService"]);

  createFilter(maxSize, pattern, prefix, suffix, attr, value) {
    const words = value.split(" ");
    // Get the Mth to Nth words.
    function getMtoN(m, n) {
      n = n || m;
      return words.slice(m - 1, n).join(" ");
    }

    let filter = prefix;
    pattern.replaceAll("%a", attr);
    while (pattern) {
      const index = pattern.indexOf("%v");
      if (index == -1) {
        filter += pattern;
        pattern = "";
      } else {
        filter += pattern.slice(0, index);
        // Get the three characters after %v.
        const [c1, c2, c3] = pattern.slice(index + 2, index + 5);
        if (c1 >= "1" && c1 <= "9") {
          if (c2 == "$") {
            // %v$: means the last word
            filter += getMtoN(words.length);
            pattern = pattern.slice(index + 3);
          } else if (c2 == "-") {
            if (c3 >= "1" && c3 <= "9") {
              // %vM-N: means from the Mth to the Nth word
              filter += getMtoN(c1, c3);
              pattern = pattern.slice(index + 5);
            } else {
              // %vN-: means from the Nth to the last word
              filter += getMtoN(c1, words.length);
              pattern = pattern.slice(index + 4);
            }
          } else {
            // %vN: means the Nth word
            filter += getMtoN(c1);
            pattern = pattern.slice(index + 3);
          }
        } else {
          // %v: means the entire search value
          filter += value;
          pattern = pattern.slice(index + 2);
        }
      }
    }
    filter += suffix;
    return filter.length > maxSize ? "" : filter;
  }
}

LDAPService.prototype.classID = Components.ID(
  "{e8b59b32-f83f-4d5f-8eb5-e3c1e5de0d47}"
);
