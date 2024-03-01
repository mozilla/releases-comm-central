/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { MailUtils } = ChromeUtils.import("resource:///modules/MailUtils.jsm");
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { getCachedAllowedSpaces, setCachedAllowedSpaces } =
  ChromeUtils.importESModule(
    "resource:///modules/ExtensionToolbarButtons.sys.mjs"
  );
const { storeState, getState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);
const { getDefaultItemIdsForSpace, getAvailableItemIdsForSpace } =
  ChromeUtils.importESModule("resource:///modules/CustomizableItems.sys.mjs");

var { ExtensionCommon } = ChromeUtils.importESModule(
  "resource://gre/modules/ExtensionCommon.sys.mjs"
);
var { makeWidgetId } = ExtensionCommon;

// Persistent Listener test functionality
var { assertPersistentListeners } = ExtensionTestUtils.testAssertions;

// There are shutdown issues for which multiple rejections are left uncaught.
// This bug should be fixed, but for the moment this directory is whitelisted.
//
// NOTE: Entire directory whitelisting should be kept to a minimum. Normally you
//       should use "expectUncaughtRejection" to flag individual failures.
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/PromiseTestUtils.sys.mjs"
);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Message manager disconnected/
);
PromiseTestUtils.allowMatchingRejectionsGlobally(/No matching message handler/);
PromiseTestUtils.allowMatchingRejectionsGlobally(
  /Receiving end does not exist/
);

// Adjust timeout to take care of code coverage runs and fission runs to be a
// lot slower.
const originalRequestLongerTimeout = requestLongerTimeout;
// eslint-disable-next-line no-global-assign
requestLongerTimeout = factor => {
  const ccovMultiplier = AppConstants.MOZ_CODE_COVERAGE ? 2 : 1;
  const fissionMultiplier = SpecialPowers.useRemoteSubframes ? 2 : 1;
  originalRequestLongerTimeout(ccovMultiplier * fissionMultiplier * factor);
};
requestLongerTimeout(1);

add_setup(async () => {
  await check3PaneState(true, true);
  const tabmail = document.getElementById("tabmail");
  if (tabmail.tabInfo.length > 1) {
    info(`Will close ${tabmail.tabInfo.length - 1} tabs left over from others`);
    for (let i = tabmail.tabInfo.length - 1; i > 0; i--) {
      tabmail.closeTab(i);
    }
    is(tabmail.tabInfo.length, 1, "One tab open from start");
  }
});
registerCleanupFunction(() => {
  const tabmail = document.getElementById("tabmail");
  is(tabmail.tabInfo.length, 1, "Only one tab open at end of test");

  while (tabmail.tabInfo.length > 1) {
    tabmail.closeTab(tabmail.tabInfo[1]);
  }

  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  // Focus an element in the main window, then blur it again to avoid it
  // hijacking keypresses.
  const mainWindowElement = document.getElementById("button-appmenu");
  mainWindowElement.focus();
  mainWindowElement.blur();

  MailServices.accounts.accounts.forEach(cleanUpAccount);
  check3PaneState(true, true);

  // The unified toolbar must have been cleaned up. If this fails, check if a
  // test loaded an extension with a browser_action without setting "useAddonManager"
  // to either "temporary" or "permanent", which triggers onUninstalled to be
  // called on extension unload.
  const cachedAllowedSpaces = getCachedAllowedSpaces();
  is(
    cachedAllowedSpaces.size,
    0,
    `Stored known extension spaces should be cleared: ${JSON.stringify(
      Object.fromEntries(cachedAllowedSpaces)
    )}`
  );
  setCachedAllowedSpaces(new Map());
  Services.prefs.clearUserPref("mail.pane_config.dynamic");
  Services.xulStore.removeValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view"
  );
});

/**
 * Generate a CSS image-set declaration for the given extension icons.
 *
 * @param {string} url - Normal density icon URL, already wrapped in a CSS url().
 * @param {string} [url2x] - Optional double DPI icon URL, already wrapped in a
 *   CSS url(). If not provided the normal density value is used.
 * @returns {string} The CSS image-set declaration as would be found in computed
 *   styles.
 */
const makeIconSet = (url, url2x) =>
  `image-set(${url} 1dppx, ${url2x || url} 2dppx)`;

/**
 * Enforce a certain state in the unified toolbar.
 * @param {Object} state - A dictionary with arrays of buttons assigned to a space
 */
async function enforceState(state) {
  const stateChangeObserved = TestUtils.topicObserved(
    "unified-toolbar-state-change"
  );
  storeState(state);
  await stateChangeObserved;
}

async function check3PaneState(folderPaneOpen = null, messagePaneOpen = null) {
  const tabmail = document.getElementById("tabmail");
  const tab = tabmail.currentTabInfo;
  if (tab.chromeBrowser.contentDocument.readyState != "complete") {
    await BrowserTestUtils.waitForEvent(
      tab.chromeBrowser.contentWindow,
      "load"
    );
  }

  const { paneLayout } = tabmail.currentAbout3Pane;
  if (folderPaneOpen !== null) {
    Assert.equal(
      paneLayout.folderPaneVisible,
      folderPaneOpen,
      "State of folder pane splitter is correct"
    );
    paneLayout.folderPaneVisible = folderPaneOpen;
  }

  if (messagePaneOpen !== null) {
    Assert.equal(
      paneLayout.messagePaneVisible,
      messagePaneOpen,
      "State of message pane splitter is correct"
    );
    paneLayout.messagePaneVisible = messagePaneOpen;
  }
}

function createAccount(type = "none") {
  let account;

  if (type == "local") {
    account = MailServices.accounts.createLocalMailAccount();
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
  // If the current displayed message/folder belongs to the account to be removed,
  // select the root folder, otherwise the removal of this account will trigger
  // a "shouldn't have any listeners left" assertion in nsMsgDatabase.cpp.
  const [folder] = window.GetSelectedMsgFolders();
  if (folder && folder.server && folder.server == account.incomingServer) {
    const tabmail = document.getElementById("tabmail");
    tabmail.currentAbout3Pane.displayFolder(folder.server.rootFolder.URI);
  }

  const serverKey = account.incomingServer.key;
  const serverType = account.incomingServer.type;
  info(
    `Cleaning up ${serverType} account ${account.key} and server ${serverKey}`
  );
  MailServices.accounts.removeAccount(account, true);

  try {
    const server = MailServices.accounts.getIncomingServer(serverKey);
    if (server) {
      info(`Cleaning up leftover ${serverType} server ${serverKey}`);
      MailServices.accounts.removeIncomingServer(server, false);
    }
  } catch (e) {}
}

function addIdentity(account, email = "mochitest@localhost") {
  const identity = MailServices.accounts.createIdentity();
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

  const messages =
    createMessages.messageGenerator.makeMessages(makeMessagesArg);
  const messageStrings = messages.map(message => message.toMessageString());
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessageBatch(messageStrings);
}

async function createMessageFromFile(folder, path) {
  let message = await IOUtils.readUTF8(path);

  // A cheap hack to make this acceptable to addMessageBatch. It works for
  // existing uses but may not work for future uses.
  const fromAddress = message.match(/From: .* <(.*@.*)>/)[0];
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

async function focusWindow(win) {
  if (Services.focus.activeWindow == win) {
    return;
  }

  const promise = new Promise(resolve => {
    win.addEventListener(
      "focus",
      function () {
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
      const onPopupShown = () => {
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

/**
 * Wait until the browser is fully loaded.
 *
 * @param {xul:browser} browser - A xul:browser.
 * @param {string|function} [wantLoad = null] - If a function, takes a URL and
 *   returns true if that's the load we're interested in. If a string, gives the
 *   URL of the load we're interested in. If not present, the first load resolves
 *   the promise.
 *
 * @returns {Promise} When a load event is triggered for the browser or the browser
 *   is already fully loaded.
 */
function awaitBrowserLoaded(browser, wantLoad) {
  let testFn = () => true;
  if (wantLoad) {
    testFn = typeof wantLoad === "function" ? wantLoad : url => url == wantLoad;
  }

  return TestUtils.waitForCondition(
    () =>
      browser.ownerGlobal.document.readyState === "complete" &&
      (browser.webProgress?.isLoadingDocument === false ||
        browser.contentDocument?.readyState === "complete") &&
      browser.currentURI &&
      testFn(browser.currentURI.spec),
    "Browser should be loaded"
  );
}

var awaitExtensionPanel = async function (
  extension,
  win = window,
  awaitLoad = true
) {
  const { originalTarget: browser } = await BrowserTestUtils.waitForEvent(
    win.document,
    "WebExtPopupLoaded",
    true,
    event => event.detail.extension.id === extension.id
  );

  if (awaitLoad) {
    await awaitBrowserLoaded(browser, url => url != "about:blank");
  }
  await promisePopupShown(getPanelForNode(browser));

  return browser;
};

function getBrowserActionPopup(extension, win = window) {
  return win.top.document.getElementById("webextension-remote-preload-panel");
}

function closeBrowserAction(extension, win = window) {
  const popup = getBrowserActionPopup(extension, win);
  const hidden = BrowserTestUtils.waitForEvent(popup, "popuphidden");
  popup.hidePopup();

  return hidden;
}

async function openNewMailWindow(options = {}) {
  if (!options.newAccountWizard) {
    Services.prefs.setBoolPref(
      "mail.provider.suppress_dialog_on_startup",
      true
    );
  }

  const win = window.openDialog(
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
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  const composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  params.identity = account.defaultIdentity;
  params.composeFields = composeFields;

  const composeWindowPromise = BrowserTestUtils.domWindowOpened(
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
  const oldPrefValue = Services.prefs.getIntPref("mail.openMessageBehavior");
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );
  MailUtils.displayMessages([msgHdr]);
  Services.prefs.setIntPref("mail.openMessageBehavior", oldPrefValue);

  const win = Services.wm.getMostRecentWindow("mail:3pane");
  const tab = win.document.getElementById("tabmail").currentTabInfo;
  await BrowserTestUtils.waitForEvent(tab.chromeBrowser, "MsgLoaded");
  return tab;
}

async function openMessageInWindow(msgHdr) {
  if (!msgHdr.QueryInterface(Ci.nsIMsgDBHdr)) {
    throw new Error("No message passed to openMessageInWindow");
  }

  const messageWindowPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    async win =>
      win.document.documentURI ==
      "chrome://messenger/content/messageWindow.xhtml"
  );
  MailUtils.openMessageInNewWindow(msgHdr);

  const messageWindow = await messageWindowPromise;
  await BrowserTestUtils.waitForEvent(messageWindow, "MsgLoaded");
  return messageWindow;
}

async function promiseMessageLoaded(browser, msgHdr) {
  let messageURI = msgHdr.folder.getUriForMsg(msgHdr);
  messageURI = MailServices.messageServiceFromURI(messageURI).getUrlForUri(
    messageURI,
    null
  );

  await awaitBrowserLoaded(browser, uri => uri == messageURI.spec);
}

/**
 * Check the headers of an open compose window against expected values.
 *
 * @param {object} expected - A dictionary of expected headers.
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
  const composeWindows = [...Services.wm.getEnumerator("msgcompose")];
  is(composeWindows.length, 1);
  const composeDocument = composeWindows[0].document;
  const composeFields = composeWindows[0].gMsgCompose.compFields;

  await new Promise(resolve => composeWindows[0].setTimeout(resolve));

  if ("identityId" in expected) {
    is(composeWindows[0].getCurrentIdentityKey(), expected.identityId);
  }

  if (expected.attachVCard) {
    is(
      expected.attachVCard,
      composeFields.attachVCard,
      "attachVCard in window should be correct"
    );
  }

  const checkField = (fieldName, elementId) => {
    const pills = composeDocument
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

  const subject = composeDocument.getElementById("msgSubject").value;
  if ("subject" in expected) {
    is(subject, expected.subject, "subject is correct");
  } else {
    is(subject, "", "subject is empty");
  }

  if (expected.overrideDefaultFcc) {
    if (expected.overrideDefaultFccFolder) {
      const server = MailServices.accounts.getAccount(
        expected.overrideDefaultFccFolder.accountId
      ).incomingServer;
      const rootURI = server.rootFolder.URI;
      is(
        rootURI + expected.overrideDefaultFccFolder.path,
        composeFields.fcc,
        "fcc should be correct"
      );
    } else {
      ok(
        composeFields.fcc.startsWith("nocopy://"),
        "fcc should start with nocopy://"
      );
    }
  } else {
    is("", composeFields.fcc, "fcc should be empty");
  }

  if (expected.additionalFccFolder) {
    const server = MailServices.accounts.getAccount(
      expected.additionalFccFolder.accountId
    ).incomingServer;
    const rootURI = server.rootFolder.URI;
    is(
      rootURI + expected.additionalFccFolder.path,
      composeFields.fcc2,
      "fcc2 should be correct"
    );
  } else {
    ok(
      composeFields.fcc2 == "" || composeFields.fcc2.startsWith("nocopy://"),
      "fcc2 should not contain a folder uri"
    );
  }

  if (expected.hasOwnProperty("priority")) {
    is(
      composeFields.priority.toLowerCase(),
      expected.priority == "normal" ? "" : expected.priority,
      "priority in composeFields should be correct"
    );
  }

  if (expected.hasOwnProperty("returnReceipt")) {
    is(
      composeFields.returnReceipt,
      expected.returnReceipt,
      "returnReceipt in composeFields should be correct"
    );
    for (const item of composeDocument.querySelectorAll(`menuitem[command="cmd_toggleReturnReceipt"],
    toolbarbutton[command="cmd_toggleReturnReceipt"]`)) {
      is(
        item.getAttribute("checked") == "true",
        expected.returnReceipt,
        "returnReceipt in window should be correct"
      );
    }
  }

  if (expected.hasOwnProperty("deliveryStatusNotification")) {
    is(
      composeFields.DSN,
      !!expected.deliveryStatusNotification,
      "deliveryStatusNotification in composeFields should be correct"
    );
    is(
      composeDocument.getElementById("dsnMenu").getAttribute("checked") ==
        "true",
      !!expected.deliveryStatusNotification,
      "deliveryStatusNotification in window should be correct"
    );
  }

  if (expected.hasOwnProperty("deliveryFormat")) {
    const deliveryFormats = {
      auto: Ci.nsIMsgCompSendFormat.Auto,
      plaintext: Ci.nsIMsgCompSendFormat.PlainText,
      html: Ci.nsIMsgCompSendFormat.HTML,
      both: Ci.nsIMsgCompSendFormat.Both,
    };
    const formatToId = new Map([
      [Ci.nsIMsgCompSendFormat.PlainText, "format_plain"],
      [Ci.nsIMsgCompSendFormat.HTML, "format_html"],
      [Ci.nsIMsgCompSendFormat.Both, "format_both"],
      [Ci.nsIMsgCompSendFormat.Auto, "format_auto"],
    ]);
    const expectedFormat = deliveryFormats[expected.deliveryFormat || "auto"];
    is(
      expectedFormat,
      composeFields.deliveryFormat,
      "deliveryFormat in composeFields should be correct"
    );
    for (const [format, id] of formatToId.entries()) {
      const menuitem = composeDocument.getElementById(id);
      is(
        format == expectedFormat,
        menuitem.getAttribute("checked") == "true",
        "checked state of the deliveryFormat menu item <${id}> in window should be correct"
      );
    }
  }
}

async function synthesizeMouseAtCenterAndRetry(selector, event, browser) {
  let success = false;
  const type = event.type || "click";
  for (let retries = 0; !success && retries < 2; retries++) {
    const clickPromise = BrowserTestUtils.waitForContentEvent(
      browser,
      type
    ).then(() => true);
    // Linux: Sometimes the actor used to simulate the mouse event in the content process does not
    // react, even though the content page signals to be fully loaded. There is no status signal
    // we could wait for, the loaded page *should* be ready at this point. To mitigate, we wait
    // for the click event and if we do not see it within a certain time, we click again.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    const failPromise = new Promise(r =>
      browser.ownerGlobal.setTimeout(r, 500)
    ).then(() => false);

    await BrowserTestUtils.synthesizeMouseAtCenter(selector, event, browser);
    success = await Promise.race([clickPromise, failPromise]);
  }
  Assert.ok(success, `Should have received ${type} event.`);
}

async function openContextMenu(selector = "#img1", win = window) {
  const contentAreaContextMenu = win.document.getElementById("browserContext");
  const popupShownPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popupshown"
  );
  const tabmail = document.getElementById("tabmail");
  await synthesizeMouseAtCenterAndRetry(
    selector,
    { type: "mousedown", button: 2 },
    tabmail.selectedBrowser
  );
  await synthesizeMouseAtCenterAndRetry(
    selector,
    { type: "contextmenu" },
    tabmail.selectedBrowser
  );
  await popupShownPromise;
  return contentAreaContextMenu;
}

async function openContextMenuInPopup(extension, selector, win = window) {
  const contentAreaContextMenu =
    win.top.document.getElementById("browserContext");
  const stack = getBrowserActionPopup(extension, win);
  const browser = stack.querySelector("browser");
  const popupShownPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popupshown"
  );
  await synthesizeMouseAtCenterAndRetry(
    selector,
    { type: "mousedown", button: 2 },
    browser
  );
  await synthesizeMouseAtCenterAndRetry(
    selector,
    { type: "contextmenu" },
    browser
  );
  await popupShownPromise;
  return contentAreaContextMenu;
}

async function closeExtensionContextMenu(
  itemToSelect,
  modifiers = {},
  win = window
) {
  const contentAreaContextMenu =
    win.top.document.getElementById("browserContext");
  const popupHiddenPromise = BrowserTestUtils.waitForEvent(
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

async function openSubmenu(submenuItem) {
  const submenu = submenuItem.menupopup;
  const shown = BrowserTestUtils.waitForEvent(submenu, "popupshown");
  submenuItem.openMenu(true);
  await shown;
  return submenu;
}

async function closeContextMenu(contextMenu) {
  const contentAreaContextMenu =
    contextMenu || document.getElementById("browserContext");
  const popupHiddenPromise = BrowserTestUtils.waitForEvent(
    contentAreaContextMenu,
    "popuphidden"
  );
  contentAreaContextMenu.hidePopup();
  await popupHiddenPromise;
}

async function getUtilsJS() {
  const response = await fetch(getRootDirectory(gTestPath) + "utils.js");
  return response.text();
}

async function checkContent(browser, expected) {
  await SpecialPowers.spawn(browser, [expected], async expected => {
    let body = content.document.body;
    Assert.ok(body, "body");
    const computedStyle = content.getComputedStyle(body);

    if ("backgroundColor" in expected) {
      if (computedStyle.backgroundColor != expected.backgroundColor) {
        // Give it a bit more time if things weren't settled.
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => content.setTimeout(resolve, 500));
      }
      Assert.equal(
        computedStyle.backgroundColor,
        expected.backgroundColor,
        "backgroundColor"
      );
    }
    if ("color" in expected) {
      if (computedStyle.color != expected.color) {
        // Give it a bit more time if things weren't settled.
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => content.setTimeout(resolve, 500));
      }
      Assert.equal(computedStyle.color, expected.color, "color");
    }
    if ("foo" in expected) {
      if (body.getAttribute("foo") != expected.foo) {
        // Give it a bit more time if things weren't settled.
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => content.setTimeout(resolve, 500));
      }
      Assert.equal(body.getAttribute("foo"), expected.foo, "foo");
    }
    if ("textContent" in expected) {
      // In message display, we only really want the message body, but the
      // document body also has headers. For the purposes of these tests,
      // we can just select an descendant node, since what really matters is
      // whether (or not) a script ran, not the exact result.
      body = body.querySelector(".moz-text-flowed") ?? body;
      if (body.textContent != expected.textContent) {
        // Give it a bit more time if things weren't settled.
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => content.setTimeout(resolve, 500));
      }
      Assert.equal(body.textContent, expected.textContent, "textContent");
    }
  });
}

function contentTabOpenPromise(tabmail, url) {
  return new Promise(resolve => {
    const tabMonitor = {
      onTabTitleChanged() {},
      onTabClosing() {},
      onTabPersist() {},
      onTabRestored() {},
      onTabSwitched() {},
      async onTabOpened(aTab) {
        const result = awaitBrowserLoaded(
          aTab.linkedBrowser,
          urlToMatch => urlToMatch == url
        ).then(() => aTab);

        const reporterListener = {
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

/**
 * @typedef ConfigData
 * @property {string} actionType - type of action button in underscore notation
 * @property {string} window - the window to perform the test in
 * @property {string} [testType] - supported tests are "open-with-mouse-click" and
 *   "open-with-menu-command"
 * @property {string} [default_area] - area to be used for the test
 * @property {boolean} [use_default_popup] - select if the default_popup should be
 *  used for the test
 * @property {boolean} [disable_button] - select if the button should be disabled
 * @property {Function} [backend_script] - custom backend script to be used for the
 *  test, will override the default backend_script of the selected test
 * @property {Function} [background_script] - custom background script to be used for the
 *  test, will override the default background_script of the selected test
 * @property {[string]} [permissions] - custom permissions to be used for the test,
 *  must not be specified together with testType
 */

/**
 * Creates an extension with an action button and either runs one of the default
 * tests, or loads a custom background script and a custom backend scripts to run
 * an arbitrary test.
 *
 * @param {ConfigData} configData - test configuration
 */
async function run_popup_test(configData) {
  if (!configData.actionType) {
    throw new Error("Mandatory configData.actionType is missing");
  }
  if (!configData.window) {
    throw new Error("Mandatory configData.window is missing");
  }

  // Get camelCase API names from action type.
  configData.apiName = configData.actionType.replace(/_([a-z])/g, function (g) {
    return g[1].toUpperCase();
  });
  configData.moduleName =
    configData.actionType == "action" ? "browserAction" : configData.apiName;

  let backend_script = configData.backend_script;

  const extensionDetails = {
    files: {
      "popup.html": `<!DOCTYPE html>
                      <html>
                        <head>
                          <title>Popup</title>
                        </head>
                        <body>
                          <p>Hello</p>
                          <script src="popup.js"></script>
                        </body>
                      </html>`,
      "popup.js": async function () {
        // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
        await new Promise(resolve => window.setTimeout(resolve, 1000));
        await browser.runtime.sendMessage("popup opened");
        await new Promise(resolve => window.setTimeout(resolve));
        window.close();
      },
      "utils.js": await getUtilsJS(),
      "helper.js": function () {
        window.actionType = browser.runtime.getManifest().description;
        // Get camelCase API names from action type.
        window.apiName = window.actionType.replace(/_([a-z])/g, function (g) {
          return g[1].toUpperCase();
        });
        window.getPopupOpenedPromise = function () {
          return new Promise(resolve => {
            const handleMessage = async (message, sender, sendResponse) => {
              if (message && message == "popup opened") {
                sendResponse();
                window.setTimeout(resolve);
                browser.runtime.onMessage.removeListener(handleMessage);
              }
            };
            browser.runtime.onMessage.addListener(handleMessage);
          });
        };
      },
    },
    manifest: {
      manifest_version: configData.manifest_version || 2,
      browser_specific_settings: {
        gecko: {
          id: `${configData.actionType}@mochi.test`,
        },
      },
      description: configData.actionType,
      background: { scripts: ["utils.js", "helper.js", "background.js"] },
    },
    useAddonManager: "temporary",
  };

  switch (configData.testType) {
    case "open-with-mouse-click":
      backend_script = async function (extension, configData) {
        const win = configData.window;

        await extension.startup();
        await promiseAnimationFrame(win);
        await new Promise(resolve => win.setTimeout(resolve));
        await extension.awaitMessage("ready");

        const buttonId = `${configData.actionType}_mochi_test-${configData.moduleName}-toolbarbutton`;
        let toolbarId;
        switch (configData.actionType) {
          case "compose_action":
            toolbarId = "composeToolbar2";
            if (configData.default_area == "formattoolbar") {
              toolbarId = "FormatToolbar";
            }
            break;
          case "action":
          case "browser_action":
            if (configData.default_windows?.join(",") === "messageDisplay") {
              toolbarId = "mail-bar3";
            } else {
              toolbarId = "unified-toolbar";
            }
            break;
          case "message_display_action":
            toolbarId = "header-view-toolbar";
            break;
          default:
            throw new Error(
              `Unsupported configData.actionType: ${configData.actionType}`
            );
        }

        let toolbar, button;
        if (toolbarId === "unified-toolbar") {
          toolbar = win.document.querySelector("unified-toolbar");
          button = win.document.querySelector(
            `#unifiedToolbarContent [extension="${configData.actionType}@mochi.test"]`
          );
        } else {
          toolbar = win.document.getElementById(toolbarId);
          button = win.document.getElementById(buttonId);
        }
        ok(button, "Button created");
        ok(toolbar.contains(button), "Button added to toolbar");
        let label;
        if (toolbarId === "unified-toolbar") {
          const state = getState();
          const itemId = `ext-${configData.actionType}@mochi.test`;
          if (state.mail) {
            ok(
              state.mail.includes(itemId),
              "Button should be in unified toolbar mail space"
            );
          }
          ok(
            getDefaultItemIdsForSpace("mail").includes(itemId),
            "Button should be in default set for unified toolbar mail space"
          );
          ok(
            getAvailableItemIdsForSpace("mail").includes(itemId),
            "Button should be available in unified toolbar mail space"
          );

          const icon = button.querySelector(".button-icon");
          is(
            getComputedStyle(icon).content,
            makeIconSet(`url("chrome://messenger/content/extension.svg")`),
            "Default icon"
          );
          label = button.querySelector(".button-label");
          is(label.textContent, "This is a test", "Correct label");
        } else {
          if (toolbar.hasAttribute("customizable")) {
            ok(
              toolbar.currentSet.split(",").includes(buttonId),
              `Button should have been added to currentSet property of toolbar ${toolbarId}`
            );
            ok(
              toolbar.getAttribute("currentset").split(",").includes(buttonId),
              `Button should have been added to currentset attribute of toolbar ${toolbarId}`
            );
          }
          ok(
            Services.xulStore
              .getValue(win.location.href, toolbarId, "currentset")
              .split(",")
              .includes(buttonId),
            `Button should have been added to currentset xulStore of toolbar ${toolbarId}`
          );

          const icon = button.querySelector(".toolbarbutton-icon");
          is(
            getComputedStyle(icon).listStyleImage,
            makeIconSet(`url("chrome://messenger/content/extension.svg")`),
            "Default icon"
          );
          label = button.querySelector(".toolbarbutton-text");
          is(label.value, "This is a test", "Correct label");
        }

        if (
          !configData.use_default_popup &&
          configData?.manifest_version == 3
        ) {
          assertPersistentListeners(
            extension,
            configData.moduleName,
            "onClicked",
            {
              primed: false,
            }
          );
        }
        if (configData.terminateBackground) {
          await extension.terminateBackground({
            disableResetIdleForTest: true,
          });
          if (
            !configData.use_default_popup &&
            configData?.manifest_version == 3
          ) {
            assertPersistentListeners(
              extension,
              configData.moduleName,
              "onClicked",
              {
                primed: true,
              }
            );
          }
        }

        let clickedPromise;
        if (!configData.disable_button) {
          clickedPromise = extension.awaitMessage("actionButtonClicked");
        }
        EventUtils.synthesizeMouseAtCenter(button, { clickCount: 1 }, win);
        if (configData.disable_button) {
          // We're testing that nothing happens. Give it time to potentially happen.
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(resolve => win.setTimeout(resolve, 500));
          // In case the background was terminated, it should not restart.
          // If it does, we will get an extra "ready" message and fail.
          // Listeners should still be primed.
          if (
            configData.terminateBackground &&
            configData?.manifest_version == 3
          ) {
            assertPersistentListeners(
              extension,
              configData.moduleName,
              "onClicked",
              {
                primed: true,
              }
            );
          }
        } else {
          const hasFiredBefore = await clickedPromise;
          await promiseAnimationFrame(win);
          await new Promise(resolve => win.setTimeout(resolve));
          if (toolbarId === "unified-toolbar") {
            is(
              win.document.querySelector(
                `#unifiedToolbarContent [extension="${configData.actionType}@mochi.test"]`
              ),
              button
            );
            label = button.querySelector(".button-label");
            is(label.textContent, "New title", "Correct label");
          } else {
            is(win.document.getElementById(buttonId), button);
            label = button.querySelector(".toolbarbutton-text");
            is(label.value, "New title", "Correct label");
          }

          if (configData.terminateBackground) {
            // The onClicked event should have restarted the background script.
            await extension.awaitMessage("ready");
            // Could be undefined, but it must not be true
            is(false, !!hasFiredBefore);
          }
          if (
            !configData.use_default_popup &&
            configData?.manifest_version == 3
          ) {
            assertPersistentListeners(
              extension,
              configData.moduleName,
              "onClicked",
              {
                primed: false,
              }
            );
          }
        }

        // Check the open state of the action button.
        await TestUtils.waitForCondition(
          () => button.getAttribute("open") != "true",
          "Button should not have open state after the popup closed."
        );

        await extension.unload();
        await promiseAnimationFrame(win);
        await new Promise(resolve => win.setTimeout(resolve));

        ok(!win.document.getElementById(buttonId), "Button destroyed");

        if (toolbarId === "unified-toolbar") {
          const state = getState();
          const itemId = `ext-${configData.actionType}@mochi.test`;
          if (state.mail) {
            ok(
              !state.mail.includes(itemId),
              "Button should have been removed from unified toolbar mail space"
            );
          }
          ok(
            !getDefaultItemIdsForSpace("mail").includes(itemId),
            "Button should have been removed from default set for unified toolbar mail space"
          );
          ok(
            !getAvailableItemIdsForSpace("mail").includes(itemId),
            "Button should have no longer be available in unified toolbar mail space"
          );
        } else {
          ok(
            !Services.xulStore
              .getValue(win.top.location.href, toolbarId, "currentset")
              .split(",")
              .includes(buttonId),
            `Button should have been removed from currentset xulStore of toolbar ${toolbarId}`
          );
        }
      };
      if (configData.use_default_popup) {
        // With popup.
        extensionDetails.files["background.js"] = async function () {
          browser.test.log("popup background script ran");
          const popupPromise = window.getPopupOpenedPromise();
          browser.test.sendMessage("ready");
          await popupPromise;
          await browser[window.apiName].setTitle({ title: "New title" });
          browser.test.sendMessage("actionButtonClicked");
        };
      } else if (configData.disable_button) {
        // Without popup and disabled button.
        extensionDetails.files["background.js"] = async function () {
          browser.test.log("nopopup & button disabled background script ran");
          browser[window.apiName].onClicked.addListener(async () => {
            browser.test.fail(
              "Should not have seen the onClicked event for a disabled button"
            );
          });
          browser[window.apiName].disable();
          browser.test.sendMessage("ready");
        };
      } else {
        // Without popup.
        extensionDetails.files["background.js"] = async function () {
          let hasFiredBefore = false;
          browser.test.log("nopopup background script ran");
          browser[window.apiName].onClicked.addListener(async (tab, info) => {
            browser.test.assertEq("object", typeof tab);
            browser.test.assertEq("object", typeof info);
            browser.test.assertEq(0, info.button);
            browser.test.assertTrue(Array.isArray(info.modifiers));
            browser.test.assertEq(0, info.modifiers.length);
            const [currentTab] = await browser.tabs.query({
              active: true,
              currentWindow: true,
            });
            browser.test.assertEq(
              currentTab.id,
              tab.id,
              "Should find the correct tab"
            );
            await browser[window.apiName].setTitle({ title: "New title" });
            await new Promise(resolve => window.setTimeout(resolve));
            browser.test.sendMessage("actionButtonClicked", hasFiredBefore);
            hasFiredBefore = true;
          });
          browser.test.sendMessage("ready");
        };
      }
      break;

    case "open-with-menu-command":
      extensionDetails.manifest.permissions = ["menus"];
      backend_script = async function (extension, configData) {
        const win = configData.window;
        const buttonId = `${configData.actionType}_mochi_test-${configData.moduleName}-toolbarbutton`;
        let menuId = "toolbar-context-menu";
        let isUnifiedToolbar = false;
        if (
          configData.actionType == "compose_action" &&
          configData.default_area == "formattoolbar"
        ) {
          menuId = "format-toolbar-context-menu";
        }
        if (configData.actionType == "message_display_action") {
          menuId = "header-toolbar-context-menu";
        }
        if (
          (configData.actionType == "browser_action" ||
            configData.actionType == "action") &&
          configData.default_windows?.join(",") !== "messageDisplay"
        ) {
          menuId = "unifiedToolbarMenu";
          isUnifiedToolbar = true;
        }
        const getButton = windowContent => {
          if (isUnifiedToolbar) {
            return windowContent.document.querySelector(
              `#unifiedToolbarContent [extension="${configData.actionType}@mochi.test"]`
            );
          }
          return windowContent.document.getElementById(buttonId);
        };

        extension.onMessage("triggerClick", async () => {
          const button = getButton(win);
          const menu = win.document.getElementById(menuId);
          const onShownPromise = extension.awaitMessage("onShown");
          const shownPromise = BrowserTestUtils.waitForEvent(
            menu,
            "popupshown"
          );
          EventUtils.synthesizeMouseAtCenter(
            button,
            { type: "contextmenu" },
            win
          );
          await shownPromise;
          await onShownPromise;
          await new Promise(resolve => win.setTimeout(resolve));

          const menuitem = win.document.getElementById(
            `${configData.actionType}_mochi_test-menuitem-_testmenu`
          );
          Assert.ok(menuitem);
          menuitem.parentNode.activateItem(menuitem);

          // Sometimes, the popup will open then instantly disappear. It seems to
          // still be hiding after the previous appearance. If we wait a little bit,
          // this doesn't happen.
          // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
          await new Promise(r => win.setTimeout(r, 250));
          extension.sendMessage();
        });

        await extension.startup();
        await extension.awaitFinish();

        // Check the open state of the action button.
        const button = getButton(win);
        await TestUtils.waitForCondition(
          () => button.getAttribute("open") != "true",
          "Button should not have open state after the popup closed."
        );

        await extension.unload();
      };
      if (configData.use_default_popup) {
        // With popup.
        extensionDetails.files["background.js"] = async function () {
          browser.test.log("popup background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          const popupPromise = window.getPopupOpenedPromise();
          await window.sendMessage("triggerClick");
          await popupPromise;

          browser.test.notifyPass();
        };
      } else if (configData.disable_button) {
        // Without popup and disabled button.
        extensionDetails.files["background.js"] = async function () {
          browser.test.log("nopopup & button disabled background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          browser[window.apiName].onClicked.addListener(async () => {
            browser.test.fail(
              "Should not have seen the onClicked event for a disabled button"
            );
          });

          await browser[window.apiName].disable();
          await window.sendMessage("triggerClick");
          browser.test.notifyPass();
        };
      } else {
        // Without popup.
        extensionDetails.files["background.js"] = async function () {
          browser.test.log("nopopup background script ran");
          await new Promise(resolve => {
            browser.menus.create(
              {
                id: "testmenu",
                title: `Open ${window.actionType}`,
                contexts: [window.actionType],
                command: `_execute_${window.actionType}`,
              },
              resolve
            );
          });

          await browser.menus.onShown.addListener((...args) => {
            browser.test.sendMessage("onShown", args);
          });

          const clickPromise = new Promise(resolve => {
            const listener = async (tab, info) => {
              browser[window.apiName].onClicked.removeListener(listener);
              browser.test.assertEq("object", typeof tab);
              browser.test.assertEq("object", typeof info);
              browser.test.assertEq(0, info.button);
              browser.test.assertTrue(Array.isArray(info.modifiers));
              browser.test.assertEq(0, info.modifiers.length);
              browser.test.log(`Tab ID is ${tab.id}`);
              resolve();
            };
            browser[window.apiName].onClicked.addListener(listener);
          });
          await window.sendMessage("triggerClick");
          await clickPromise;

          browser.test.notifyPass();
        };
      }
      break;
  }

  extensionDetails.manifest[configData.actionType] = {
    default_title: "This is a test",
  };
  if (configData.use_default_popup) {
    extensionDetails.manifest[configData.actionType].default_popup =
      "popup.html";
  }
  if (configData.default_area) {
    extensionDetails.manifest[configData.actionType].default_area =
      configData.default_area;
  }
  if (configData.hasOwnProperty("background")) {
    extensionDetails.files["background.js"] = configData.background_script;
  }
  if (configData.hasOwnProperty("permissions")) {
    extensionDetails.manifest.permissions = configData.permissions;
  }
  if (configData.default_windows) {
    extensionDetails.manifest[configData.actionType].default_windows =
      configData.default_windows;
  }

  const extension = ExtensionTestUtils.loadExtension(extensionDetails);
  await backend_script(extension, configData);
}

async function run_action_button_order_test(configs, window, actionType) {
  // Get camelCase API names from action type.
  const apiName = actionType.replace(/_([a-z])/g, function (g) {
    return g[1].toUpperCase();
  });

  function get_id(name) {
    return `${name}_mochi_test-${apiName}-toolbarbutton`;
  }

  function test_buttons(configs, window, toolbars) {
    for (const toolbarId of toolbars) {
      const expected = configs.filter(e => e.toolbar == toolbarId);
      const selector =
        toolbarId === "unified-toolbar"
          ? `#unifiedToolbarContent [extension$="@mochi.test"]`
          : `#${toolbarId} toolbarbutton[id$="${get_id("")}"]`;
      const buttons = window.document.querySelectorAll(selector);
      Assert.equal(
        expected.length,
        buttons.length,
        `Should find the correct number of buttons in ${toolbarId} toolbar`
      );
      for (let i = 0; i < buttons.length; i++) {
        if (toolbarId === "unified-toolbar") {
          Assert.equal(
            `${expected[i].name}@mochi.test`,
            buttons[i].getAttribute("extension"),
            `Should find the correct button at location #${i}`
          );
        } else {
          Assert.equal(
            get_id(expected[i].name),
            buttons[i].id,
            `Should find the correct button at location #${i}`
          );
        }
      }
    }
  }

  // Create extension data.
  const toolbars = new Set();
  for (const config of configs) {
    toolbars.add(config.toolbar);
    config.extensionData = {
      useAddonManager: "permanent",
      manifest: {
        applications: {
          gecko: {
            id: `${config.name}@mochi.test`,
          },
        },
        [actionType]: {
          default_title: config.name,
        },
      },
    };
    if (config.area) {
      config.extensionData.manifest[actionType].default_area = config.area;
    }
    if (config.default_windows) {
      config.extensionData.manifest[actionType].default_windows =
        config.default_windows;
    }
  }

  // Test order of buttons after first install.
  for (const config of configs) {
    config.extension = ExtensionTestUtils.loadExtension(config.extensionData);
    await config.extension.startup();
  }
  test_buttons(configs, window, toolbars);

  // Disable all buttons.
  for (const config of configs) {
    const addon = await AddonManager.getAddonByID(config.extension.id);
    await addon.disable();
  }
  test_buttons([], window, toolbars);

  // Re-enable all buttons in reversed order, displayed order should not change.
  for (const config of [...configs].reverse()) {
    const addon = await AddonManager.getAddonByID(config.extension.id);
    await addon.enable();
  }
  test_buttons(configs, window, toolbars);

  // Re-install all extensions in reversed order, displayed order should not change.
  for (const config of [...configs].reverse()) {
    config.extension2 = ExtensionTestUtils.loadExtension(config.extensionData);
    await config.extension2.startup();
  }
  test_buttons(configs, window, toolbars);

  // Remove all extensions.
  for (const config of [...configs].reverse()) {
    await config.extension.unload();
    await config.extension2.unload();
  }
  test_buttons([], window, toolbars);
}

/**
 * Helper method to switch to a cards view with vertical layout.
 */
async function ensure_cards_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "cards"
  );
  threadPane.updateThreadView("cards");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-card",
    "The tree view switched to a cards layout"
  );
}

/**
 * Helper method to switch to a table view with classic layout.
 */
async function ensure_table_view() {
  const { threadTree, threadPane } =
    document.getElementById("tabmail").currentAbout3Pane;

  Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
  Services.xulStore.setValue(
    "chrome://messenger/content/messenger.xhtml",
    "threadPane",
    "view",
    "table"
  );
  threadPane.updateThreadView("table");

  await BrowserTestUtils.waitForCondition(
    () => threadTree.getAttribute("rows") == "thread-row",
    "The tree view switched to a table layout"
  );
}
