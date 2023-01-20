/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailWindow.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messenger.js */

XPCOMUtils.defineLazyModuleGetters(this, {
  FolderUtils: "resource:///modules/FolderUtils.jsm",
  GlodaSyntheticView: "resource:///modules/gloda/GlodaSyntheticView.jsm",
  MailUtils: "resource:///modules/MailUtils.jsm",
  MsgHdrSyntheticView: "resource:///modules/MsgHdrSyntheticView.jsm",
  MsgHdrToMimeMessage: "resource:///modules/gloda/MimeMessage.jsm",
});

/**
 * Tabs for displaying mail folders and messages.
 */
var newMailTabType = {
  name: "newMailTab",
  perTabPanel: "vbox",
  _cloneTemplate(template, tab, onLoad) {
    let tabmail = document.getElementById("tabmail");

    let clone = document.getElementById(template).content.cloneNode(true);
    let browser = clone.querySelector("browser");
    browser.id = `${tab.mode.name}Browser${tab.mode._nextId}`;
    browser.addEventListener(
      "DOMTitleChanged",
      () => {
        tab.title = browser.contentTitle;
        tabmail.setTabTitle(tab);
      },
      true
    );
    browser.addEventListener("DOMLinkAdded", event => {
      if (event.target.rel == "icon") {
        tabmail.setTabFavIcon(tab, event.target.href);
      }
    });
    browser.addEventListener("DOMLinkChanged", event => {
      if (event.target.rel == "icon") {
        tabmail.setTabFavIcon(tab, event.target.href);
      }
    });
    browser.addEventListener(
      "load",
      event => onLoad(event.target.ownerGlobal),
      true
    );

    tab.title = "";
    tab.panel.id = `${tab.mode.name}${tab.mode._nextId}`;
    tab.panel.appendChild(clone);
    // `chromeBrowser` refers to the outermost browser in the tab, i.e. the
    // browser displaying about:3pane or about:message.
    tab.chromeBrowser = browser;
    tab.mode._nextId++;
  },

  closeTab(tab) {},
  saveTabState(tab) {},

  modes: {
    mail3PaneTab: {
      _nextId: 1,
      isDefault: true,

      openTab(tab, args = {}) {
        newMailTabType._cloneTemplate("mail3PaneTabTemplate", tab, win => {
          win.tabOrWindow = tab;
          // Can we be sure messageBrowser.contentWindow is loaded at this point?
          win.messageBrowser.contentWindow.tabOrWindow = tab;
          win.restoreState(args);
          if (!args.background) {
            // Update telemetry once the tab has loaded and decided if the
            // panes are visible.
            Services.telemetry.keyedScalarSet(
              "tb.ui.configuration.pane_visibility",
              "folderPane",
              tab.folderPaneVisible
            );
            Services.telemetry.keyedScalarSet(
              "tb.ui.configuration.pane_visibility",
              "messagePane",
              tab.messagePaneVisible
            );
          }

          // The first tab has loaded and ready for the user to interact with
          // it. We can let the rest of the start-up happen now without
          // appearing to slow the program down.
          if (tab.first) {
            Services.obs.notifyObservers(window, "mail-startup-done");
          }
        });

        // `browser` and `linkedBrowser` refer to the message display browser
        // within this tab. They may be null if the browser isn't visible.
        // Extension APIs refer to these properties.
        Object.defineProperty(tab, "browser", {
          get() {
            if (!tab.chromeBrowser.contentWindow) {
              return null;
            }

            let {
              messageBrowser,
              webBrowser,
            } = tab.chromeBrowser.contentWindow;
            if (messageBrowser && !messageBrowser.hidden) {
              return messageBrowser.contentDocument.getElementById(
                "messagepane"
              );
            }
            if (webBrowser && !webBrowser.hidden) {
              return webBrowser;
            }
            return null;
          },
        });
        Object.defineProperty(tab, "linkedBrowser", {
          get() {
            return tab.browser;
          },
        });

        // Layout properties.
        Object.defineProperty(tab, "accountCentralVisible", {
          get() {
            return tab.chromeBrowser.contentDocument.body.classList.contains(
              "account-central"
            );
          },
        });
        Object.defineProperty(tab, "folderPaneVisible", {
          get() {
            return !tab.chromeBrowser.contentWindow.folderPaneSplitter
              .isCollapsed;
          },
          set(visible) {
            tab.chromeBrowser.contentWindow.folderPaneSplitter.isCollapsed = !visible;
          },
        });
        Object.defineProperty(tab, "messagePaneVisible", {
          get() {
            return !tab.chromeBrowser.contentWindow.messagePaneSplitter
              .isCollapsed;
          },
          set(visible) {
            tab.chromeBrowser.contentWindow.messagePaneSplitter.isCollapsed = !visible;
          },
        });
        Object.defineProperty(tab, "sort", {
          get() {
            return {
              type:
                tab.chromeBrowser.contentWindow.gViewWrapper?.primarySortType,
              order:
                tab.chromeBrowser.contentWindow.gViewWrapper?.primarySortOrder,
              grouped:
                tab.chromeBrowser.contentWindow.gViewWrapper?.showGroupedBySort,
              threaded:
                tab.chromeBrowser.contentWindow.gViewWrapper?.showThreaded,
            };
          },
        });

        // Content properties.
        Object.defineProperty(tab, "message", {
          get() {
            return tab.chromeBrowser.contentWindow.gDBView
              ?.hdrForFirstSelectedMessage;
          },
        });
        Object.defineProperty(tab, "folder", {
          get() {
            return tab.chromeBrowser.contentWindow.gFolder;
          },
          set(folder) {
            tab.chromeBrowser.contentWindow.displayFolder(folder.URI);
          },
        });

        tab.canClose = !tab.first;
        return tab;
      },
      persistTab(tab) {
        return {
          firstTab: tab.first,
          folderPaneVisible: tab.folderPaneVisible,
          folderURI: tab.folder.URI,
          messagePaneVisible: tab.messagePaneVisible,
        };
      },
      restoreTab(tabmail, persistedState) {
        if (persistedState.firstTab) {
          let tab = tabmail.tabInfo[0];
          if (
            tab.chromeBrowser.currentURI.spec != "about:3pane" ||
            tab.chromeBrowser.contentDocument.readyState != "complete"
          ) {
            tab.chromeBrowser.contentWindow.addEventListener(
              "load",
              () => {
                tab.chromeBrowser.contentWindow.displayFolder(
                  persistedState.folderURI
                );
              },
              { once: true }
            );
          } else {
            tab.chromeBrowser.contentWindow.restoreState(persistedState);
          }
        } else {
          tabmail.openTab("mail3PaneTab", persistedState);
        }
      },
      showTab(tab) {
        if (
          tab.chromeBrowser.currentURI.spec != "about:3pane" ||
          tab.chromeBrowser.contentDocument.readyState != "complete"
        ) {
          return;
        }

        // Update telemetry when switching to a 3-pane tab. The telemetry
        // reflects the state of the last 3-pane tab that was shown, but not
        // if the state changed since it was shown.
        Services.telemetry.keyedScalarSet(
          "tb.ui.configuration.pane_visibility",
          "folderPane",
          tab.folderPaneVisible
        );
        Services.telemetry.keyedScalarSet(
          "tb.ui.configuration.pane_visibility",
          "messagePane",
          tab.messagePaneVisible
        );
      },
      supportsCommand(command, tab) {
        return tab.chromeBrowser?.contentWindow.commandController?.supportsCommand(
          command
        );
      },
      isCommandEnabled(command, tab) {
        return tab.chromeBrowser.contentWindow.commandController?.isCommandEnabled(
          command
        );
      },
      doCommand(command, tab) {
        tab.chromeBrowser.contentWindow.commandController?.doCommand(command);
      },
      getBrowser(tab) {
        return tab.browser;
      },
    },
    mailMessageTab: {
      _nextId: 1,
      openTab(tab, { messageURI, viewWrapper } = {}) {
        newMailTabType._cloneTemplate("mailMessageTabTemplate", tab, win => {
          win.tabOrWindow = tab;
          win.displayMessage(messageURI, viewWrapper);
        });

        // `browser` and `linkedBrowser` refer to the message display browser
        // within this tab. They may be null if the browser isn't visible.
        // Extension APIs refer to these properties.
        Object.defineProperty(tab, "browser", {
          get() {
            return tab.chromeBrowser.contentDocument?.getElementById(
              "messagepane"
            );
          },
        });
        Object.defineProperty(tab, "linkedBrowser", {
          get() {
            return tab.browser;
          },
        });

        // Content properties.
        tab.messageURI = messageURI;
        Object.defineProperty(tab, "message", {
          get() {
            return tab.chromeBrowser.contentWindow.gMessage;
          },
        });
        Object.defineProperty(tab, "folder", {
          get() {
            return tab.chromeBrowser.contentWindow.gViewWrapper
              ?.displayedFolder;
          },
        });

        tab.chromeBrowser.addEventListener("messageURIChanged", function(
          event
        ) {
          tab.messageURI = event.detail;
        });
        return tab;
      },
      persistTab(tab) {
        return { messageURI: tab.messageURI };
      },
      restoreTab(tabmail, persistedState) {
        tabmail.openTab("mailMessageTab", persistedState);
      },
      showTab(tab) {},
      supportsCommand(command, tab) {
        return tab.chromeBrowser?.contentWindow.commandController?.supportsCommand(
          command
        );
      },
      isCommandEnabled(command, tab) {
        return tab.chromeBrowser.contentWindow.commandController?.isCommandEnabled(
          command
        );
      },
      doCommand(command, tab) {
        tab.chromeBrowser.contentWindow.commandController?.doCommand(command);
      },
      getBrowser(tab) {
        return tab.browser;
      },
    },
  },
};
