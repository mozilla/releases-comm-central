/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { ExtensionUtils } = ChromeUtils.import(
  "resource://gre/modules/ExtensionUtils.jsm"
);

var { getUniqueId } = ExtensionUtils;

let scripts = new Set();

ExtensionSupport.registerWindowListener("ext-composeScripts", {
  chromeURLs: [
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
  ],
  onLoadWindow: async window => {
    await new Promise(resolve =>
      window.addEventListener("compose-editor-ready", resolve, { once: true })
    );
    for (let script of scripts) {
      script.addToWindow(window, "compose");
    }
  },
});

ExtensionSupport.registerWindowListener("ext-messageDisplayScripts", {
  chromeURLs: [
    "chrome://messenger/content/messenger.xhtml",
    "chrome://messenger/content/messageWindow.xhtml",
  ],
  onLoadWindow(window) {
    window.addEventListener("MsgLoaded", () => {
      for (let script of scripts) {
        script.addToWindow(window, "messageDisplay");
      }
    });
  },
});

/**
 * Represents (in the main browser process) a script registered
 * programmatically (instead of being included in the addon manifest).
 *
 * @param {ProxyContextParent} context
 *        The parent proxy context related to the extension context which
 *        has registered the script.
 * @param {RegisteredScriptOptions} details
 *        The options object related to the registered script
 *        (which has the properties described in the extensionScripts.json
 *        JSON API schema file).
 */
class ExtensionScriptParent {
  constructor(type, context, details) {
    this.type = type;
    this.context = context;
    this.extension = context.extension;
    this.scriptId = getUniqueId();

    this.options = this._convertOptions(details);
    context.callOnClose(this);

    if (this.type == "compose") {
      for (let window of Services.wm.getEnumerator("msgcompose")) {
        this.addToWindow(window, "compose");
      }
    } else {
      for (let window of Services.wm.getEnumerator("mail:3pane")) {
        this.addToWindow(window, "messageDisplay");
      }
      for (let window of Services.wm.getEnumerator("mail:messageWindow")) {
        this.addToWindow(window, "messageDisplay");
      }
    }
    scripts.add(this);
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) {
      throw new Error("Unable to destroy ExtensionScriptParent twice");
    }

    scripts.delete(this);
    if (this.type == "compose") {
      for (let window of Services.wm.getEnumerator("msgcompose")) {
        this.removeFromWindow(window);
      }
    } else {
      for (let window of Services.wm.getEnumerator("mail:3pane")) {
        this.removeFromWindow(window);
      }
      for (let window of Services.wm.getEnumerator("mail:messageWindow")) {
        this.removeFromWindow(window);
      }
    }

    this.destroyed = true;
    this.context.forgetOnClose(this);
    this.context = null;
    this.options = null;
  }

  _convertOptions(details) {
    const options = {
      js: [],
      css: [],
    };

    if (details.js && details.js.length) {
      options.js = details.js.map(data => {
        return {
          code: data.code || null,
          file: data.file || null,
        };
      });
    }

    if (details.css && details.css.length) {
      options.css = details.css.map(data => {
        return {
          code: data.code || null,
          file: data.file || null,
        };
      });
    }

    return options;
  }

  async addToWindow(window, type) {
    if (this.type != type) {
      return;
    }

    let { activeTab } = this.extension.windowManager.wrapWindow(window);
    let activeURL = activeTab.browser?.currentURI;

    if (type == "compose" && activeURL.spec != "about:blank?compose") {
      return;
    }
    if (
      type == "messageDisplay" &&
      !["imap", "mailbox", "news"].includes(activeURL.scheme)
    ) {
      return;
    }

    for (let css of this.options.css) {
      await activeTab.insertCSS(this.context, css);
    }
    for (let js of this.options.js) {
      await activeTab.executeScript(this.context, js);
    }
    window.dispatchEvent(new window.CustomEvent("extension-scripts-added"));
  }

  removeFromWindow(window) {
    let { activeTab } = this.extension.windowManager.wrapWindow(window);

    for (let css of this.options.css) {
      activeTab.removeCSS(this.context, css);
    }
  }
}

this.extensionScripts = class extends ExtensionAPI {
  getAPI(context) {
    // Map of the script registered from the extension context.
    //
    // Map<scriptId -> ExtensionScriptParent>
    const parentScriptsMap = new Map();

    // Unregister all the scriptId related to a context when it is closed.
    context.callOnClose({
      close() {
        for (let script of parentScriptsMap.values()) {
          script.destroy();
        }
        parentScriptsMap.clear();
      },
    });

    return {
      extensionScripts: {
        async register(type, details) {
          const script = new ExtensionScriptParent(type, context, details);
          const { scriptId } = script;

          parentScriptsMap.set(scriptId, script);
          return scriptId;
        },

        // This method is not available to the extension code, the extension code
        // doesn't have access to the internally used scriptId, on the contrary
        // the extension code will call script.unregister on the script API object
        // that is resolved from the register API method returned promise.
        async unregister(scriptId) {
          const script = parentScriptsMap.get(scriptId);
          if (!script) {
            Cu.reportError(new Error(`No such script ID: ${scriptId}`));

            return;
          }

          parentScriptsMap.delete(scriptId);
          script.destroy();
        },
      },
    };
  }
};
