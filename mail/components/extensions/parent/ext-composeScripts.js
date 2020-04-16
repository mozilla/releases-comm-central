/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
"use strict";

var { ExtensionSupport } = ChromeUtils.import(
  "resource:///modules/ExtensionSupport.jsm"
);
var { ExtensionUtils } = ChromeUtils.import(
  "resource://gre/modules/ExtensionUtils.jsm"
);

var { ExtensionError, getUniqueId } = ExtensionUtils;

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
      script.addToWindow(window);
    }
  },
});

/**
 * Represents (in the main browser process) a compose script registered
 * programmatically (instead of being included in the addon manifest).
 *
 * @param {ProxyContextParent} context
 *        The parent proxy context related to the extension context which
 *        has registered the compose script.
 * @param {RegisteredComposeScriptOptions} details
 *        The options object related to the registered compose script
 *        (which has the properties described in the compose_scripts.json
 *        JSON API schema file).
 */
class ComposeScriptParent {
  constructor({ context, details }) {
    this.context = context;
    this.scriptId = getUniqueId();

    this.options = this._convertOptions(details);
    context.callOnClose(this);

    for (let window of Services.wm.getEnumerator("msgcompose")) {
      this.addToWindow(window);
    }
    scripts.add(this);
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) {
      throw new Error("Unable to destroy ComposeScriptParent twice");
    }

    scripts.delete(this);
    for (let window of Services.wm.getEnumerator("msgcompose")) {
      this.removeFromWindow(window);
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

  async addToWindow(window) {
    let tabWrapper = this.context.extension.tabManager.getWrapper(window);
    for (let css of this.options.css) {
      await tabWrapper.insertCSS(this.context, css);
    }
    for (let js of this.options.js) {
      await tabWrapper.executeScript(this.context, js);
    }
    window.dispatchEvent(new window.CustomEvent("compose-scripts-added"));
  }

  removeFromWindow(window) {
    let tabWrapper = this.context.extension.tabManager.getWrapper(window);
    for (let css of this.options.css) {
      tabWrapper.removeCSS(this.context, css);
    }
  }
}

this.composeScripts = class extends ExtensionAPI {
  getAPI(context) {
    // Map of the compose script registered from the extension context.
    //
    // Map<scriptId -> ComposeScriptParent>
    const parentScriptsMap = new Map();

    // Unregister all the scriptId related to a context when it is closed.
    context.callOnClose({
      close() {
        for (let composeScript of parentScriptsMap.values()) {
          composeScript.destroy();
        }
        parentScriptsMap.clear();
      },
    });

    return {
      composeScripts: {
        async register(details) {
          const composeScript = new ComposeScriptParent({ context, details });
          const { scriptId } = composeScript;

          parentScriptsMap.set(scriptId, composeScript);
          return scriptId;
        },

        // This method is not available to the extension code, the extension code
        // doesn't have access to the internally used scriptId, on the contrary
        // the extension code will call script.unregister on the script API object
        // that is resolved from the register API method returned promise.
        async unregister(scriptId) {
          const composeScript = parentScriptsMap.get(scriptId);
          if (!composeScript) {
            Cu.reportError(new Error(`No such compose script ID: ${scriptId}`));

            return;
          }

          parentScriptsMap.delete(scriptId);
          composeScript.destroy();
        },
      },
    };
  }
};
