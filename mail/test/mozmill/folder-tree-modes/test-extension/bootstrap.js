/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);

// const addonID = "testfoldertreemode@mozilla.org";

function install() {}

function uninstall() {}

function startup(data, reason) {
  ExtensionSupport.registerWindowListener(data.id, {
    chromeURLs: ["chrome://messenger/content/messenger.xhtml"],
    onLoadWindow: setupFolderMode,
  });
}

function shutdown(data, reason) {
  ExtensionSupport.unregisterWindowListener(data.id);
}

function setupFolderMode(aWindow) {
  let testFolderTreeMode = {
    __proto__: aWindow.IFolderTreeMode,
    generateMap(aFTV) {
      var { MailServices } = ChromeUtils.import(
        "resource:///modules/MailServices.jsm"
      );
      // Pick the tinderbox@foo.invalid inbox and use it as the only folder
      let server = MailServices.accounts.FindServer(
        "tinderbox",
        "tinderbox123",
        "pop3"
      );
      let item = new aWindow.ftvItem(server.rootFolder.getChildNamed("Inbox"));
      item.__defineGetter__("children", () => []);
      return [item];
    },
  };

  aWindow.gFolderTreeView.registerFolderTreeMode(
    "testmode",
    testFolderTreeMode,
    "Test Mode"
  );
}
