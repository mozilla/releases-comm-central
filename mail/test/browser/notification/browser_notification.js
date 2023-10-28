/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { be_in_folder, create_folder, make_message_sets_in_folders } =
  ChromeUtils.import(
    "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
  );
var { promise_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

var { MailConsts } = ChromeUtils.import("resource:///modules/MailConsts.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
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

// We'll use this mock alerts service to capture notification events
var gMockAlertsService = {
  _doFail: false,
  _doClick: false,

  QueryInterface: ChromeUtils.generateQI(["nsIAlertsService"]),

  showAlert(alertInfo, alertListener) {
    const { imageURL, title, text, textClickable, cookie, name } = alertInfo;
    // Setting the _doFail flag allows us to revert to the newmailalert.xhtml
    // notification
    if (this._doFail) {
      SimpleTest.expectUncaughtException(true);
      throw Components.Exception("", Cr.NS_ERROR_FAILURE);
    }
    this._didNotify = true;
    this._imageUrl = imageURL;
    this._title = title;
    this._text = text;
    this._textClickable = textClickable;
    this._cookie = cookie;
    this._alertListener = alertListener;
    this._name = name;

    if (this._doClick) {
      // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
      setTimeout(
        () =>
          this._alertListener.observe(null, "alertclickcallback", this._cookie),
        100
      );
    } else {
      this._alertListener.observe(null, "alertfinished", this._cookie);
    }
  },

  _didNotify: false,
  _imageUrl: null,
  _title: null,
  _text: null,
  _textClickable: null,
  _cookie: null,
  _alertListener: null,
  _name: null,

  _reset() {
    // Tell any listeners that we're through
    if (this._alertListener) {
      this._alertListener.observe(null, "alertfinished", this._cookie);
    }

    this._doFail = false;
    this._doClick = false;
    this._didNotify = false;
    this._imageUrl = null;
    this._title = null;
    this._text = null;
    this._textClickable = null;
    this._cookie = null;
    this._alertListener = null;
    this._name = null;
  },
};

add_setup(async function () {
  // Register the mock alerts service
  gMockAlertsService._classID = MockRegistrar.register(
    "@mozilla.org/system-alerts-service;1",
    gMockAlertsService
  );

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
    "Test Local Folders",
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
});

registerCleanupFunction(function () {
  put_bool_prefs_back();
  if (Services.appinfo.OS != "Darwin") {
    Services.prefs.setIntPref("alerts.totalOpenTime", gTotalOpenTime);
  }

  // Request focus on something in the main window so the test doesn't time
  // out waiting for focus.
  document.getElementById("button-appmenu").focus();

  MockRegistrar.unregister(gMockAlertsService._classID);
});

function setupTest(test) {
  gFolder.markAllMessagesRead(null);
  gMockAlertsService._reset();
  gMockAlertsService._doFail = false;
  gFolder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  gFolder2.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;

  remember_and_set_bool_pref("mail.biff.alert.show_subject", true);
  remember_and_set_bool_pref("mail.biff.alert.show_sender", true);
  remember_and_set_bool_pref("mail.biff.alert.show_preview", true);
  if (Services.appinfo.OS != "Darwin") {
    gTotalOpenTime = Services.prefs.getIntPref("alerts.totalOpenTime");
    Services.prefs.setIntPref("alerts.totalOpenTime", 3000);
  }
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
 * Test that receiving new mail causes a notification to appear
 */
add_task(async function test_new_mail_received_causes_notification() {
  setupTest();
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
});

/**
 * Test that if notification shows, we don't show newmailalert.xhtml
 */
add_task(async function test_dont_show_newmailalert() {
  setupTest();

  let windowOpened = false;
  function observer(subject, topic, data) {
    if (topic == "domwindowopened") {
      windowOpened = true;
    }
  }
  Services.ww.registerNotification(observer);

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
  await new Promise(resolve => setTimeout(resolve, 2000));

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
  Assert.ok(!gMockAlertsService._didNotify, "Should not have notified yet.");
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: notifyFirst } }]
  );
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(notifyFirst, 1),
    "Should have notified for the first message"
  );

  await be_in_folder(gFolder);
  gFolder.biffState = Ci.nsIMsgFolder.nsMsgBiffState_NoMail;
  gMockAlertsService._reset();

  const notifySecond = "This should notify second";
  Assert.ok(!gMockAlertsService._didNotify, "Should not have notified yet.");
  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, body: { body: notifySecond } }]
  );
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(notifySecond, 1),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);

  gMockAlertsService._reset();
  // We'll set the time for these messages to be slightly further
  // into the past.  That way, test_notification_independent_across_accounts
  // has an opportunity to send slightly newer messages that are older than
  // the messages sent to gFolder.
  await make_gradually_newer_sets_in_folder(
    [gFolder2],
    [{ count: 2, age: { minutes: gMsgMinutes + 20 } }]
  );
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);

  gMockAlertsService._reset();
  // Next, let's make some mail arrive in the second folder, but
  // let's have that mail be slightly older than the mail that
  // landed in the first folder.  We should still notify.
  await make_gradually_newer_sets_in_folder(
    [gFolder2],
    [{ count: 2, age: { minutes: gMsgMinutes + 10 } }]
  );
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
});

/**
 * Test that we can show the message subject in the notification.
 */
add_task(async function test_show_subject() {
  setupTest();
  const subject = "This should be displayed";
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1, subject }]);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(subject),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    !gMockAlertsService._text.includes(subject),
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
  const subject = "This should not be displayed";
  const messageBody = "My message preview";

  await make_gradually_newer_sets_in_folder(
    [gFolder],
    [{ count: 1, from: sender, subject, body: { body: messageBody } }]
  );
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(subject),
    "Should have displayed the subject"
  );
  Assert.ok(
    !gMockAlertsService._text.includes(messageBody),
    "Should not have displayed the preview"
  );
  Assert.ok(
    !gMockAlertsService._text.includes(sender[0]),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(sender[0]),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    !gMockAlertsService._text.includes(sender[0]),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(sender[0]),
    "Should have displayed the sender"
  );
  Assert.ok(
    !gMockAlertsService._text.includes(messageBody),
    "Should not have displayed the preview"
  );
  Assert.ok(
    !gMockAlertsService._text.includes(subject),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(messageBody),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    !gMockAlertsService._text.includes(messageBody),
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
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  Assert.ok(
    gMockAlertsService._text.includes(messageBody),
    "Should have displayed the preview: " + gMockAlertsService._text
  );
  Assert.ok(
    !gMockAlertsService._text.includes(sender[0]),
    "Should not have displayed the sender"
  );
  Assert.ok(
    !gMockAlertsService._text.includes(subject),
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

  Assert.ok(!gMockAlertsService._didNotify, "Should have notified.");

  for (let i = 0; i < HOW_MUCH_MAIL; i++) {
    await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
    await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
    gMockAlertsService._reset();
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
    Assert.ok(!gMockAlertsService._didNotify, "Showed alert notification.");
  }

  // However, we want to ensure that Inboxes *always* notify, even
  // if they possess the flags we consider uninteresting.
  someFolder.flags = Ci.nsMsgFolderFlags.Inbox;

  for (let i = 0; i < uninterestingFlags.length; i++) {
    someFolder.flags |= uninterestingFlags[i];
    await make_gradually_newer_sets_in_folder([someFolder], [{ count: 1 }]);
    await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
    someFolder.flags = someFolder.flags & ~uninterestingFlags[i];
  }
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
      messagePaneBrowser.webProgess?.isLoadingDocument ||
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

  gMockAlertsService._doClick = true;

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  await ensureMessageLoaded(about3PaneAboutMessage);

  Assert.equal(tabmail.tabInfo.length, 1, "the existing tab should be used");
  Assert.equal(about3Pane.gFolder, gFolder);
  Assert.equal(about3PaneAboutMessage.gMessage, lastMessage);

  gMockAlertsService._reset();

  // Open a second message. This should also open in the first tab.

  gMockAlertsService._doClick = true;

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
  await ensureMessageLoaded(about3PaneAboutMessage);

  Assert.equal(tabmail.tabInfo.length, 1, "the existing tab should be used");
  Assert.equal(about3Pane.gFolder, gFolder);
  Assert.equal(about3PaneAboutMessage.gMessage, lastMessage);

  gMockAlertsService._reset();

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
  gMockAlertsService._doClick = true;

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
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
  gMockAlertsService._reset();

  // Change the preference to open a new window instead of a new tab.

  Services.prefs.setIntPref(
    "mail.openMessageBehavior",
    MailConsts.OpenMessageBehavior.NEW_WINDOW
  );

  const winPromise = BrowserTestUtils.domWindowOpenedAndLoaded(
    undefined,
    win => win.location.href == "chrome://messenger/content/messageWindow.xhtml"
  );
  gMockAlertsService._doClick = true;

  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 1 }]);
  lastMessage = [...gFolder.messages].at(-1);
  await TestUtils.waitForCondition(() => gMockAlertsService._didNotify);
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
 * Test that we revert to newmailalert.xhtml if there is no system notification
 * service present.
 *
 * NOTE: this test should go last because if
 * nsIAlertsService.showAlertNotification failed for once, we always fallback to
 * newmailalert.xhtml afterwards.
 */
add_task(async function test_revert_to_newmailalert() {
  setupTest();
  // Set up the gMockAlertsService so that it fails
  // to send a notification.
  gMockAlertsService._doFail = true;

  if (AppConstants.platform == "macosx") {
    // newmailalert.xhtml doesn't work on macOS.
    return;
  }

  // We expect the newmailalert.xhtml window...
  const alertPromise = promise_new_window("alert:alert");
  await make_gradually_newer_sets_in_folder([gFolder], [{ count: 2 }]);
  const win = await alertPromise;
  // The alert closes itself.
  await BrowserTestUtils.domWindowClosed(win);
});
