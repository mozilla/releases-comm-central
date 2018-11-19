/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

ChromeUtils.defineModuleGetter(this, "ToolbarButtonAPI", "resource:///modules/ExtensionToolbarButtons.jsm");

const browserActionMap = new WeakMap();

this.browserAction = class extends ToolbarButtonAPI {
  static for(extension) {
    return browserActionMap.get(extension);
  }

  async onManifestEntry(entryName) {
    await super.onManifestEntry(entryName);
    browserActionMap.set(this.extension, this);
  }

  onShutdown(reason) {
    super.onShutdown(reason);
    browserActionMap.delete(this.extension);
  }

  constructor(extension) {
    super(extension);
    this.manifest_name = "browser_action";
    this.manifestName = "browserAction";
    this.windowURLs = ["chrome://messenger/content/messenger.xul"];
    this.toolboxId = "mail-toolbox";
    this.toolbarId = "mail-bar3";
  }
};

global.browserActionFor = this.browserAction.for;
