/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the many ways to set and clear the spam flag on messages.
 *
 * Tested elsewhere:
 * - The junk item at the top of the mail context menu
 *   (browser_mailContext_navigation.js).
 * - The "run junk mail controls" and "delete mail marked as junk" menu
 *   commands, but not the UI for them (browser_junkCommands.js).
 * - What to do when a message is manually marked as spam (test_junkActions.js).
 *
 * TODO: Test the icon in the message list.
 * - Does it always show the right thing?
 * - Does it clicking on it work as expected?
 */

requestLongerTimeout(3);

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

const gDbService = Cc["@mozilla.org/msgDatabase/msgDBService;1"].getService(
  Ci.nsIMsgDBService
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
let testFolder, testMessages;

add_setup(async function () {
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  const stateChange = TestUtils.topicObserved("unified-toolbar-state-change");
  storeState({ mail: ["junk"] });
  await stateChange;

  const generator = new MessageGenerator();

  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  testFolder = rootFolder
    .createLocalSubfolder("spamMenu")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testMessages = testFolder.addMessageBatch(
    generator.makeMessages({}).map(message => message.toMessageString())
  );

  registerCleanupFunction(() => {
    about3Pane.messagePane.clearAll();
    MailServices.accounts.removeAccount(account, false);
    storeState({});
    MailServices.junk.resetTrainingData();
  });
});

/**
 * Tests Mark menu items with a single message selected.
 *
 * @param {nsIMsgDBHdr} message - The message to operate on.
 * @param {Function} openPopupCallback - One of the "open" functions below.
 * @param {Browser} aboutMessageBrowser - The about:message browser that will
 *   be displaying the message.
 */
async function subtestSingleMessage(
  message,
  openPopupCallback,
  aboutMessageBrowser
) {
  Assert.equal(message.getStringProperty("junkscore"), "");

  info("setting the spam flag on the message");

  let changePromise = promiseScoreChanged(message);
  let { markPopup, markItem, unmarkItem } = await openPopupCallback();
  markPopup.activateItem(markItem);
  await promisePopupClosed(markPopup);
  await changePromise;
  await messageLoadedIn(aboutMessageBrowser);

  Assert.equal(message.getStringProperty("junkscore"), "100");

  info("removing the spam flag from the message");

  changePromise = promiseScoreChanged(message);
  ({ markPopup, markItem, unmarkItem } = await openPopupCallback());
  markPopup.activateItem(unmarkItem);
  await promisePopupClosed(markPopup);
  await changePromise;
  await messageLoadedIn(aboutMessageBrowser);

  Assert.equal(message.getStringProperty("junkscore"), "0");

  message.setStringProperty("junkscore", "");
  MailServices.junk.resetTrainingData();
}

/**
 * Tests Mark menu items with multiple messages selected. Unlike
 * `subtestSingleMessage` this function selects the messages to operate on.
 *
 * @param {Function} openPopupCallback - One of the "open" functions below.
 */
async function subtestMultipleMessages(openPopupCallback) {
  info("selecting multiple messages");

  about3Pane.displayFolder(testFolder);
  about3Pane.threadTree.selectedIndices = [2, 3, 4];

  const messages = about3Pane.gDBView.getSelectedMsgHdrs();
  Assert.equal(messages[0].getStringProperty("junkscore"), "");
  Assert.equal(messages[1].getStringProperty("junkscore"), "");
  Assert.equal(messages[2].getStringProperty("junkscore"), "");

  info("setting the spam flag on the messages");

  let changePromise = promiseScoreChanged(messages[2]);
  let { markPopup, markItem, unmarkItem } = await openPopupCallback();
  markPopup.activateItem(markItem);
  await promisePopupClosed(markPopup);
  await changePromise;

  Assert.equal(messages[0].getStringProperty("junkscore"), "100");
  Assert.equal(messages[1].getStringProperty("junkscore"), "100");
  Assert.equal(messages[2].getStringProperty("junkscore"), "100");

  info("removing the spam flag from the messages");

  changePromise = promiseScoreChanged(messages[2]);
  ({ markPopup, markItem, unmarkItem } = await openPopupCallback());
  markPopup.activateItem(unmarkItem);
  await promisePopupClosed(markPopup);
  await changePromise;

  Assert.equal(messages[0].getStringProperty("junkscore"), "0");
  Assert.equal(messages[1].getStringProperty("junkscore"), "0");
  Assert.equal(messages[2].getStringProperty("junkscore"), "0");

  messages[0].setStringProperty("junkscore", "");
  messages[1].setStringProperty("junkscore", "");
  messages[2].setStringProperty("junkscore", "");
  MailServices.junk.resetTrainingData();
}

/**
 * Tests key shortcuts to set and clear the spam flag.
 *
 * @param {nsIMsgDBHdr} message - The currently selected messages.
 * @param {Window} win - The window to simulate key presses in.
 * @param {Browser} aboutMessageBrowser - The about:message browser that will
 *   be displaying the message.
 */
async function subtestKeys(message, win, aboutMessageBrowser) {
  Assert.equal(message.getStringProperty("junkscore"), "");

  let changePromise = promiseScoreChanged(message);
  EventUtils.synthesizeKey("j", {}, win);
  await changePromise;
  await messageLoadedIn(aboutMessageBrowser);

  Assert.equal(message.getStringProperty("junkscore"), "100");

  changePromise = promiseScoreChanged(message);
  EventUtils.synthesizeKey("j", { shiftKey: true }, win);
  await changePromise;
  await messageLoadedIn(aboutMessageBrowser);

  Assert.equal(message.getStringProperty("junkscore"), "0");

  message.setStringProperty("junkscore", "");
  MailServices.junk.resetTrainingData();
}

/**
 * Tests the header button to set the spam flag.
 *
 * @param {nsIMsgDBHdr[]} messages - The currently selected messages.
 * @param {Element} button - The button to use.
 * @param {Browser} aboutMessageBrowser - The about:message browser that will
 *   be displaying the message.
 */
async function subtestHeaderButton(messages, button, aboutMessageBrowser) {
  for (const message of messages) {
    Assert.equal(message.getStringProperty("junkscore"), "");
  }

  let changePromise = promiseScoreChanged(messages.at(-1));
  EventUtils.synthesizeMouseAtCenter(button, {}, button.ownerGlobal);
  await changePromise;
  if (messages.length == 1) {
    await messageLoadedIn(aboutMessageBrowser);
  }

  for (const message of messages) {
    Assert.equal(message.getStringProperty("junkscore"), "100");
  }

  if (messages.length == 1) {
    const bar =
      aboutMessageBrowser.contentWindow.gMessageNotificationBar
        .msgNotificationBar;
    Assert.equal(bar.allNotifications.length, 1);

    changePromise = promiseScoreChanged(messages[0]);
    EventUtils.synthesizeMouseAtCenter(
      bar.currentNotification._buttons[1],
      {},
      aboutMessageBrowser.contentWindow
    );
    await changePromise;
    await messageLoadedIn(aboutMessageBrowser);

    for (const message of messages) {
      Assert.equal(message.getStringProperty("junkscore"), "0");
    }
  }

  for (const message of messages) {
    message.setStringProperty("junkscore", "");
  }
  MailServices.junk.resetTrainingData();
}

/**
 * Tests the unified toolbar button to set and clear the spam flag.
 *
 * @param {nsIMsgDBHdr[]} messages - The currently selected messages.
 * @param {Element} button - The button to use.
 */
async function subtestToolbarButton(messages, button) {
  const spam = "spam";
  const notSpam = "not-spam";
  const assertButtonLabel = expected => {
    Assert.deepEqual(
      button.querySelector("[is='spam-button']").getAttribute("label-id"),
      `toolbar-${expected}-label`,
      "Spam toolbar button has the correct label."
    );
  };

  if (!messages.length) {
    Assert.ok(
      button.querySelector("[is='spam-button']").hasAttribute("disabled"),
      "Spam button is disabled when no message is selected"
    );
    return;
  }

  // Ensure the spam score of the messages is reset.
  for (const message of messages) {
    Assert.equal(message.getStringProperty("junkscore"), "");
  }
  assertButtonLabel(spam);

  // Mark as spam.
  let changePromise = promiseScoreChanged(messages.at(-1));
  EventUtils.synthesizeMouseAtCenter(button, {}, button.ownerGlobal);
  await changePromise;
  for (const message of messages) {
    Assert.equal(message.getStringProperty("junkscore"), "100");
  }
  assertButtonLabel(notSpam);

  // Mark as not spam.
  changePromise = promiseScoreChanged(messages[0]);
  EventUtils.synthesizeMouseAtCenter(button, {}, button.ownerGlobal);
  await changePromise;
  for (const message of messages) {
    Assert.equal(message.getStringProperty("junkscore"), "0");
  }
  assertButtonLabel(spam);

  // Reset spam score of the messages.
  for (const message of messages) {
    message.setStringProperty("junkscore", "");
  }
  assertButtonLabel(spam);

  MailServices.junk.resetTrainingData();
}

add_task(async function testMailContextFromThreadTree() {
  const message = await selectMessageInAbout3Pane(0);
  await subtestSingleMessage(
    message,
    openMailContextFromThreadTree.bind(undefined, 0),
    about3Pane.messageBrowser
  );
  await subtestMultipleMessages(
    openMailContextFromThreadTree.bind(undefined, 2)
  );
});

add_task(async function testMailContextFromMessagePane() {
  const message = await selectMessageInAbout3Pane(5);
  await subtestSingleMessage(
    message,
    openMailContextFromMessagePane,
    about3Pane.messageBrowser
  );
});

add_task(async function testHeaderButton() {
  const message = await selectMessageInAbout3Pane(1);
  await subtestHeaderButton(
    [message],
    getHeaderButton(),
    about3Pane.messageBrowser
  );
});

add_task(async function testToolbarButton() {
  const message = await selectMessageInAbout3Pane(0);
  await subtestToolbarButton([message], getToolbarButton());
  about3Pane.threadTree.selectedIndices = [2, 3, 4];
  await subtestToolbarButton(
    about3Pane.gDBView.getSelectedMsgHdrs(),
    getToolbarButton()
  );
  about3Pane.threadTree.selectedIndices = [];
  await subtestToolbarButton([], getToolbarButton());
});

add_task(async function testMessageMenu() {
  const message = await selectMessageInAbout3Pane(8);
  await subtestSingleMessage(
    message,
    openMessageMenu,
    about3Pane.messageBrowser
  );
  await subtestMultipleMessages(openMessageMenu);
  await messageLoadedIn(about3Pane.messageBrowser);
}).skip(AppConstants.platform == "macosx");

add_task(async function testKeys() {
  let message = await selectMessageInAbout3Pane(6);

  info("testing keys with focus on the folder pane");
  about3Pane.folderTree.focus();
  await subtestKeys(message, about3Pane, about3Pane.messageBrowser);

  info("testing keys with focus on the thread pane");
  about3Pane.threadTree.table.body.focus();
  await subtestKeys(message, about3Pane, about3Pane.messageBrowser);

  info("testing keys with focus on the message pane");
  message = await selectMessageInAbout3Pane(1);
  const messagePaneBrowser =
    about3Pane.messageBrowser.contentWindow.getMessagePaneBrowser();
  messagePaneBrowser.focus();
  await subtestKeys(
    message,
    messagePaneBrowser.contentWindow,
    about3Pane.messageBrowser
  );
});

add_task(async function testMessageTab() {
  const tabPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  const tab = window.OpenMessageInNewTab(testMessages[7], {
    background: false,
  });
  const { detail: message } = await tabPromise;
  await messageLoadedIn(tab.chromeBrowser);

  info("testing mail context from messagepane");
  await subtestSingleMessage(
    message,
    openMailContextFromMessagePane,
    tab.chromeBrowser
  );

  info("testing header popup");
  await subtestHeaderButton([message], getHeaderButton(), tab.chromeBrowser);

  info("testing toolbar popup");
  await subtestToolbarButton([message], getToolbarButton());

  if (AppConstants.platform != "macosx") {
    info("testing message menu");
    await subtestSingleMessage(message, openMessageMenu, tab.chromeBrowser);
  }

  info("testing keys");
  await subtestKeys(message, window, tab.chromeBrowser);
  tabmail.closeOtherTabs(0);
});

add_task(async function testMessageWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  window.MsgOpenNewWindowForMessage(testMessages[8]);
  const win = await winPromise;
  const { detail: message } = await BrowserTestUtils.waitForEvent(
    win,
    "MsgLoaded"
  );
  const aboutMessage = win.messageBrowser.contentWindow;
  await messageLoadedIn(win.messageBrowser);

  info("testing mail context from message pane");
  await subtestSingleMessage(
    message,
    openMailContextFromMessagePane.bind(undefined, aboutMessage),
    win.messageBrowser
  );

  info("testing header popup");
  await subtestHeaderButton(
    [message],
    getHeaderButton(aboutMessage),
    win.messageBrowser
  );

  if (AppConstants.platform != "macosx") {
    info("testing message menu");
    await subtestSingleMessage(
      message,
      openMessageMenu.bind(undefined, win),
      win.messageBrowser
    );
  }

  info("testing keys");
  await subtestKeys(message, win, win.messageBrowser);
  await BrowserTestUtils.closeWindow(win);
});

/**
 * Selects the first message in the thread pane and waits for it to load.
 *
 * @param {integer} index
 * @returns {nsIMsgDBHdr}
 */
async function selectMessageInAbout3Pane(index = 0) {
  about3Pane.displayFolder(testFolder);
  Assert.notEqual(
    index,
    about3Pane.threadTree.selectedIndex,
    `index ${index} should not already be selected`
  );
  about3Pane.threadTree.selectedIndex = index;
  await messageLoadedIn(about3Pane.messageBrowser);
  return about3Pane.gDBView.hdrForFirstSelectedMessage;
}

/**
 * Open the context menu from the thread pane and the Mark menu within.
 *
 * @param {integer} indexToClick - The index of the row to right-click on.
 * @returns {MozMenuPopup}
 */
async function openMailContextFromThreadTree(indexToClick) {
  const menu = about3Pane.document.getElementById("mailContext");
  const markMenu = about3Pane.document.getElementById("mailContext-mark");
  const markPopup = markMenu.menupopup;
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.threadTree.getRowAtIndex(indexToClick),
    { type: "contextmenu" },
    about3Pane
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  markMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(markPopup, "shown");
  await TestUtils.waitForTick();
  return {
    markPopup,
    markItem: markPopup.querySelector("#mailContext-markAsJunk"),
    unmarkItem: markPopup.querySelector("#mailContext-markAsNotJunk"),
  };
}

/**
 * Open the context menu from the message pane and the Mark menu within.
 *
 * @param {Window} [aboutMessage] - If not given, the about:message window
 *   from the current tab in the main window.
 * @returns {MozMenuPopup}
 */
async function openMailContextFromMessagePane(
  aboutMessage = tabmail.currentAboutMessage
) {
  const topWindow =
    aboutMessage.parent == aboutMessage.top
      ? aboutMessage
      : aboutMessage.parent;
  const menu = topWindow.document.getElementById("mailContext");
  const markMenu = topWindow.document.getElementById("mailContext-mark");
  const markPopup = markMenu.menupopup;
  const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
  await BrowserTestUtils.synthesizeMouseAtCenter(
    ":root",
    { type: "contextmenu" },
    messagePaneBrowser
  );
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  markMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(markPopup, "shown");
  await TestUtils.waitForTick();
  return {
    markPopup,
    markItem: markPopup.querySelector("#mailContext-markAsJunk"),
    unmarkItem: markPopup.querySelector("#mailContext-markAsNotJunk"),
  };
}

/**
 * Get the message header Junk button.
 *
 * @param {Window} [aboutMessage] - If not given, the about:message window
 *   from the current tab in the main window.
 * @returns {XULElement}
 */
function getHeaderButton(aboutMessage = tabmail.currentAboutMessage) {
  return aboutMessage.document.getElementById("hdrJunkButton");
}

/**
 * Get the Junk toolbar button.
 *
 * @param {Window} [win] - If not given, the main window.
 * @returns {HTMLButton}
 */
function getToolbarButton(win = window) {
  return win.document.querySelector(`#unifiedToolbarContent [item-id="junk"]`);
}

/**
 * Open the menu bar Message menu and the Mark menu within. This must not be
 * called on macOS where the menu bar is inaccessible to tests.
 *
 * @param {Window} [win] - If not given, the main window.
 * @returns {MozMenuPopup}
 */
async function openMessageMenu(win = window) {
  await SimpleTest.promiseFocus(win);
  const menu = win.document.getElementById("messageMenu");
  const markMenu = win.document.getElementById("markMenu");
  const markPopup = markMenu.menupopup;
  EventUtils.synthesizeMouseAtCenter(menu, {}, win);
  await BrowserTestUtils.waitForPopupEvent(menu, "shown");
  markMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(markPopup, "shown");
  await TestUtils.waitForTick();
  return {
    markPopup,
    markItem: markPopup.querySelector("#menu_markAsJunk"),
    unmarkItem: markPopup.querySelector("#menu_markAsNotJunk"),
  };
}

/**
 * Wait for a mark menu, and its parent if there is one, to be closed. If the
 * menu is open, close it.
 *
 * @param {MozMenuPopup} markPopup
 */
async function promisePopupClosed(markPopup) {
  const parentPopup = markPopup.parentNode.closest("menupopup");
  if (markPopup.state == "open") {
    markPopup.hidePopup();
  }
  await BrowserTestUtils.waitForPopupEvent(markPopup, "hidden");
  if (parentPopup.state == "open") {
    parentPopup.hidePopup();
  }
  await BrowserTestUtils.waitForPopupEvent(parentPopup, "hidden");
  await SimpleTest.promiseFocus(markPopup.ownerGlobal.top);
  await TestUtils.waitForTick();
}

/**
 * Wait for a message's junk score to change.
 *
 * @param {nsIMsgDBHdr} header
 * @returns {Promise} - Resolves when the header's junk score changes.
 */
function promiseScoreChanged(header) {
  return new Promise(resolve => {
    gDbService.registerPendingListener(testFolder, {
      onHdrFlagsChanged() {},
      onHdrDeleted() {},
      onHdrAdded() {},
      onParentChanged() {},
      onAnnouncerGoingAway() {},
      onReadChanged() {},
      onJunkScoreChanged() {},
      onHdrPropertyChanged(hdrToChange, property) {
        if (hdrToChange == header && property == "junkscore") {
          gDbService.unregisterPendingListener(this);
          TestUtils.waitForTick().then(resolve);
        }
      },
      onEvent() {},
    });
  });
}
