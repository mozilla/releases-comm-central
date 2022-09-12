/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from commandglue.js */
/* import-globals-from mail3PaneWindowCommands.js */
/* import-globals-from mailContextMenus.js */
/* import-globals-from mailWindow.js */
/* import-globals-from mailWindowOverlay.js */
/* import-globals-from messageDisplay.js */
/* import-globals-from msgMail3PaneWindow.js */

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
      "pagetitlechanged",
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
  showTab(tab) {},

  modes: {
    mail3PaneTab: {
      _nextId: 1,
      isDefault: Services.prefs.getBoolPref("mail.useNewMailTabs"),

      openTab(tab, args = {}) {
        newMailTabType._cloneTemplate("mail3PaneTabTemplate", tab, win =>
          win.restoreState(args)
        );

        // `browser` and `linkedBrowser` refer to the message display browser
        // within this tab. They may be null if the browser isn't visible.
        // Extension APIs refer to these properties.
        Object.defineProperty(tab, "browser", {
          get() {
            let messageBrowser =
              tab.chromeBrowser.contentWindow?.messageBrowser;
            if (messageBrowser && !messageBrowser.hidden) {
              return messageBrowser.contentDocument.getElementById(
                "messagepane"
              );
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
            return !tab.chromeBrowser.contentWindow.splitter1.isCollapsed;
          },
          set(visible) {
            tab.chromeBrowser.contentWindow.splitter1.isCollapsed = !visible;
          },
        });
        Object.defineProperty(tab, "messagePaneVisible", {
          get() {
            return !tab.chromeBrowser.contentWindow.splitter2.isCollapsed;
          },
          set(visible) {
            tab.chromeBrowser.contentWindow.splitter2.isCollapsed = !visible;
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

        // The same as `doCommand` but with an extra argument.
        tab.performCommand = function(command, event) {
          let commandController =
            tab.chromeBrowser?.contentWindow.commandController;
          if (commandController?.isCommandEnabled(command)) {
            commandController.doCommand(command, event);
          }
        };
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
        newMailTabType._cloneTemplate("mailMessageTabTemplate", tab, win =>
          win.displayMessage(messageURI, viewWrapper)
        );

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

        // The same as `doCommand` but with an extra argument.
        tab.performCommand = function(command, event) {
          let commandController =
            tab.chromeBrowser?.contentWindow.commandController;
          if (commandController?.isCommandEnabled(command)) {
            commandController.doCommand(command, event);
          }
        };
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
