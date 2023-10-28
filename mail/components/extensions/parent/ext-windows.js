/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// The ext-* files are imported into the same scopes.
/* import-globals-from ext-mail.js */

function sanitizePositionParams(params, window = null, positionOffset = 0) {
  if (params.left === null && params.top === null) {
    return;
  }

  if (params.left === null) {
    const baseLeft = window ? window.screenX : 0;
    params.left = baseLeft + positionOffset;
  }
  if (params.top === null) {
    const baseTop = window ? window.screenY : 0;
    params.top = baseTop + positionOffset;
  }

  // boundary check: don't put window out of visible area
  const baseWidth = window ? window.outerWidth : 0;
  const baseHeight = window ? window.outerHeight : 0;
  // Secure minimum size of an window should be same to the one
  // defined at nsGlobalWindowOuter::CheckSecurityWidthAndHeight.
  const minWidth = 100;
  const minHeight = 100;
  const width = Math.max(
    minWidth,
    params.width !== null ? params.width : baseWidth
  );
  const height = Math.max(
    minHeight,
    params.height !== null ? params.height : baseHeight
  );
  const screenManager = Cc["@mozilla.org/gfx/screenmanager;1"].getService(
    Ci.nsIScreenManager
  );
  const screen = screenManager.screenForRect(
    params.left,
    params.top,
    width,
    height
  );
  const availDeviceLeft = {};
  const availDeviceTop = {};
  const availDeviceWidth = {};
  const availDeviceHeight = {};
  screen.GetAvailRect(
    availDeviceLeft,
    availDeviceTop,
    availDeviceWidth,
    availDeviceHeight
  );
  const factor = screen.defaultCSSScaleFactor;
  const availLeft = Math.floor(availDeviceLeft.value / factor);
  const availTop = Math.floor(availDeviceTop.value / factor);
  const availWidth = Math.floor(availDeviceWidth.value / factor);
  const availHeight = Math.floor(availDeviceHeight.value / factor);
  params.left = Math.min(
    availLeft + availWidth - width,
    Math.max(availLeft, params.left)
  );
  params.top = Math.min(
    availTop + availHeight - height,
    Math.max(availTop, params.top)
  );
}

/**
 * Update the geometry of the mail window.
 *
 * @param {object} options
 *        An object containing new values for the window's geometry.
 * @param {integer} [options.left]
 *        The new pixel distance of the left side of the mail window from
 *        the left of the screen.
 * @param {integer} [options.top]
 *        The new pixel distance of the top side of the mail window from
 *        the top of the screen.
 * @param {integer} [options.width]
 *        The new pixel width of the window.
 * @param {integer} [options.height]
 *        The new pixel height of the window.
 */
function updateGeometry(window, options) {
  if (options.left !== null || options.top !== null) {
    const left = options.left === null ? window.screenX : options.left;
    const top = options.top === null ? window.screenY : options.top;
    window.moveTo(left, top);
  }

  if (options.width !== null || options.height !== null) {
    const width = options.width === null ? window.outerWidth : options.width;
    const height =
      options.height === null ? window.outerHeight : options.height;
    window.resizeTo(width, height);
  }
}

this.windows = class extends ExtensionAPIPersistent {
  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }
    for (const window of Services.wm.getEnumerator("mail:extensionPopup")) {
      const uri = window.browser.browsingContext.currentURI;
      if (uri.scheme == "moz-extension" && uri.host == this.extension.uuid) {
        window.close();
      }
    }
  }

  windowEventRegistrar({ windowEvent, listener }) {
    const { extension } = this;
    return ({ context, fire }) => {
      const listener2 = async (window, ...args) => {
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
      listener: async ({ context, fire, window }) => {
        // Return the window only after it has been fully initialized.
        if (window.webExtensionWindowCreatePending) {
          await new Promise(resolve => {
            window.addEventListener("webExtensionWindowCreateDone", resolve, {
              once: true,
            });
          });
        }
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
      const { extension } = this;
      // Keep track of the last windowId used to fire an onFocusChanged event
      let lastOnFocusChangedWindowId;
      const scheduledEvents = [];

      const listener = async event => {
        // Wait a tick to avoid firing a superfluous WINDOW_ID_NONE
        // event when switching focus between two Thunderbird windows.
        // Note: This is not working for Linux, where we still get the -1
        await Promise.resolve();

        let windowId = WindowBase.WINDOW_ID_NONE;
        const window = Services.focus.activeWindow;
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
        const scheduledWindowId = scheduledEvents.shift();

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
          const window = windowTracker.getWindow(windowId, context);
          if (!window) {
            return Promise.reject({
              message: `Invalid window ID: ${windowId}`,
            });
          }
          return Promise.resolve(windowManager.convert(window, getInfo));
        },

        async getCurrent(getInfo) {
          const window = context.currentWindow || windowTracker.topWindow;
          if (window.document.readyState != "complete") {
            await new Promise(resolve =>
              window.addEventListener("load", resolve, { once: true })
            );
          }
          return windowManager.convert(window, getInfo);
        },

        async getLastFocused(getInfo) {
          const window = windowTracker.topWindow;
          if (window.document.readyState != "complete") {
            await new Promise(resolve =>
              window.addEventListener("load", resolve, { once: true })
            );
          }
          return windowManager.convert(window, getInfo);
        },

        getAll(getInfo) {
          const doNotCheckTypes = !getInfo || !getInfo.windowTypes;

          const windows = Array.from(windowManager.getAll(), win =>
            win.convert(getInfo)
          ).filter(
            win => doNotCheckTypes || getInfo.windowTypes.includes(win.type)
          );
          return Promise.resolve(windows);
        },

        async create(createData) {
          if (createData.incognito) {
            throw new ExtensionError("`incognito` is not supported");
          }

          const needResize =
            createData.left !== null ||
            createData.top !== null ||
            createData.width !== null ||
            createData.height !== null;
          if (needResize) {
            if (createData.state !== null && createData.state != "normal") {
              throw new ExtensionError(
                `"state": "${createData.state}" may not be combined with "left", "top", "width", or "height"`
              );
            }
            createData.state = "normal";
          }

          // 10px offset is same to Chromium
          sanitizePositionParams(createData, windowTracker.topNormalWindow, 10);

          let userContextId =
            Services.scriptSecurityManager.DEFAULT_USER_CONTEXT_ID;
          if (createData.cookieStoreId) {
            userContextId = getUserContextIdForCookieStoreId(
              extension,
              createData.cookieStoreId
            );
          }
          const createWindowArgs = createData => {
            const allowScriptsToClose = !!createData.allowScriptsToClose;
            const url = createData.url || "about:blank";
            const urls = Array.isArray(url) ? url : [url];

            const args = Cc["@mozilla.org/array;1"].createInstance(
              Ci.nsIMutableArray
            );
            const actionData = {
              action: "open",
              allowScriptsToClose,
              tabs: urls.map(url => ({
                tabType: "contentTab",
                tabParams: { url, userContextId },
              })),
            };
            actionData.wrappedJSObject = actionData;
            args.appendElement(null);
            args.appendElement(actionData);
            return args;
          };

          let window;
          const wantNormalWindow =
            createData.type === null || createData.type == "normal";
          const features = ["chrome"];
          if (wantNormalWindow) {
            features.push("dialog=no", "all", "status", "toolbar");
          } else {
            // All other types create "popup"-type windows by default.
            // Use dialog=no to get minimize and maximize buttons (as chrome
            // does) and to allow the API to actually maximize the popup in
            // Linux.
            features.push(
              "dialog=no",
              "resizable",
              "minimizable",
              "titlebar",
              "close"
            );
            if (createData.left === null && createData.top === null) {
              features.push("centerscreen");
            }
          }

          const windowURL = wantNormalWindow
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

            if (createData.cookieStoreId) {
              return Promise.reject({
                message:
                  "`tabId` may not be used in conjunction with `cookieStoreId`",
              });
            }

            const nativeTabInfo = tabTracker.getTab(createData.tabId);
            const tabmail =
              getTabBrowser(nativeTabInfo).ownerDocument.getElementById(
                "tabmail"
              );
            const targetType = wantNormalWindow ? null : "popup";
            window = tabmail.replaceTabWithWindow(nativeTabInfo, targetType)[0];
          } else {
            window = Services.ww.openWindow(
              null,
              windowURL,
              "_blank",
              features.join(","),
              wantNormalWindow ? null : createWindowArgs(createData)
            );
          }

          window.webExtensionWindowCreatePending = true;

          updateGeometry(window, createData);

          // TODO: focused, type

          // Wait till the newly created window is focused. On Linux the initial
          // "normal" state has been set once the window has been fully focused.
          // Setting a different state before the window is fully focused may cause
          // the initial state to be erroneously applied after the custom state has
          // been set.
          const focusPromise = new Promise(resolve => {
            if (Services.focus.activeWindow == window) {
              resolve();
            } else {
              window.addEventListener("focus", resolve, { once: true });
            }
          });

          const loadPromise = new Promise(resolve => {
            window.addEventListener("load", resolve, { once: true });
          });

          const titlePromise = new Promise(resolve => {
            window.addEventListener("pagetitlechanged", resolve, {
              once: true,
            });
          });

          await Promise.all([focusPromise, loadPromise, titlePromise]);

          const win = windowManager.getWrapper(window);

          if (
            [
              "minimized",
              "fullscreen",
              "docked",
              "normal",
              "maximized",
            ].includes(createData.state)
          ) {
            await win.setState(createData.state);
          }

          if (createData.titlePreface !== null) {
            win.setTitlePreface(createData.titlePreface);
          }

          // Update the title independently of a createData.titlePreface, to get
          // the title of the loaded document into the window title.
          if (win instanceof TabmailWindow) {
            win.window.document.getElementById("tabmail").setDocumentTitle();
          } else if (win.window.gBrowser?.updateTitlebar) {
            await win.window.gBrowser.updateTitlebar();
          }

          delete window.webExtensionWindowCreatePending;
          window.dispatchEvent(
            new window.CustomEvent("webExtensionWindowCreateDone")
          );
          return win.convert({ populate: true });
        },

        async update(windowId, updateInfo) {
          const needResize =
            updateInfo.left !== null ||
            updateInfo.top !== null ||
            updateInfo.width !== null ||
            updateInfo.height !== null;
          if (
            updateInfo.state !== null &&
            updateInfo.state != "normal" &&
            needResize
          ) {
            throw new ExtensionError(
              `"state": "${updateInfo.state}" may not be combined with "left", "top", "width", or "height"`
            );
          }

          const win = windowManager.get(windowId, context);
          if (!win) {
            throw new ExtensionError(`Invalid window ID: ${windowId}`);
          }

          // Update the window only after it has been fully initialized.
          if (win.window.webExtensionWindowCreatePending) {
            await new Promise(resolve => {
              win.window.addEventListener(
                "webExtensionWindowCreateDone",
                resolve,
                { once: true }
              );
            });
          }

          if (updateInfo.focused) {
            win.window.focus();
          }

          if (updateInfo.state !== null) {
            await win.setState(updateInfo.state);
          }

          if (updateInfo.drawAttention) {
            // Bug 1257497 - Firefox can't cancel attention actions.
            win.window.getAttention();
          }

          updateGeometry(win.window, updateInfo);

          if (updateInfo.titlePreface !== null) {
            win.setTitlePreface(updateInfo.titlePreface);
            if (win instanceof TabmailWindow) {
              win.window.document.getElementById("tabmail").setDocumentTitle();
            } else if (win.window.gBrowser?.updateTitlebar) {
              await win.window.gBrowser.updateTitlebar();
            }
          }

          // TODO: All the other properties, focused=false...

          return win.convert();
        },

        remove(windowId) {
          const window = windowTracker.getWindow(windowId, context);
          window.close();

          return new Promise(resolve => {
            const listener = () => {
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
