/* -*- Mode: indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* vim: set sts=2 sw=2 et tw=80: */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { ExtensionSupport } = ChromeUtils.importESModule(
  "resource:///modules/ExtensionSupport.sys.mjs"
);
var { ExtensionUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionUtils.sys.mjs"
);

var { getUniqueId } = ExtensionUtils;

const scripts = new Set();

ExtensionSupport.registerWindowListener("ext-composeScripts", {
  chromeURLs: [
    "chrome://messenger/content/messengercompose/messengercompose.xhtml",
  ],
  onLoadWindow: async win => {
    // The editor is not loading any content but just about:blank, so its
    // readyState is "complete" already when we get here. The editor is modified
    // according to the provided properties (reply, draft etc.) afterwards. The
    // injection point "document_start" would be a good fit here directly, but it
    // currently fails in ExtensionContent.sys.mjs, where the child actor does not
    // find the editor window:
    //   https://searchfox.org/mozilla-central/rev/fb2ad9ca7150890da5cadc458acdd10c87fd9a12/toolkit/components/extensions/ExtensionContent.sys.mjs#1245)
    // Calls to script.executeInWindow() succeed only after waiting for the
    // compose-editor-ready event.
    await new Promise(resolve =>
      win.addEventListener("compose-editor-ready", resolve, { once: true })
    );
    // Even after this point, the document could be modified by the compose API.
    // We currently do not have a notification once *all* modifications to the
    // editor are done. And it is probably difficult to get right.
    for (const script of scripts) {
      if (script.type == "compose") {
        script.executeInWindow(
          win,
          script.extension.tabManager.getWrapper(win)
        );
      }
    }
  },
});

ExtensionSupport.registerWindowListener("ext-messageDisplayScripts", {
  chromeURLs: [
    "chrome://messenger/content/messageWindow.xhtml",
    "chrome://messenger/content/messenger.xhtml",
  ],
  onLoadWindow(win) {
    win.addEventListener("MsgLoading", event => {
      // `event.target` is an about:message window.
      const nativeTab = event.target.tabOrWindow;
      for (const script of scripts) {
        if (script.type == "messageDisplay") {
          // Each script will be injected according to its runAt value.
          script.executeInWindow(
            win,
            script.extension.tabManager.wrapTab(nativeTab)
          );
        }
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

    scripts.add(this);
  }

  close() {
    this.destroy();
  }

  destroy() {
    if (this.destroyed) {
      throw new ExtensionError("Unable to destroy ExtensionScriptParent twice");
    }

    scripts.delete(this);

    this.destroyed = true;
    this.context.forgetOnClose(this);
    this.context = null;
    this.options = null;
  }

  _convertOptions(details) {
    const options = {
      js: [],
      css: [],
      runAt: details?.runAt ?? "document_idle",
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

  async executeInWindow(window, tab) {
    for (const css of this.options.css) {
      await tab.insertCSS(this.context, {
        ...css,
        frameId: null,
        runAt: this.options.runAt,
      });
    }
    for (const js of this.options.js) {
      await tab.executeScript(this.context, {
        ...js,
        frameId: null,
        runAt: this.options.runAt,
      });
    }
    window.dispatchEvent(
      new window.CustomEvent("extension-scripts-added", {
        detail: { runAt: this.options.runAt },
      })
    );
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
        for (const script of parentScriptsMap.values()) {
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
            console.error(new ExtensionError(`No such script ID: ${scriptId}`));

            return;
          }

          parentScriptsMap.delete(scriptId);
          script.destroy();
        },
      },
    };
  }
};
