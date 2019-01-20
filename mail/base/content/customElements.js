/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.import("resource://gre/modules/Services.jsm");

for (let script of [
  "chrome://chat/content/conversation-browser.js",
  "chrome://messenger/content/mailWidgets.js",
  "chrome://messenger/content/generalBindings.js",
  "chrome://messenger/content/statuspanel.js",
  "chrome://messenger/content/foldersummary.js",
]) {
  Services.scriptloader.loadSubScript(script, window);
}
