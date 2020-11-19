/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineModuleGetter(
  this,
  "ToolbarButtonAPI",
  "resource:///modules/ExtensionToolbarButtons.jsm"
);

const browserActionMap = new WeakMap();

this.browserAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return browserActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    browserActionMap.set(this.extension, this);
  }

  close() {
    super.close();
    browserActionMap.delete(this.extension);
    windowTracker.removeListener("TabSelect", this);
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-browserAction-toolbarbutton`;

    let windowURL = "chrome://messenger/content/messenger.xhtml";
    let currentSet = Services.xulStore.getValue(
      windowURL,
      "mail-bar3",
      "currentset"
    );
    currentSet = currentSet.split(",");
    let index = currentSet.indexOf(id);
    if (index >= 0) {
      currentSet.splice(index, 1);
      Services.xulStore.setValue(
        windowURL,
        "mail-bar3",
        "currentset",
        currentSet.join(",")
      );
    }
  }

  constructor(extension) {
    super(extension, global);
    this.manifest_name = "browser_action";
    this.manifestName = "browserAction";
    this.windowURLs = ["chrome://messenger/content/messenger.xhtml"];
    this.toolboxId = "mail-toolbox";
    this.toolbarId = "mail-bar3";

    windowTracker.addListener("TabSelect", this);
  }
};

global.browserActionFor = this.browserAction.for;
