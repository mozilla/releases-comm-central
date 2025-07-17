/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { be_in_folder, create_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { MockAlertsService } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MockAlertsService.sys.mjs"
);
var { MockSound } = ChromeUtils.importESModule(
  "resource://testing-common/MockSound.sys.mjs"
);
var { promise_new_window } = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var { MailConsts } = ChromeUtils.importESModule(
  "resource:///modules/MailConsts.sys.mjs"
);
var { MailNotificationManager } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationManager.sys.mjs"
);
var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { MailTelemetryForTests } = ChromeUtils.importESModule(
  "resource:///modules/MailGlue.sys.mjs"
);

// Our global folder variables...
var gFolder = null;
var gFolder2 = null;

// An object to keep track of the boolean preferences we change, so that
// we can put them back.
var gOrigBoolPrefs = {};
var gTotalOpenTime;

// Used by make_gradually_newer_sets_in_folders
var gMsgMinutes = 9000;

add_setup(async function () {
  MockAlertsService.init();
  MockSound.init();
  remember_and_set_bool_pref("mail.biff.play_sound", true);

  // Ensure we have enabled new mail notifications
  remember_and_set_bool_pref("mail.biff.show_alert", true);

  // Ensure that system notifications are used (relevant for Linux only)
  if (
    Services.appinfo.OS == "Linux" ||
    "@mozilla.org/gio-service;1" in Cc ||
    "@mozilla.org/gnome-gconf-service;1" in Cc
  ) {
    remember_and_set_bool_pref("mail.biff.use_system_alert", true);
  }

  MailServices.accounts.localFoldersServer.performingBiff = true;

  // Create a second identity to check cross-account
  // notifications.
  var identity2 = MailServices.accounts.createIdentity();
  identity2.email = "new-account@foo.invalid";

  var server = MailServices.accounts.createIncomingServer(
    "nobody",
    "TestLocalFolders",
    "pop3"
  );

  server.performingBiff = true;

  // Create the target folders
  gFolder = await create_folder("My Folder");
  const localRoot = server.rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  gFolder2 = localRoot.createLocalSubfolder("Another Folder");

  var account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity2);

  be_in_folder(gFolder);

  registerCleanupFunction(() => {
    // Clean up accounts and folders we created.
    const trash = gFolder.rootFolder.getFolderWithFlags(
      Ci.nsMsgFolderFlags.Trash
    );
    be_in_folder(gFolder.rootFolder);
    gFolder.deleteSelf(null);
    trash.emptyTrash(null);

    MailServices.accounts.removeAccount(account, false);

    // Reset notification manager state.
    MailNotificationManager._folderNewestNotifiedTime.clear();
    Assert.equal(
      MailNotificationManager._pendingFolders.size,
      0,
      "No pending alerts"
    );

    MockAlertsService.cleanup();
    MockSound.cleanup();
  });
});

registerCleanupFunction(function () {
  put_bool_prefs_back();
  if (Services.appinfo.OS != "Darwin") {
    Services.prefs.setIntPref("alerts.totalOpenTime", gTotalOpenTime);
  }

  // Request focus on something in the main window so the test doesn't time
  // out waiting for focus.
  document.getElementById("button-appmenu").focus();
});

function setupTest() {
  gFolder.markAllMessagesRead(null);
  MockAlertsService.reset();
  MockSound.reset();
  gFolder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  gFolder2.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;

  remember_and_set_bool_pref("mail.biff.alert.show_subject", true);
  remember_and_set_bool_pref("mail.biff.alert.show_sender", true);
  remember_and_set_bool_pref("mail.biff.alert.show_preview", true);
  if (Services.appinfo.OS != "Darwin") {
    gTotalOpenTime = Services.prefs.getIntPref("alerts.totalOpenTime");
    Services.prefs.setIntPref("alerts.totalOpenTime", 3000);
  }

  Services.fog.testResetFOG();
}

function put_bool_prefs_back() {
  for (const prefString in gOrigBoolPrefs) {
    Services.prefs.setBoolPref(prefString, gOrigBoolPrefs[prefString]);
  }
}

function remember_and_set_bool_pref(aPrefString, aBoolValue) {
  if (!gOrigBoolPrefs[aPrefString]) {
    gOrigBoolPrefs[aPrefString] = Services.prefs.getBoolPref(aPrefString);
  }

  Services.prefs.setBoolPref(aPrefString, aBoolValue);
}

/**
 * This function wraps up MessageInjection.makeNewSetsInFolders, and takes the
 * same arguments.  The point of this function is to ensure that
 * each sent message is slightly newer than the last.  In this
 * case, each new message set will be sent one minute further
 * into the future than the last message set.
 *
 * @see MessageInjection.makeNewSetsInFolders
 */
async function make_gradually_newer_sets_in_folder(aFolder, aArgs) {
  gMsgMinutes -= 1;
  if (!aArgs.age) {
    for (const arg of aArgs) {
      arg.age = { minutes: gMsgMinutes };
    }
  }
  return make_message_sets_in_folders(aFolder, aArgs);
}

/**
 * Test that receiving new mail causes a notification to appear, and doesn't
 * show newmailalert.xhtml.
 */
add_task(async function test_new_mail_received_causes_notification() {
  setupTest();

  let windowOpened = false;
  function observer(subject, topic) {
    if (topic == "domwindowopened") {
      windowOpened = true;
    }
  }
  Services.ww.registerNotification(observer);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await MockAlertsService.promiseShown();
  Assert.ok(MockAlertsService.alert, "Should have shown a notification");
  Assert.deepEqual(
    MockSound.played,
    [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
    "should have played the system sound"
  );

  Services.ww.unregisterNotification(observer);
  Assert.ok(!windowOpened, "newmailalert.xhtml should not open.");
});

/**
 * Test that we notify, showing the oldest new, unread message received
 * since the last notification.
 */
add_task(async function test_show_oldest_new_unread_since_last_notification() {
  setupTest();
  const notifyFirst = "This should notify first";
  Assert.ok(!MockAlertsService.alert, "Should not have notified yet.");
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: notifyFirst } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(notifyFirst, 1),
    "Should have notified for the first message"
  );

  await be_in_folder(gFolder);
  gFolder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  MockAlertsService.reset();

  const notifySecond = "This should notify second";
  Assert.ok(!MockAlertsService.alert, "Should not have notified yet.");
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: notifySecond } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(notifySecond, 1),
    "Should have notified for the second message"
  );
});

/**
 * Test that notifications work across different accounts.
 */
add_task(async function test_notification_works_across_accounts() {
  setupTest();
  // Cause a notification in the first folder
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert,
    "Should have shown notification in first folder"
  );

  MockAlertsService.reset();
  // We'll set the time for these messages to be slightly further
  // into the past.  That way, test_notification_independent_across_accounts
  // has an opportunity to send slightly newer messages that are older than
  // the messages sent to gFolder.
  await make_gradually_newer_sets_in_folder(
    [gFolder2],
    [{ count: 2, age: { minutes: gMsgMinutes + 20 } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert,
    "Should have shown notification in second folder"
  );
});

/* Test that notification timestamps are independent from account
 * to account.  This is for the scenario where we have two accounts, and
 * one has notified while the other is still updating.  When the second
 * account completes, if it has new mail, it should notify, even if second
 * account's newest mail is older than the first account's newest mail.
 */
add_task(async function test_notifications_independent_across_accounts() {
  setupTest();
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert,
    "Should have shown notification for first account"
  );

  MockAlertsService.reset();
  // Next, let's make some mail arrive in the second folder, but
  // let's have that mail be slightly older than the mail that
  // landed in the first folder.  We should still notify.
  await make_gradually_newer_sets_in_folder(
    [gFolder2],
    [{ count: 2, age: { minutes: gMsgMinutes + 10 } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert,
    "Should have shown notification for second account"
  );
});

/**
 * Test that we can show the message subject in the notification.
 */
add_task(async function test_show_subject() {
  setupTest();
  const subject = "This should be displayed";
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1, subject }]);
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(subject),
    "Should have displayed the subject"
  );
});

/**
 * Test that we can hide the message subject in the notification.
 */
add_task(async function test_hide_subject() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_subject", false);
  const subject = "This should not be displayed";
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1, subject }]);
  await MockAlertsService.promiseShown();
  Assert.ok(
    !MockAlertsService.alert.text.includes(subject),
    "Should not have displayed the subject"
  );
});

/**
 * Test that we can show just the message sender in the notification.
 */
add_task(async function test_show_only_subject() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_preview", false);
  Services.prefs.setBoolPref("mail.biff.alert.show_sender", false);
  Services.prefs.setBoolPref("mail.biff.alert.show_subject", true);

  const sender = ["John Cleese", "john@cleese.invalid"];
  const subject = "This should be displayed";
  const messageBody = "My message preview";

  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender, subject, body: { body: messageBody } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(subject),
    "Should have displayed the subject"
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(messageBody),
    "Should not have displayed the preview"
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(sender[0]),
    "Should not have displayed the sender"
  );
});

/**
 * Test that we can show the message sender in the notification.
 */
add_task(async function test_show_sender() {
  setupTest();
  const sender = ["John Cleese", "john@cleese.invalid"];
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(sender[0]),
    "Should have displayed the sender"
  );
});

/**
 * Test that we can hide the message sender in the notification.
 */
add_task(async function test_hide_sender() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_sender", false);
  const sender = ["John Cleese", "john@cleese.invalid"];
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    !MockAlertsService.alert.text.includes(sender[0]),
    "Should not have displayed the sender"
  );
});

/**
 * Test that we can show just the message sender in the notification.
 */
add_task(async function test_show_only_sender() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_preview", false);
  Services.prefs.setBoolPref("mail.biff.alert.show_sender", true);
  Services.prefs.setBoolPref("mail.biff.alert.show_subject", false);

  const sender = ["John Cleese", "john@cleese.invalid"];
  const subject = "This should not be displayed";
  const messageBody = "My message preview";

  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender, subject, body: { body: messageBody } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(sender[0]),
    "Should have displayed the sender"
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(messageBody),
    "Should not have displayed the preview"
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(subject),
    "Should not have displayed the subject"
  );
});

/**
 * Test that we can show the message preview in the notification.
 */
add_task(async function test_show_preview() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_preview", true);
  const messageBody = "My message preview";
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: messageBody } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(messageBody),
    "Should have displayed the preview"
  );
});

/**
 * Test that we can hide the message preview in the notification.
 */
add_task(async function test_hide_preview() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_preview", false);
  const messageBody = "My message preview";
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: messageBody } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    !MockAlertsService.alert.text.includes(messageBody),
    "Should not have displayed the preview"
  );
});

/**
 * Test that we can show justthe message preview in the notification.
 */
add_task(async function test_show_only_preview() {
  setupTest();
  Services.prefs.setBoolPref("mail.biff.alert.show_preview", true);
  Services.prefs.setBoolPref("mail.biff.alert.show_sender", false);
  Services.prefs.setBoolPref("mail.biff.alert.show_subject", false);

  const sender = ["John Cleese", "john@cleese.invalid"];
  const subject = "This should not be displayed";
  const messageBody = "My message preview";
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender, subject, body: { body: messageBody } }]
  );
  await MockAlertsService.promiseShown();
  Assert.ok(
    MockAlertsService.alert.text.includes(messageBody),
    "Should have displayed the preview: " + MockAlertsService.alert.text
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(sender[0]),
    "Should not have displayed the sender"
  );
  Assert.ok(
    !MockAlertsService.alert.text.includes(subject),
    "Should not have displayed the subject"
  );
});

/**
 * Test that we can receive notifications even when the biff state of
 * the folder has not been changed.
 */
add_task(async function test_still_notify_with_unchanged_biff() {
  setupTest();
  // For now, we'll make sure that if we receive 10 pieces
  // of email, one after the other, we'll be notified for all
  // (assuming of course that the notifications have a chance
  // to close in between arrivals - we don't want a queue of
  // notifications to go through).
  const HOW_MUCH_MAIL = 10;

  Assert.ok(!MockAlertsService.alert, "Should have notified.");

  for (let i = 0; i < HOW_MUCH_MAIL; i++) {
    await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
    await MockAlertsService.promiseShown();
    MockAlertsService.reset();
  }
});

/**
 * Test that we don't receive notifications for Draft, Queue, SentMail,
 * Templates or Junk folders.
 */
add_task(async function test_no_notification_for_uninteresting_folders() {
  setupTest();
  var someFolder = await create_folder("Uninteresting Folder");
  var uninterestingFlags = [
    Ci.nsMsgFolderFlags.Drafts,
    Ci.nsMsgFolderFlags.Queue,
    Ci.nsMsgFolderFlags.SentMail,
    Ci.nsMsgFolderFlags.Templates,
    Ci.nsMsgFolderFlags.Junk,
    Ci.nsMsgFolderFlags.Archive,
  ];

  for (let i = 0; i < uninterestingFlags.length; i++) {
    someFolder.flags = uninterestingFlags[i];
    await make_gradually_newer_sets_in_folder([someFolder], [{ count: 1 }]);
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 100));
    Assert.ok(!MockAlertsService.alert, "Should not show alert notification.");
  }

  // However, we want to ensure that Inboxes *always* notify, even
  // if they possess the flags we consider uninteresting.
  someFolder.flags = Ci.nsMsgFolderFlags.Inbox;

  for (let i = 0; i < uninterestingFlags.length; i++) {
    someFolder.flags |= uninterestingFlags[i];
    await make_gradually_newer_sets_in_folder([someFolder], [{ count: 1 }]);
    await MockAlertsService.promiseShown();
    someFolder.flags = someFolder.flags & ~uninterestingFlags[i];
    MockAlertsService.reset();
  }

  await TestUtils.waitForTick();

  be_in_folder(gFolder);
  someFolder.deleteSelf(null);
});

/**
 * Test what happens when clicking on a notification. This depends on whether
 * the message pane is open, and the value of mail.openMessageBehavior.
 */
add_task(async function test_click_on_notification() {
  setupTest();

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.paneLayout.messagePaneVisible = true;
  const about3PaneAboutMessage = about3Pane.messageBrowser.contentWindow;

  let lastMessage;
  async function ensureMessageLoaded(aboutMessage) {
    const messagePaneBrowser = aboutMessage.getMessagePaneBrowser();
    if (
      !messagePaneBrowser.webProgess ||
      messagePaneBrowser.webProgess.isLoadingDocument ||
      messagePaneBrowser.currentURI.spec == "about:blank" ||
      aboutMessage.gMessage != lastMessage
    ) {
      await BrowserTestUtils.browserLoaded(
        messagePaneBrowser,
        undefined,
        url => url != "about:blank"
      );
      await new Promise(resolve => setTimeout(resolve));
    }
  }

  // Create a message and click on the notification. This should open the
  // message in the first tab.

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await MockAlertsService.promiseShown();
  await MockAlertsService.clickAlert();
  await ensureMessageLoaded(about3PaneAboutMessage);

  Assert.equal(tabmail.tabInfo.length, 1, "the existing tab should be used");
  Assert.equal(about3Pane.gFolder, gFolder, "Should be in the local folder");
  Assert.equal(
    about3PaneAboutMessage.gMessage,
    lastMessage,
    "Last message should be selected"
  );

  MockAlertsService.reset();

  // Open a second message. This should also open in the first tab.

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await MockAlertsService.promiseShown();
  await MockAlertsService.clickAlert();
  await ensureMessageLoaded(about3PaneAboutMessage);

  Assert.equal(tabmail.tabInfo.length, 1, "the existing tab should be used");
  Assert.equal(about3Pane.gFolder, gFolder);
  Assert.equal(about3PaneAboutMessage.gMessage, lastMessage);

  MockAlertsService.reset();

  // Close the message pane. Clicking on the notification should now open the
  // message in a new tab.

  about3Pane.paneLayout.messagePaneVisible = false;
  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_TAB
  );

  const tabPromise = BrowserTestUtils.waitForEvent(
    tabmail,
    "aboutMessageLoaded"
  );

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await MockAlertsService.promiseShown();
  await MockAlertsService.clickAlert();
  const { target: tabAboutMessage } = await tabPromise;
  await ensureMessageLoaded(tabAboutMessage);

  Assert.equal(tabmail.tabInfo.length, 2, "a new tab should be used");
  Assert.equal(
    tabmail.currentTabInfo,
    tabmail.tabInfo[1],
    "the new tab should be in the foreground"
  );
  Assert.equal(
    tabmail.currentTabInfo.mode.name,
    "mailMessageTab",
    "the new tab should be a message tab"
  );
  Assert.equal(tabAboutMessage.gMessage, lastMessage);

  tabmail.closeOtherTabs(0);
  MockAlertsService.reset();

  // Change the preference to open a new window instead of a new tab.

  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.location.href == "chrome://messenger/content/messageWindow.xhtml"
  );

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await MockAlertsService.promiseShown();
  await MockAlertsService.clickAlert();
  const win = await winPromise;
  const winAboutMessage = win.messageBrowser.contentWindow;
  await ensureMessageLoaded(winAboutMessage);

  Assert.equal(winAboutMessage.gMessage, lastMessage);
  await BrowserTestUtils.closeWindow(win);

  // Clean up.

  Services.prefs.clearUserPref("mail.openMessageBehavior");
  about3Pane.paneLayout.messagePaneVisible = true;
});

/**
 * Test that setting no enabled actions means no actions are shown.
 */
add_task(async function test_no_actions() {
  setupTest();
  Services.prefs.setStringPref("mail.biff.alert.enabled_actions", "");
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), []);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await MockAlertsService.promiseShown();
  Assert.deepEqual(MockAlertsService.alert.actions, []);
});

/**
 * Test the Mark as Read action.
 */
add_task(async function test_mark_as_read_action() {
  setupTest();
  Services.prefs.setStringPref(
    "mail.biff.alert.enabled_actions",
    "mark-as-read"
  );
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), [
    "mark-as-read",
  ]);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  const newMessage = [...gFolder.messages].at(-1);
  Assert.ok(!newMessage.isRead, "message should not be marked as read");

  await MockAlertsService.promiseShown();
  Assert.deepEqual(
    MockAlertsService.alert.actions.map(a => a.action),
    ["mark-as-read"]
  );

  await MockAlertsService.clickAlert("mark-as-read");
  await TestUtils.waitForCondition(
    () => newMessage.isRead,
    "waiting for message to be marked as read"
  );
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-read"].testGetValue(),
    1
  );
  Assert.equal(Glean.mail.notificationUsedActions.delete.testGetValue(), null);
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-starred"].testGetValue(),
    null
  );
});

/**
 * Test the Delete action.
 */
add_task(async function test_delete_action() {
  setupTest();
  Services.prefs.setStringPref(
    "mail.biff.alert.enabled_actions",
    "delete,mark-as-read"
  );
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), [
    "delete",
    "mark-as-read",
  ]);

  const trashFolder = gFolder.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Trash
  );
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  const newMessageId = [...gFolder.messages].at(-1).messageId;
  const numMessages = gFolder.getTotalMessages(false);
  const trashMessages = trashFolder.getTotalMessages(false);

  await MockAlertsService.promiseShown();
  Assert.deepEqual(
    MockAlertsService.alert.actions.map(a => a.action),
    ["delete", "mark-as-read"]
  );

  const deletePromise = PromiseTestUtils.promiseFolderEvent(
    gFolder,
    "DeleteOrMoveMsgCompleted"
  );
  await MockAlertsService.clickAlert("delete");
  await deletePromise;
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-read"].testGetValue(),
    null
  );
  Assert.equal(Glean.mail.notificationUsedActions.delete.testGetValue(), 1);
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-starred"].testGetValue(),
    null
  );

  Assert.equal(gFolder.getTotalMessages(false), numMessages - 1);
  Assert.equal(trashFolder.getTotalMessages(false), trashMessages + 1);
  const deletedMessage = [...trashFolder.messages].at(-1);
  Assert.equal(deletedMessage.messageId, newMessageId);
  Assert.ok(deletedMessage.isRead);
});

/**
 * Test the Star action.
 */
add_task(async function test_star_action() {
  setupTest();
  Services.prefs.setStringPref(
    "mail.biff.alert.enabled_actions",
    "delete,mark-as-starred"
  );
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), [
    "delete",
    "mark-as-starred",
  ]);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  const newMessage = [...gFolder.messages].at(-1);
  Assert.ok(!newMessage.isFlagged, "message should not be starred");

  await MockAlertsService.promiseShown();
  Assert.deepEqual(
    MockAlertsService.alert.actions.map(a => a.action),
    ["delete", "mark-as-starred"]
  );

  await MockAlertsService.clickAlert("mark-as-starred");
  await TestUtils.waitForCondition(
    () => newMessage.isFlagged,
    "waiting for message to be starred"
  );
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-read"].testGetValue(),
    null
  );
  Assert.equal(Glean.mail.notificationUsedActions.delete.testGetValue(), null);
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-starred"].testGetValue(),
    1
  );
});

/**
 * Test the Mark as Spam action.
 */
add_task(async function test_mark_as_spam_action() {
  setupTest();
  Services.prefs.setStringPref(
    "mail.biff.alert.enabled_actions",
    "mark-as-spam"
  );
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), [
    "mark-as-spam",
  ]);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  const newMessage = [...gFolder.messages].at(-1);
  Assert.equal(
    newMessage.getStringProperty("junkscore"),
    0,
    "message should not be marked as spam"
  );

  await MockAlertsService.promiseShown();
  Assert.deepEqual(
    MockAlertsService.alert.actions.map(a => a.action),
    ["mark-as-spam"]
  );

  await MockAlertsService.clickAlert("mark-as-spam");
  await TestUtils.waitForCondition(
    () => newMessage.getStringProperty("junkscore") == 100,
    "waiting for message to be starred"
  );
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-read"].testGetValue(),
    null
  );
  Assert.equal(Glean.mail.notificationUsedActions.delete.testGetValue(), null);
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-starred"].testGetValue(),
    null
  );
  Assert.equal(
    Glean.mail.notificationUsedActions["mark-as-spam"].testGetValue(),
    1
  );
});

/**
 * Test the Archive action.
 */
add_task(async function test_archive_action() {
  setupTest();
  Services.prefs.setStringPref("mail.biff.alert.enabled_actions", "archive");
  MailTelemetryForTests.reportUIConfiguration();
  Assert.deepEqual(Glean.mail.notificationEnabledActions.testGetValue(), [
    "archive",
  ]);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  const newMessageId = [...gFolder.messages].at(-1).messageId;
  const numMessages = gFolder.getTotalMessages(false);

  await MockAlertsService.promiseShown();
  Assert.deepEqual(
    MockAlertsService.alert.actions.map(a => a.action),
    ["archive"]
  );

  const archivePromise = PromiseTestUtils.promiseFolderEvent(
    gFolder,
    "DeleteOrMoveMsgCompleted"
  );
  await MockAlertsService.clickAlert("archive");
  await archivePromise;
  Assert.equal(Glean.mail.notificationUsedActions.archive.testGetValue(), 1);

  const archiveFolder = gFolder.rootFolder.getFolderWithFlags(
    Ci.nsMsgFolderFlags.Archive
  );
  Assert.equal(gFolder.getTotalMessages(false), numMessages - 1);
  Assert.equal(archiveFolder.getTotalMessages(true), 1);
  const archivedMessage = [...archiveFolder.subFolders[0].messages].at(-1);
  Assert.equal(archivedMessage.messageId, newMessageId);
});

/**
 * Test what happens when loading a message when there's a notification about
 * it. The notification should be removed.
 */
add_task(async function test_load_message_closes_notification() {
  MockAlertsService.reset();

  const shownPromise = MockAlertsService.promiseShown();
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await shownPromise;

  const closedPromise = MockAlertsService.promiseClosed();

  const tabmail = document.getElementById("tabmail");
  const about3Pane = tabmail.currentAbout3Pane;
  about3Pane.restoreState({ folderURI: gFolder.URI, messagePaneVisible: true });
  about3Pane.threadTree.selectedIndex = 0;

  await closedPromise;
});

/**
 * Test that the custom notification (newmailalert.xhtml) works if the
 * preference is set.
 */
add_task(async function test_revert_to_newmailalert() {
  setupTest();

  Services.prefs.setBoolPref("mail.biff.use_system_alert", false);

  // We expect the newmailalert.xhtml window.
  const alertPromise = promise_new_window("alert:alert");
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 2 }]);
  const win = await alertPromise;
  Assert.deepEqual(
    MockSound.played,
    [`(event)${Ci.nsISound.EVENT_NEW_MAIL_RECEIVED}`],
    "should have played the system sound"
  );

  // The alert closes itself.
  await BrowserTestUtils.domWindowClosed(win);
}).skip(AppConstants.platform == "macosx" || Services.env.get("MOZ_HEADLESS")); // newmailalert.xhtml doesn't work on macOS or headless runs.
