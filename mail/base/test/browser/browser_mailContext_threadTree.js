/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests items that only apply when the mail context menu is opened from the
 * thread tree.
 */

const { ConversationOpener } = ChromeUtils.importESModule(
  "resource:///modules/ConversationOpener.sys.mjs"
);
const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
const about3Pane = tabmail.currentAbout3Pane;
const mailContext = about3Pane.document.getElementById("mailContext");

let testMessages;

add_setup(async function () {
  const generator = new MessageGenerator();

  MailServices.accounts.createLocalMailAccount();
  const account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());
  const rootFolder = account.incomingServer.rootFolder.QueryInterface(
    Ci.nsIMsgLocalMailFolder
  );
  const testFolder = rootFolder
    .createLocalSubfolder("mailContext threadTree")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  testFolder.addMessageBatch(
    generator
      .makeMessages({ count: 15, msgsPerThread: 5 })
      .map(message => message.toMessageString())
  );
  testMessages = [...testFolder.messages];

  tabmail.currentAbout3Pane.restoreState({
    folderURI: testFolder.URI,
    messagePaneVisible: true,
  });

  registerCleanupFunction(() => {
    MailServices.accounts.removeAccount(account, false);
    Services.prefs.clearUserPref("mail.tabs.loadInBackground");
    Services.prefs.clearUserPref("mail.forward_message_mode");
  });
});

add_task(async function testOpenNewTab() {
  let tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  let msgLoadedPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  openAndActivate("mailContext-openNewTab");
  let {
    detail: { tabInfo },
  } = await tabPromise;
  let { target: aboutMessage } = await msgLoadedPromise;
  Assert.equal(tabInfo.mode.name, "mailMessageTab");
  Assert.equal(
    tabmail.currentTabInfo,
    tabmail.tabInfo[0],
    "tab should open in background"
  );
  Assert.equal(aboutMessage.gMessage, testMessages[0]);
  tabmail.closeTab(tabInfo);

  // Open tab with shift pressed.
  tabPromise = BrowserTestUtils.waitForEvent(tabmail.tabContainer, "TabOpen");
  msgLoadedPromise = BrowserTestUtils.waitForEvent(window, "MsgLoaded");
  openAndActivate("mailContext-openNewTab", true);
  ({
    detail: { tabInfo },
  } = await tabPromise);
  ({ target: aboutMessage } = await msgLoadedPromise);
  Assert.equal(tabInfo.mode.name, "mailMessageTab");
  Assert.equal(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in foreground"
  );
  Assert.equal(aboutMessage.gMessage, testMessages[0]);
  tabmail.closeTab(tabInfo);
});

add_task(async function testOpenNewWindow() {
  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded();
  openAndActivate("mailContext-openNewWindow");
  const win = await winPromise;
  const { target: aboutMessage } = await BrowserTestUtils.waitForEvent(
    win,
    "MsgLoaded"
  );
  await TestUtils.waitForCondition(() => Services.focus.activeWindow == win);
  Assert.equal(aboutMessage.gMessage, testMessages[0]);
  await BrowserTestUtils.closeWindow(win);
});

add_task(async function testOpenConversation() {
  await TestUtils.waitForCondition(
    () => testMessages.every(m => ConversationOpener.isMessageIndexed(m)),
    "waiting for Gloda to finish indexing",
    500
  );

  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail.tabContainer,
    "TabOpen"
  );
  openAndActivate("mailContext-openConversation");
  const {
    detail: { tabInfo },
  } = await tabPromise;
  Assert.equal(tabInfo.mode.name, "mail3PaneTab");
  Assert.equal(
    tabmail.currentTabInfo,
    tabInfo,
    "tab should open in foreground"
  );
  const newAbout3Pane = tabmail.currentAbout3Pane;
  await BrowserTestUtils.waitForEvent(newAbout3Pane, "folderURIChanged");
  Assert.equal(newAbout3Pane.gFolder, undefined);
  Assert.ok(newAbout3Pane.gViewWrapper.isSynthetic);
  await TestUtils.waitForCondition(
    () => newAbout3Pane.gDBView.rowCount == 5,
    "waiting for all messages to be in the view"
  );
  Assert.equal(newAbout3Pane.gDBView.getMsgHdrAt(0), testMessages[0]);
  tabmail.closeTab(tabInfo);
});

async function openAndActivate(itemId, shiftPressed = false) {
  EventUtils.synthesizeMouseAtCenter(
    about3Pane.threadTree.getRowAtIndex(0),
    { type: "contextmenu" },
    about3Pane
  );

  await BrowserTestUtils.waitForPopupEvent(mailContext, "shown");
  const item = mailContext.querySelector("#" + itemId);
  if (item.parentNode != mailContext) {
    item.closest("menu").openMenu(true);
    await BrowserTestUtils.waitForPopupEvent(
      item.closest("menupopup"),
      "shown"
    );
  }
  mailContext.activateItem(item, { shiftKey: shiftPressed });
  await BrowserTestUtils.waitForPopupEvent(mailContext, "hidden");
}
