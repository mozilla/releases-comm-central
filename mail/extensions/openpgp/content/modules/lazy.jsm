/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailLazy"];


var EnigmailLazy = {
  loader: function(component, name) {
    let holder = null;
    return function() {
      if (holder === null) {
        component = component.replace(/^enigmail\//, "");
        let url;
        try {
          url = "chrome://openpgp/content/modules/" + component;
          const into = ChromeUtils.import(url);
          holder = into[name];
        } catch (ex) {
          console.log(ex);
          console.log("lazy loading couldn't get " + url);
        }
      }
      return holder;
    };
  }
};
