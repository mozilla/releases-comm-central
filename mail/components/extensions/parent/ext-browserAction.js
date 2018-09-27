/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

ChromeUtils.defineModuleGetter(this, "ToolbarButtonAPI", "resource:///modules/ExtensionToolbarButtons.jsm");

this.browserAction = class extends ToolbarButtonAPI {
  constructor(extension) {
    super(extension);
    this.manifest_name = "browser_action";
    this.manifestName = "browserAction";
    this.windowURLs = ["chrome://messenger/content/messenger.xul"];
    this.toolboxId = "mail-toolbox";
    this.toolbarId = "mail-bar3";
  }
};
