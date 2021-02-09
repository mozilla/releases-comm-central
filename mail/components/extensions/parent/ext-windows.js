/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The ext-* files are imported into the same scopes.
/* import-globals-from ext-mail.js */

/**
 * An event manager API provider which listens for a DOM event in any browser
 * window, and calls the given listener function whenever an event is received.
 * That listener function receives a `fire` object, which it can use to dispatch
 * events to the extension, and a DOM event object.
 *
 * @param {BaseContext} context
 *        The extension context which the event manager belongs to.
 * @param {string} name
 *        The API name of the event manager, e.g.,"runtime.onMessage".
 * @param {string} event
 *        The name of the DOM event to listen for.
 * @param {function} listener
 *        The listener function to call when a DOM event is received.
 *
 * @returns {object} An injectable api for the new event.
 */
function WindowEventManager(context, name, event, listener) {
  let register = fire => {
    let listener2 = (window, ...args) => {
      if (context.canAccessWindow(window)) {
        listener(fire, window, ...args);
      }
    };

    windowTracker.addListener(event, listener2);
    return () => {
      windowTracker.removeListener(event, listener2);
    };
  };

  return new EventManager({ context, name, register }).api();
}

this.windows = class extends ExtensionAPI {
  getAPI(context) {
    const { extension } = context;
    const { windowManager } = extension;

    return {
      windows: {
        onCreated: WindowEventManager(
          context,
          "windows.onCreated",
          "domwindowopened",
          (fire, window) => {
            fire.async(windowManager.convert(window));
          }
        ),

        onRemoved: WindowEventManager(
          context,
          "windows.onRemoved",
          "domwindowclosed",
          (fire, window) => {
            fire.async(windowTracker.getId(window));
          }
        ),

        onFocusChanged: new EventManager({
          context,
          name: "windows.onFocusChanged",
          register: fire => {
            // Keep track of the last windowId used to fire an onFocusChanged event
            let lastOnFocusChangedWindowId;

            let listener = event => {
              // Wait a tick to avoid firing a superfluous WINDOW_ID_NONE
              // event when switching focus between two Thunderbird windows.
              Promise.resolve().then(() => {
                let windowId = WindowBase.WINDOW_ID_NONE;
                let window = Services.focus.activeWindow;
                if (window) {
                  if (!context.canAccessWindow(window)) {
                    return;
                  }
                  windowId = windowTracker.getId(window);
                }
                if (windowId !== lastOnFocusChangedWindowId) {
                  fire.async(windowId);
                  lastOnFocusChangedWindowId = windowId;
                }
              });
            };
            windowTracker.addListener("focus", listener);
            windowTracker.addListener("blur", listener);
            return () => {
              windowTracker.removeListener("focus", listener);
              windowTracker.removeListener("blur", listener);
            };
          },
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
