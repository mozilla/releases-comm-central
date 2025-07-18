/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* Tests for platform-independent code to count new and unread messages and pass the
 * information to platform-specific notification modules */

var { MailNotificationService } = ChromeUtils.importESModule(
  "resource:///modules/MailNotificationService.sys.mjs"
);

/**
 * Register listener for a particular event, make sure it shows up in the right lists
 * of listeners (and not the wrong ones) and doesn't show up after being removed
 */
add_test(function testListeners() {
  const listener = { onCountChanged: () => {} };

  MailNotificationService.addListener(listener);
  Assert.deepEqual(MailNotificationService.listeners, [listener]);

  MailNotificationService.removeListener(listener);
  Assert.equal(MailNotificationService.listeners.length, 0);

  run_next_test();
});

/*
 * Register a listener for two types and another for one type, make sure they show up,
 * remove one and make sure the other stays put
 */
add_test(function testMultiListeners() {
  const l1 = { onCountChanged: () => {} };
  const l2 = { onCountChanged: () => {}, b: 2 };

  MailNotificationService.addListener(l1);
  MailNotificationService.addListener(l2);
  Assert.deepEqual(MailNotificationService.listeners, [l1, l2]);

  MailNotificationService.removeListener(l1);
  Assert.deepEqual(MailNotificationService.listeners, [l2]);
  MailNotificationService.removeListener(l2);

  run_next_test();
});

/* Make sure we get a notification call when the unread count changes on an Inbox */
add_test(function testNotifyInbox() {
  let notified = false;
  let count = 0;
  const mockListener = {
    onCountChanged: function TNU_onCountChanged(updatedCount) {
      notified = true;
      count = updatedCount;
    },
  };
  const folder = {
    URI: "Test Inbox",
    flags: Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Inbox,
  };

  // Set up the notification service to start with a non-zero unread count to
  // verify this value is correctly passed to new listeners. Do this before any
  // listeners are added.
  const startCount = 3;
  MailNotificationService.unreadCount = startCount;

  // Add a listener for count updates.
  MailNotificationService.addListener(mockListener);

  // Verify that a new listener is notified of the current count.
  Assert.ok(notified, "New listeners should be notified of count when added.");
  Assert.equal(
    count,
    startCount,
    "New listener notification should contain the current unread count."
  );

  // Verify that listeners are notified of subsequent changes.
  notified = false;
  const updatedInboxCount = 5;
  MailNotificationService.onFolderIntPropertyChanged(
    folder,
    "TotalUnreadMessages",
    startCount,
    updatedInboxCount
  );
  Assert.ok(
    notified,
    "Listeners should be notified of changes in inbox unread count."
  );
  Assert.equal(
    count,
    updatedInboxCount,
    "Notification should contain updated inbox unread count."
  );

  // Sanity check.
  Assert.ok(
    Services.prefs.getBoolPref("mail.notification.count.inbox_only", false),
    "`inbox_only` pref should be true for test."
  );

  // Verify that listeners are not notified of changes outside of the inbox.
  const nonInbox = {
    URI: "Test Non-Inbox",
    flags: Ci.nsMsgFolderFlags.Mail,
  };
  notified = false;
  MailNotificationService.onFolderIntPropertyChanged(
    nonInbox,
    "TotalUnreadMessages",
    0,
    2
  );
  Assert.ok(
    !notified,
    "Listeners should not be notified of changes in unread count outside of inbox by default."
  );
  Assert.equal(
    count,
    updatedInboxCount,
    "Total unread message count should not have changed."
  );

  // Verify that, when `inbox_only` is false, unread messages outside of the
  // inbox are counted.
  Services.prefs.setBoolPref("mail.notification.count.inbox_only", false);
  notified = false;
  const updatedNonInboxCount = 2;
  const updatedTotalCount = updatedInboxCount + updatedNonInboxCount;
  MailNotificationService.onFolderIntPropertyChanged(
    nonInbox,
    "TotalUnreadMessages",
    0,
    updatedNonInboxCount
  );
  Assert.ok(
    notified,
    "Listeners should be notified of changes in unread count outside of inbox when pref is set."
  );
  Assert.equal(
    count,
    updatedTotalCount,
    "Notification should contain total unread count for all counted folders."
  );

  // Verify that listeners are never informed of updates in special folders.
  const special = {
    URI: "Test Special",
    flags: Ci.nsMsgFolderFlags.Mail | Ci.nsMsgFolderFlags.Junk,
  };
  notified = false;
  MailNotificationService.onFolderIntPropertyChanged(
    special,
    "TotalUnreadMessages",
    0,
    2
  );
  Assert.ok(
    !notified,
    "Listeners should not be notified of changes in special folder unread count."
  );
  Assert.equal(
    count,
    updatedTotalCount,
    "Total unread message count should not have changed."
  );

  run_next_test();
});
