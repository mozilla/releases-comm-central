/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

// This is loaded into chrome windows with the subscript loader. Wrap in
// a block to prevent accidentally leaking globals onto `window`.
(() => {
const {Services} = ChromeUtils.import("resource://gre/modules/Services.jsm");

const isDummyDocument = document.documentURI == "chrome://extensions/content/dummy.xul";
if (!isDummyDocument) {
  for (let script of [
    "chrome://chat/content/conversation-browser.js",
    "chrome://messenger/content/mailWidgets.js",
    "chrome://messenger/content/generalBindings.js",
    "chrome://messenger/content/statuspanel.js",
    "chrome://messenger/content/foldersummary.js",
  ]) {
    Services.scriptloader.loadSubScript(script, window);
  }
}
})();
