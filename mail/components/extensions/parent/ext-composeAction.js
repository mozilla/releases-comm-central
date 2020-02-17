/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

ChromeUtils.defineModuleGetter(
  this,
  "ToolbarButtonAPI",
  "resource:///modules/ExtensionToolbarButtons.jsm"
);

this.composeAction = class extends ToolbarButtonAPI {
  constructor(extension) {
    super(extension, global);
    this.manifest_name = "compose_action";
    this.manifestName = "composeAction";
    this.windowURLs = [
      "chrome://messenger/content/messengercompose/messengercompose.xhtml",
    ];

    let format =
      extension.manifest.compose_action.default_area == "formattoolbar";
    this.toolboxId = format ? "FormatToolbox" : "compose-toolbox";
    this.toolbarId = format ? "FormatToolbar" : "composeToolbar2";

    if (format) {
      this.paint = this.paintFormatToolbar;
    }
  }

  paintFormatToolbar(window) {
    let { document } = window;
    if (document.getElementById(this.id)) {
      return;
    }

    let toolbar = document.getElementById(this.toolbarId);
    let button = this.makeButton(window);
    let before = toolbar.lastElementChild;
    while (before.localName == "spacer") {
      before = before.previousElementSibling;
    }
    toolbar.insertBefore(button, before.nextElementSibling);
  }

  static onUninstall(extensionId) {
    let widgetId = makeWidgetId(extensionId);
    let id = `${widgetId}-composeAction-toolbarbutton`;

    let windowURL =
      "chrome://messenger/content/messengercompose/messengercompose.xhtml";
    let currentSet = Services.xulStore.getValue(
      windowURL,
      "composeToolbar2",
      "currentset"
    );
    currentSet = currentSet.split(",");
    let index = currentSet.indexOf(id);
    if (index >= 0) {
      currentSet.splice(index, 1);
      Services.xulStore.setValue(
        windowURL,
        "composeToolbar2",
        "currentset",
        currentSet.join(",")
      );
    }
  }

  getAPI(context) {
    let { extension } = context;
    let { windowManager } = extension;

    let action = this;
    let api = super.getAPI(context);
    api.composeAction.onClicked = new EventManager({
      context,
      name: "composeAction.onClicked",
      inputHandling: true,
      register: fire => {
        let listener = (event, window) => {
          let win = windowManager.wrapWindow(window);
          fire.sync(win.activeTab.id);
        };
        action.on("click", listener);
        return () => {
          action.off("click", listener);
        };
      },
    }).api();
    return api;
  }
};
