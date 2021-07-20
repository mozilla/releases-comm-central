/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

// There are shutdown issues for which multiple rejections are left uncaught.
// This bug should be fixed, but for the moment this directory is whitelisted.
//
// NOTE: Entire directory whitelisting should be kept to a minimum. Normally you
//       should use "expectUncaughtRejection" to flag individual failures.
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/PromiseTestUtils.jsm"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Message manager disconnected/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(/No matching message handler/);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Receiving end does not exist/
);

check3PaneInInitialState();
registerCleanupFunction(() => {
  MailServices.accounts.accounts.forEach(cleanUpAccount);

  let tabmail = document.getElementById("tabmail");
  is(tabmail.tabInfo.length, 1);

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }

  // Put the 3-pane back how we found it.
  document
    .getElementById("folderpane_splitter")
    .setAttribute("state", "collapsed");
  if (window.IsMessagePaneCollapsed()) {
    window.MsgToggleMessagePane();
  }

  check3PaneInInitialState();

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});

function check3PaneInInitialState() {
  check3PaneState(false, true);
}

function check3PaneState(folderPaneOpen = null, messagePaneOpen = null) {
  if (folderPaneOpen !== null) {
    Assert.equal(
      document.getElementById("folderpane_splitter").getAttribute("state") ==
        "collapsed",
      !folderPaneOpen,
      "State of folder pane splitter is correct"
    );
    Assert.equal(
      document.getElementById("folderPaneBox").collapsed,
      !folderPaneOpen,
      "State of folder pane box is correct"
    );
  }

  if (messagePaneOpen !== null) {
    Assert.equal(
      document.getElementById("threadpane-splitter").getAttribute("state") ==
        "collapsed",
      !messagePaneOpen,
      "State of message pane splitter is correct"
    );
    if (!messagePaneOpen) {
      Assert.ok(
        document.getElementById("messagepaneboxwrapper").collapsed,
        "State of message pane box is correct"
      );
    }
    Assert.equal(
      window.gMessageDisplay.visible,
      messagePaneOpen,
      "State of message display is correct"
    );
  }
}

function createAccount(type = "none") {
  let account;

  if (type == "local") {
    MailServices.accounts.createLocalMailAccount();
    account = MailServices.accounts.FindAccountForServer(
      MailServices.accounts.localFoldersServer
    );
  } else {
    account = MailServices.accounts.createAccount();
    account.incomingServer = MailServices.accounts.createIncomingServer(
      `${account.key}user`,
      "localhost",
      type
    );
  }

  info(`Created account ${account.toString()}`);
  return account;
}

function cleanUpAccount(account) {
  info(`Cleaning up account ${account.toString()}`);
  MailServices.accounts.removeAccount(account, true);
}

function addIdentity(account, email = "mochitest@localhost") {
  let identity = MailServices.accounts.createIdentity();
  identity.email = email;
  account.addIdentity(identity);
  if (!account.defaultIdentity) {
    account.defaultIdentity = identity;
  }
  info(`Created identity ${identity.toString()}`);
  return identity;
}

async function createSubfolder(parent, name) {
  parent.createSubfolder(name, null);
  return parent.getChildNamed(name);
}

function createMessages(folder, makeMessagesArg) {
  if (typeof makeMessagesArg == "number") {
    makeMessagesArg = { count: makeMessagesArg };
  }
  if (!createMessages.messageGenerator) {
    createMessages.messageGenerator = new MessageGenerator();
  }

  let messages = createMessages.messageGenerator.makeMessages(makeMessagesArg);
  let messageStrings = messages.map(message => message.toMboxString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
}

async function createMessageFromFile(folder, path) {
  let message = await IOUtils.readUTF8(path);

  // A cheap hack to make this acceptable to addMessageBatch. It works for
  // existing uses but may not work for future uses.
  let fromAddress = message.match(/From: .* <(.*@.*)>/)[0];
  message = `From ${fromAddress}\r\n${message}`;

  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch([message]);
  folder.callFilterPlugins(null);
}

async function promiseAnimationFrame(win = window) {
  await new Promise(win.requestAnimationFrame);
  // dispatchToMainThread throws if used as the first argument of Promise.
  return new Promise(resolve => Services.tm.dispatchToMainThread(resolve));
}

function makeWidgetId(id) {
  id = id.toLowerCase();
  return id.replace(/[^a-z0-9_-]/g, "_");
}

async function focusWindow(win) {
  if (Services.focus.activeWindow == win) {
    return;
  }

  let promise = new Promise(resolve => {
    win.addEventListener(
      "focus",
      function() {
        resolve();
      },
      { capture: true, once: true }
    );
  });

  win.focus();
  await promise;
}

function promisePopupShown(popup) {
  return new Promise(resolve => {
    if (popup.state == "open") {
      resolve();
    } else {
      let onPopupShown = event => {
        popup.removeEventListener("popupshown", onPopupShown);
        resolve();
      };
      popup.addEventListener("popupshown", onPopupShown);
    }
  });
}

function getPanelForNode(node) {
  while (node.localName != "panel") {
    node = node.parentNode;
  }
  return node;
}

function awaitBrowserLoaded(browser) {
  if (
    browser.ownerGlobal.document.readyState === "complete" &&
    browser.currentURI.spec !== "about:blank"
  ) {
    return Promise.resolve();
  }
  return BrowserTestUtils.browserLoaded(browser);
}

var awaitExtensionPanel = async function(
  extension,
  win = window,
  awaitLoad = true
) {
  let { originalTarget: browser } = await BrowserTestUtils.waitForEvent(
    win.document,
    "WebExtPopupLoaded",
    true,
    event => event.detail.extension.id === extension.id
  );

  await Promise.all([
    promisePopupShown(getPanelForNode(browser)),
    awaitLoad && awaitBrowserLoaded(browser),
  ]);

  return browser;
};

function getBrowserActionPopup(extension, win = window) {
  return win.document.getElementById("webextension-remote-preload-panel");
}

function closeBrowserAction(extension, win = window) {
  let popup = getBrowserActionPopup(extension, win);
  let hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.hidePopup();

  return hidden;
}

async function openAddressbookWindow() {
  let abWindow = Services.ww.openWindow(
    null,
    "chrome://messenger/content/addressbook/addressbook.xhtml",
    "_blank",
    "chrome,extrachrome,menubar,resizable,scrollbars,status,toolbar",
    null
  );
  if (abWindow.document.readyState != "complete") {
    await new Promise(resolve => {
      abWindow.addEventListener("load", resolve, { once: true });
    });
  }
  abWindow.focus();
  return abWindow;
}

async function openNewMailWindow(options = {}) {
  if (!options.newAccountWizard) {
    Services.prefs.setBoolPref(
      "mail.provider.suppress_dialog_on_startup",
      true
    );
  }

  let win = window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,all,dialog=no"
  );
  await Promise.all([
    BrowserTestUtils.waitForEvent(win, "focus", true),
    BrowserTestUtils.waitForEvent(win, "activate", true),
  ]);

  return win;
}

async function openComposeWindow(account) {
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  let composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.identity = account.defaultIdentity;
  params.composeFields = composeFields;

  let composeWindowPromise = BrowserTestUtils.domWindowOpened(
    undefined,
    async win => {
      await BrowserTestUtils.waitForEvent(win, "load");
      if (
        win.document.documentURI !=
        "chrome://messenger/content/messengercompose/messengercompose.xhtml"
      ) {
        return false;
      }
      await BrowserTestUtils.waitForEvent(win, "compose-editor-ready");
      return true;
    }
  );
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  return composeWindowPromise;
}

async function openMessageInTab(msgHdr) {
  if (!msgHdr.QueryInterface(Ci.nsIMsgDBHdr)) {
    throw new Error("No message passed to openMessageInTab");
  }

  // Ensure the behaviour pref is set to open a new tab. It is the default,
  // but you never know.
  let oldPrefValue = Services.prefs.getIntPref("mail.openMessageBehavior");
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );
  MailUtils.displayMessages([msgHdr]);
  Services.prefs.setIntPref("mail.openMessageBehavior", oldPrefValue);

  let win = Services.wm.getMostRecentWindow("mail:3pane");
  let tab = win.document.getElementById("tabmail").currentTabInfo;
  let browser = tab.browser;

  await promiseMessageLoaded(browser, msgHdr);
  return tab;
}

async function openMessageInWindow(msgHdr) {
  if (!msgHdr.QueryInterface(Ci.nsIMsgDBHdr)) {
    throw new Error("No message passed to openMessageInWindow");
  }

  let messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(msgHdr);

  let messageWindow = await messageWindowPromise;
  let browser = messageWindow.document.getElementById("messagepane");

  await promiseMessageLoaded(browser, msgHdr);
  return messageWindow;
}

async function promiseMessageLoaded(browser, msgHdr) {
  let messageURI = msgHdr.folder.getUriForMsg(msgHdr);
  messageURI = window.messenger
    .messageServiceFromURI(messageURI)
    .getUrlForUri(messageURI, null);

  if (
    browser.webProgress?.isLoadingDocument ||
    !browser.currentURI?.equals(messageURI)
  ) {
    await BrowserTestUtils.browserLoaded(
      browser,
      null,
      uri => uri == messageURI.spec
    );
  }
}

/**
 * Check the headers of an open compose window against expected values.
 *
 * @param {Object} expected - A dictionary of expected headers.
 *    Omit headers that should have no value.
 * @param {string[]} [fields.to]
 * @param {string[]} [fields.cc]
 * @param {string[]} [fields.bcc]
 * @param {string[]} [fields.replyTo]
 * @param {string[]} [fields.followupTo]
 * @param {string[]} [fields.newsgroups]
 * @param {string} [fields.subject]
 */
async function checkComposeHeaders(expected) {
  let composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  is(composeWindows.length, 1);
  let composeDocument = composeWindows[0].document;
  await new Promise(resolve => composeWindows[0].setTimeout(resolve));

  if ("identityId" in expected) {
    is(composeWindows[0].getCurrentIdentityKey(), expected.identityId);
  }

  let checkField = (fieldName, elementId) => {
    let pills = composeDocument
      .getElementById(elementId)
      .getElementsByTagName("mail-address-pill");

    if (fieldName in expected) {
      is(
        pills.length,
        expected[fieldName].length,
        `${fieldName} has the right number of pills`
      );
      for (let i = 0; i < expected[fieldName].length; i++) {
        is(pills[i].label, expected[fieldName][i]);
      }
    } else {
      is(pills.length, 0, `${fieldName} is empty`);
    }
  };

  checkField("to", "addressRowTo");
  checkField("cc", "addressRowCc");
  checkField("bcc", "addressRowBcc");
  checkField("replyTo", "addressRowReply");
  checkField("followupTo", "addressRowFollowup");
  checkField("newsgroups", "addressRowNewsgroups");

  let subject = composeDocument.getElementById("msgSubject").value;
  if ("subject" in expected) {
    is(subject, expected.subject, "subject is correct");
  } else {
    is(subject, "", "subject is empty");
  }
}

async function openContextMenu(selector = "#img1", win = window) {
  let contentAreaContextMenu = win.document.getElementById("mailContext");
  let popupShownPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popupshown"
  );
  let tabmail = document.getElementById("tabmail");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "mousedown", button: 2 },
    tabmail.selectedBrowser
  );
  await BrowserTestUtils.synthesizeMouseAtCenter(
    selector,
    { type: "contextmenu" },
    tabmail.selectedBrowser
  );
  await popupShownPromise;
  return contentAreaContextMenu;
}

async function closeExtensionContextMenu(itemToSelect, modifiers = {}) {
  let contentAreaContextMenu = document.getElementById("mailContext");
  let popupHiddenPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popuphidden"
  );
  if (itemToSelect) {
    itemToSelect.closest("menupopup").activateItem(itemToSelect, modifiers);
  } else {
    contentAreaContextMenu.hidePopup();
  }
  await popupHiddenPromise;

  // Bug 1351638: parent menu fails to close intermittently, make sure it does.
  contentAreaContextMenu.hidePopup();
}

async function openSubmenu(submenuItem, win = window) {
  const submenu = submenuItem.menupopup;
  const shown = BrowserTestUtils.waitForEvent(submenu, "popupshown");
  submenuItem.openMenu(true);
  await shown;
  return submenu;
}

async function closeContextMenu(contextMenu) {
  let contentAreaContextMenu =
    contextMenu || document.getElementById("mailContext");
  let popupHiddenPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popuphidden"
  );
  contentAreaContextMenu.hidePopup();
  await popupHiddenPromise;
}

async function getUtilsJS() {
  let response = await fetch(getRootDirectory(gTestPath) + "utils.js");
  return response.text();
}

async function checkContent(browser, expected) {
  await SpecialPowers.spawn(browser, [expected], expected => {
    let body = content.document.body;
    Assert.ok(body, "body");
    let computedStyle = content.getComputedStyle(body);

    if ("backgroundColor" in expected) {
      Assert.equal(
        computedStyle.backgroundColor,
        expected.backgroundColor,
        "backgroundColor"
      );
    }
    if ("color" in expected) {
      Assert.equal(computedStyle.color, expected.color, "color");
    }
    if ("foo" in expected) {
      Assert.equal(body.getAttribute("foo"), expected.foo, "foo");
    }
    if ("textContent" in expected) {
      // In message display, we only really want the message body, but the
      // document body also has headers. For the purposes of these tests,
      // we can just select an descendant node, since what really matters is
      // whether (or not) a script ran, not the exact result.
      body = body.querySelector(".moz-text-flowed") ?? body;
      Assert.equal(body.textContent, expected.textContent, "textContent");
    }
  });
}

function contentTabOpenPromise(tabmail, url) {
  return new Promise(resolve => {
    let tabMonitor = {
      onTabTitleChanged(aTab) {},
      onTabClosing(aTab) {},
      onTabPersist(aTab) {},
      onTabRestored(aTab) {},
      onTabSwitched(aNewTab, aOldTab) {},
      async onTabOpened(aTab) {
        let newBrowser = aTab.linkedBrowser;
        let urlMatches = urlToMatch => urlToMatch == url;

        let result = BrowserTestUtils.browserLoaded(
          newBrowser,
          false,
          urlMatches
        ).then(() => aTab);

        let reporterListener = {
          QueryInterface: ChromeUtils.generateQI([
            "nsIWebProgressListener",
            "nsISupportsWeakReference",
          ]),
          onStateChange() {},
          onProgressChange() {},
          onLocationChange(
            /* in nsIWebProgress*/ aWebProgress,
            /* in nsIRequest*/ aRequest,
            /* in nsIURI*/ aLocation
          ) {
            if (aLocation.spec == url) {
              aTab.browser.removeProgressListener(reporterListener);
              tabmail.unregisterTabMonitor(tabMonitor);
              TestUtils.executeSoon(() => resolve(result));
            }
          },
          onStatusChange() {},
          onSecurityChange() {},
          onContentBlockingEvent() {},
        };
        aTab.browser.addProgressListener(reporterListener);
      },
    };
    tabmail.registerTabMonitor(tabMonitor);
  });
}
