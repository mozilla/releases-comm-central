/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test menu items for marking messages as read or flagged.
 */

const { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
const { IMAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/IMAPServer.sys.mjs"
);

const { getState, storeState } = ChromeUtils.importESModule(
  "resource:///modules/CustomizationState.mjs"
);

let about3Pane, imapServer, imapIncomingServer, inbox, messages;

add_setup(async function () {
  const toolbarState = getState();
  storeState({ mail: ["mark-as"] });
  document.getElementById("toolbar-menubar").removeAttribute("autohide");

  const generator = new MessageGenerator();

  const msgDefs = [
    generator.makeMessage({ date: new Date(2026, 0, 1) }),
    generator.makeMessage({ date: new Date(2026, 0, 8) }),
    generator.makeMessage({ date: new Date(2026, 0, 15) }),
    generator.makeMessage({ date: new Date(2026, 0, 22) }),
    generator.makeMessage({ date: new Date(2026, 0, 29) }),
  ];
  generator._clock = new Date(2026, 3, 1);
  msgDefs.push(
    ...generator.makeMessages({
      count: 6,
      msgsPerThread: 3,
      date: new Date(2026, 9, 21),
    })
  );

  const account = MailServices.accounts.createLocalMailAccount();

  // We'll do this with an IMAP server so that we can check the server is
  // actually informed of changes.

  imapServer = new IMAPServer();
  const imapAccount = MailServices.accounts.createAccount();
  imapAccount.addIdentity(MailServices.accounts.createIdentity());
  imapIncomingServer = imapAccount.incomingServer =
    MailServices.accounts.createIncomingServer(
      `${imapAccount.key}user`,
      "localhost",
      "imap"
    );
  imapIncomingServer.port = imapServer.port;
  imapIncomingServer.username = "user";
  imapIncomingServer.password = "password";
  imapIncomingServer.QueryInterface(Ci.nsIImapIncomingServer);
  inbox = imapIncomingServer.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Inbox
  );
  await imapServer.addMessages(inbox, msgDefs);
  messages = [...inbox.messages];

  about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.restoreState({
    messagePaneVisible: false,
    folderURI: inbox,
  });

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, false);
    await TestUtils.waitForCondition(
      () => imapIncomingServer.allConnectionsIdle
    );
    MailServices.accounts.removeAccount(imapAccount, false);
    storeState(toolbarState);
  });
});

/**
 * Test the Mark button on the toolbar.
 */
add_task(async function testToolbarMarkPopup() {
  const helper = new ContextMenuTestHelper("toolbarMarkPopup", {
    markReadToolbarItem: {},
    markUnreadToolbarItem: { disabled: true },
    "button-markThreadAsRead": {},
    "button-markReadByDate": {},
    "button-markAllRead": {},
    markFlaggedToolbarItem: {},
  });

  const button = await TestUtils.waitForCondition(
    () =>
      document.querySelector(
        `#unifiedToolbarContent li[item-id="mark-as"] button`
      ),
    "waiting for the Mark button to be added to the toolbar"
  );
  const popup = document.getElementById("toolbarMarkPopup");

  await subtest(
    () => EventUtils.synthesizeMouseAtCenter(button, {}, window),
    popup,
    helper
  );
});

/**
 * Test the Message menu.
 */
add_task(async function testMessageMenu() {
  const helper = new ContextMenuTestHelper("menu_MarkPopup", {
    markReadMenuItem: {},
    markUnreadMenuItem: { disabled: true },
    menu_markThreadAsRead: {},
    menu_markReadByDate: {},
    menu_markAllRead: {},
    markFlaggedMenuItem: {},
    menu_markAsJunk: {},
    menu_markAsNotJunk: {},
    menu_recalculateJunkScore: {},
  });

  const mainMenu = document.getElementById("messageMenu");
  const subMenu = document.getElementById("markMenu");
  await subtest(
    async () => {
      EventUtils.synthesizeMouseAtCenter(mainMenu, {}, window);
      await BrowserTestUtils.waitForPopupEvent(mainMenu.menupopup, "shown");
      subMenu.openMenu(true);
    },
    subMenu.menupopup,
    helper
  );
}).skip(AppConstants.platform == "macosx");

/**
 * Test the mail context menu.
 */
add_task(async function testMailContext() {
  const helper = new ContextMenuTestHelper(
    "mailContext-markPopup",
    {
      "mailContext-markRead": {},
      "mailContext-markUnread": { disabled: true },
      "mailContext-markThreadAsRead": {},
      "mailContext-markReadByDate": {},
      "mailContext-markAllRead": {},
      "mailContext-markFlagged": {},
      "mailContext-markAsJunk": {},
      "mailContext-markAsNotJunk": {},
      "mailContext-recalculateJunkScore": {},
    },
    about3Pane.document
  );

  const contextMenu = about3Pane.document.getElementById("mailContext");
  const subMenu = about3Pane.document.getElementById("mailContext-mark");
  await subtest(
    async index => {
      EventUtils.synthesizeMouseAtCenter(
        about3Pane.threadTree.getRowAtIndex(index),
        { type: "contextmenu" },
        about3Pane
      );
      await BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");
      subMenu.openMenu(true);
    },
    subMenu.menupopup,
    helper
  );
});

async function subtest(openMenuCallback, popup, helper) {
  const [
    readItem,
    unreadItem,
    threadReadItem,
    readByDateItem,
    allReadItem,
    flagItem,
  ] = Object.keys(helper.baseData);
  const containingPopup = helper.menu.parentNode.closest("menupopup");

  async function checkMenuitems(index, overrides) {
    await openMenuCallback(index);
    await BrowserTestUtils.waitForPopupEvent(popup, "shown");
    await helper.checkMenuitems("default", overrides);

    if (containingPopup) {
      containingPopup.hidePopup();
      await BrowserTestUtils.waitForPopupEvent(containingPopup, "hidden");
    }
  }

  async function activateItem(index, itemId) {
    about3Pane.threadTree.selectedIndex = index;
    await openMenuCallback(index);
    await BrowserTestUtils.waitForPopupEvent(popup, "shown");
    popup.activateItem(popup.ownerDocument.getElementById(itemId));
    await BrowserTestUtils.waitForPopupEvent(popup, "hidden");

    if (containingPopup) {
      await BrowserTestUtils.waitForPopupEvent(containingPopup, "hidden");
    }

    await TestUtils.waitForCondition(
      () => imapIncomingServer.allConnectionsIdle
    );
  }

  function assertRead(indices, shouldBeRead) {
    const verb = shouldBeRead ? "should" : "should not";
    for (const index of indices) {
      const message = messages[index];
      Assert.equal(
        message.isRead,
        shouldBeRead,
        `message ${index} ${verb} be marked as read in the database`
      );

      const serverMessage = imapServer.daemon
        .getMailbox("INBOX")
        ._messages.find(m => m.uid == message.messageKey);
      Assert.equal(
        serverMessage.flags.includes("\\Seen"),
        shouldBeRead,
        `message ${index} ${verb} be marked as read on the server`
      );
    }
  }

  function assertFlagged(indices, shouldBeFlagged) {
    const verb = shouldBeFlagged ? "should" : "should not";
    for (const index of indices) {
      const message = messages[index];
      Assert.equal(
        message.isFlagged,
        shouldBeFlagged,
        `message ${index} ${verb} be flagged in the database`
      );

      const serverMessage = imapServer.daemon
        .getMailbox("INBOX")
        ._messages.find(m => m.uid == message.messageKey);
      Assert.equal(
        serverMessage.flags.includes("\\Flagged"),
        shouldBeFlagged,
        `message ${index} ${verb} be flagged on the server`
      );
    }
  }

  about3Pane.threadTree.selectedIndex = 1;
  await checkMenuitems(1);

  // Test the As Read item and the As Unread item, on a single message.

  await activateItem(1, readItem);
  assertRead([1], true);
  await checkMenuitems(1, {
    [readItem]: { disabled: true },
    [unreadItem]: {},
    [threadReadItem]: { disabled: true },
  });

  await activateItem(1, unreadItem);
  assertRead([1], false);
  await checkMenuitems(1);

  // Test the Add Star item, on a single message.

  await activateItem(1, flagItem);
  assertFlagged([1], true);
  await checkMenuitems(1, { [flagItem]: { checked: true } });

  await activateItem(1, flagItem);
  assertFlagged([1], false);
  await checkMenuitems(1);

  // Test the items on a collapsed thread.

  if (about3Pane.gDBView.isContainerOpen(5)) {
    about3Pane.gDBView.toggleOpenState(5);
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
  }
  await activateItem(5, readItem);
  assertRead([5, 6, 7], true);

  await activateItem(5, unreadItem);
  assertRead([5, 6, 7], false);

  await activateItem(5, threadReadItem);
  assertRead([5, 6, 7], true);

  await activateItem(5, flagItem);
  assertFlagged([5, 6, 7], true);

  await activateItem(5, flagItem);
  assertFlagged([5, 6, 7], false);

  // Test the items on the root of an expanded thread, and a message inside an
  // expanded thread.

  if (!about3Pane.gDBView.isContainerOpen(6)) {
    about3Pane.gDBView.toggleOpenState(6);
    await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
  }

  // The indices don't match the message indicies because of the collapsed
  // thread above them. This is an attempt to make that less confusing.
  const indexOffset = 2;

  await activateItem(8 - indexOffset, readItem);
  assertRead([8], true);
  assertRead([9, 10], false);

  await activateItem(10 - indexOffset, readItem);
  assertRead([8, 10], true);
  assertRead([9], false);

  await activateItem(8 - indexOffset, threadReadItem);
  assertRead([8, 9, 10], true);

  await activateItem(8 - indexOffset, unreadItem);
  assertRead([8], false);
  assertRead([9, 10], true);

  await activateItem(10 - indexOffset, unreadItem);
  assertRead([8, 10], false);
  assertRead([9], true);

  await activateItem(8 - indexOffset, flagItem);
  assertFlagged([8], true);
  assertFlagged([9, 10], false);

  await activateItem(10 - indexOffset, flagItem);
  assertFlagged([8, 10], true);
  assertFlagged([9], false);

  await activateItem(8 - indexOffset, flagItem);
  assertFlagged([8, 9], false);
  assertFlagged([10], true);

  await activateItem(10 - indexOffset, flagItem);
  assertFlagged([8, 9, 10], false);

  // Test the As Read By Date item.

  const dialogPromise = BrowserTestUtils.promiseAlertDialogOpen(
    undefined,
    "chrome://messenger/content/markByDate.xhtml",
    {
      async callback(win) {
        win.document.getElementById("lowerDate").value = "2026-01-12";
        win.document.getElementById("upperDate").value = "2026-01-25";

        const markInDatabase = win.markInDatabase;
        win.markInDatabase = function (lower, upper) {
          Assert.equal(
            lower,
            new Date(2026, 0, 12).valueOf() * 1000,
            "start of date range should be exactly 2026-01-12T00:00:00 local time"
          );
          // Date range is inclusive, so this is midnight of the next day.
          Assert.equal(
            upper,
            new Date(2026, 0, 26).valueOf() * 1000,
            "end of date range should be exactly 2026-01-26T00:00:00 local time"
          );
          markInDatabase(lower, upper);
        };

        win.document.querySelector("dialog").getButton("accept").click();
        await BrowserTestUtils.domWindowClosed(win);
      },
    }
  );
  await activateItem(5, readByDateItem);
  await dialogPromise;
  await SimpleTest.promiseFocus();
  assertRead([2, 3], true);
  assertRead([0, 1, 4], false);

  // Test All Read item.

  await activateItem(0, allReadItem);
  assertRead([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], true);

  inbox.markMessagesRead(messages, false);
  inbox.markMessagesFlagged(messages, false);
}
