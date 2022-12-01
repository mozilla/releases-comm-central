/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The ext-* files are imported into the same scopes.
/* import-globals-from ext-mail.js */

this.windows = class extends ExtensionAPIPersistent {
  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    for (let window of Services.wm.getEnumerator("mail:extensionPopup")) {
      let uri = window.browser.browsingContext.currentURI;
      if (uri.scheme == "moz-extension" && uri.host == this.extension.uuid) {
        window.close();
      }
    }
  }

  windowEventRegistrar({ windowEvent, listener }) {
    let { extension } = this;
    return ({ context, fire }) => {
      let listener2 = async (window, ...args) => {
        if (!extension.canAccessWindow(window)) {
          return;
        }
        if (fire.wakeup) {
          await fire.wakeup();
        }
        listener({ context, fire, window }, ...args);
      };
      windowTracker.addListener(windowEvent, listener2);
      return {
        unregister() {
          windowTracker.removeListener(windowEvent, listener2);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    };
  }

  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called) (handled by windowEventRegistrar).

    onCreated: this.windowEventRegistrar({
      windowEvent: "domwindowopened",
      listener: ({ context, fire, window }) => {
        fire.async(this.extension.windowManager.convert(window));
      },
    }),

    onRemoved: this.windowEventRegistrar({
      windowEvent: "domwindowclosed",
      listener: ({ context, fire, window }) => {
        fire.async(windowTracker.getId(window));
      },
    }),

    onFocusChanged({ context, fire }) {
      let { extension } = this;
      // Keep track of the last windowId used to fire an onFocusChanged event
      let lastOnFocusChangedWindowId;
      let scheduledEvents = [];

      let listener = async event => {
        // Wait a tick to avoid firing a superfluous WINDOW_ID_NONE
        // event when switching focus between two Thunderbird windows.
        // Note: This is not working for Linux, where we still get the -1
        await Promise.resolve();

        let windowId = WindowBase.WINDOW_ID_NONE;
        let window = Services.focus.activeWindow;
        if (window) {
          if (!extension.canAccessWindow(window)) {
            return;
          }
          windowId = windowTracker.getId(window);
        }

        // Using a FIFO to keep order of events, in case the last one
        // gets through without being placed on the async callback stack.
        scheduledEvents.push(windowId);
        if (fire.wakeup) {
          await fire.wakeup();
        }
        let scheduledWindowId = scheduledEvents.shift();

        if (scheduledWindowId !== lastOnFocusChangedWindowId) {
          lastOnFocusChangedWindowId = scheduledWindowId;
          fire.async(scheduledWindowId);
        }
      };
      windowTracker.addListener("focus", listener);
      windowTracker.addListener("blur", listener);
      return {
        unregister() {
          windowTracker.removeListener("focus", listener);
          windowTracker.removeListener("blur", listener);
        },
        convert(newFire, extContext) {
          fire = newFire;
          context = extContext;
        },
      };
    },
  };

  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;

    return {
      windows: {
        onCreated: new EventManager({
          context,
          module: "windows",
          event: "onCreated",
          extensionApi: this,
        }).api(),

        onRemoved: new EventManager({
          context,
          module: "windows",
          event: "onRemoved",
          extensionApi: this,
        }).api(),

        onFocusChanged: new EventManager({
          context,
          module: "windows",
          event: "onFocusChanged",
          extensionApi: this,
        }).api(),

        get(windowId, getInfo) {
          let window = windowTracker.getWindow(windowId, context);
          if (!window) {
            return Promise.reject({
              message: `Invalid window ID: ${windowId}`,
            });
          }
          return Promise.resolve(windowManager.convert(window, getInfo));
        },

        async getCurrent(getInfo) {
          let window = context.currentWindow || windowTracker.topWindow;
          if (window.document.readyState != "complete") {
            await new Promise(resolve =>
              window.addEventListener("load", resolve, { once: true })
            );
          }
          return windowManager.convert(window, getInfo);
        },

        async getLastFocused(getInfo) {
          let window = windowTracker.topWindow;
          if (window.document.readyState != "complete") {
            await new Promise(resolve =>
              window.addEventListener("load", resolve, { once: true })
            );
          }
          return windowManager.convert(window, getInfo);
        },

        getAll(getInfo) {
          let doNotCheckTypes = !getInfo || !getInfo.windowTypes;

          let windows = Array.from(windowManager.getAll(), win =>
            win.convert(getInfo)
          ).filter(
            win => doNotCheckTypes || getInfo.windowTypes.includes(win.type)
          );
          return Promise.resolve(windows);
        },

        create(createData) {
          let needResize =
            createData.left !== null ||
            createData.top !== null ||
            createData.width !== null ||
            createData.height !== null;

          if (needResize) {
            if (createData.state && createData.state != "normal") {
              return Promise.reject({
                message: `"state": "${createData.state}" may not be combined with "left", "top", "width", or "height"`,
              });
            }
            createData.state = "normal";
          }

          let createWindowArgs = (urls, allowScriptsToClose = false) => {
            let args = Cc["@mozilla.org/array;1"].createInstance(
              Ci.nsIMutableArray
            );
            let actionData = {
              action: "open",
              allowScriptsToClose,
              tabs: urls.map(url => ({
                tabType: "contentTab",
                tabParams: { url },
              })),
            };
            actionData.wrappedJSObject = actionData;
            args.appendElement(null);
            args.appendElement(actionData);
            return args;
          };

          let window;
          let wantNormalWindow =
            createData.type === null || createData.type == "normal";
          let features = ["chrome"];
          if (wantNormalWindow) {
            features.push("dialog=no", "all", "status", "toolbar");

            if (createData.incognito) {
              // A private mode mail window isn't useful for Thunderbird
              return Promise.reject({
                message:
                  "`incognito` is currently not supported for normal windows",
              });
            }
          } else {
            // All other types create "popup"-type windows by default.
            features.push(
              "dialog",
              "resizable",
              "minimizable",
              "centerscreen",
              "titlebar",
              "close"
            );

            if (createData.incognito) {
              features.push("private");
            }
          }

          let windowURL = wantNormalWindow
            ? "chrome://messenger/content/messenger.xhtml"
            : "chrome://messenger/content/extensionPopup.xhtml";
          if (createData.tabId) {
            if (createData.url) {
              return Promise.reject({
                message: "`tabId` may not be used in conjunction with `url`",
              });
            }

            if (createData.allowScriptsToClose) {
              return Promise.reject({
                message:
                  "`tabId` may not be used in conjunction with `allowScriptsToClose`",
              });
            }

            let nativeTabInfo = tabTracker.getTab(createData.tabId);
            let tabmail = getTabBrowser(
              nativeTabInfo
            ).ownerDocument.getElementById("tabmail");
            let targetType = wantNormalWindow ? null : "popup";
            window = tabmail.replaceTabWithWindow(nativeTabInfo, targetType)[0];
          } else if (createData.url) {
            let uris = Array.isArray(createData.url)
              ? createData.url
              : [createData.url];
            let args = createWindowArgs(uris, createData.allowScriptsToClose);
            window = Services.ww.openWindow(
              null,
              windowURL,
              "_blank",
              features.join(","),
              args
            );
          } else {
            let args = null;
            if (!wantNormalWindow) {
              args = createWindowArgs(
                ["about:blank"],
                createData.allowScriptsToClose
              );
            }
            window = Services.ww.openWindow(
              null,
              windowURL,
              "_blank",
              features.join(","),
              args
            );
          }

          let win = windowManager.getWrapper(window);
          win.updateGeometry(createData);

          // TODO: focused, type

          return new Promise(resolve => {
            window.addEventListener(
              "load",
              () => {
                resolve();
              },
              { once: true }
            );
          }).then(() => {
            if (
              [
                "minimized",
                "fullscreen",
                "docked",
                "normal",
                "maximized",
              ].includes(createData.state)
            ) {
              win.state = createData.state;
            }
            if (createData.titlePreface !== null) {
              win.setTitlePreface(createData.titlePreface);
            }
            return win.convert({ populate: true });
          });
        },

        update(windowId, updateInfo) {
          if (updateInfo.state && updateInfo.state != "normal") {
            if (
              updateInfo.left !== null ||
              updateInfo.top !== null ||
              updateInfo.width !== null ||
              updateInfo.height !== null
            ) {
              return Promise.reject({
                message: `"state": "${updateInfo.state}" may not be combined with "left", "top", "width", or "height"`,
              });
            }
          }

          let win = windowManager.get(windowId, context);
          if (updateInfo.focused) {
            win.window.focus();
          }

          if (updateInfo.state) {
            win.state = updateInfo.state;
          }

          if (updateInfo.drawAttention) {
            // Bug 1257497 - Firefox can't cancel attention actions.
            win.window.getAttention();
          }

          win.updateGeometry(updateInfo);

          if (updateInfo.titlePreface !== null) {
            win.setTitlePreface(updateInfo.titlePreface);
            if (win instanceof TabmailWindow) {
              win.window.document.getElementById("tabmail").setDocumentTitle();
            } else if (win.window.gBrowser?.updateTitlebar) {
              win.window.gBrowser.updateTitlebar();
            }
          }

          // TODO: All the other properties, focused=false...

          return Promise.resolve(win.convert());
        },

        remove(windowId) {
          let window = windowTracker.getWindow(windowId, context);
          window.close();

          return new Promise(resolve => {
            let listener = () => {
              windowTracker.removeListener("domwindowclosed", listener);
              resolve();
            };
            windowTracker.addListener("domwindowclosed", listener);
          });
        },
        openDefaultBrowser(url) {
          let uri = null;
          try {
            uri = Services.io.newURI(url);
          } catch (e) {
            throw new ExtensionError(`Url "${url}" seems to be malformed.`);
          }
          if (!uri.schemeIs("http") && !uri.schemeIs("https")) {
            throw new ExtensionError(
              `Url scheme "${uri.scheme}" is not supported.`
            );
          }
          Cc["@mozilla.org/uriloader/external-protocol-service;1"]
            .getService(Ci.nsIExternalProtocolService)
            .loadURI(uri);
        },
      },
    };
  }
};
