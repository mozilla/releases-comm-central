/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { isFirstRun } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FirstRun.sys.mjs"
);

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);
const { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
const { calendarDeactivator } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calCalendarDeactivator.sys.mjs"
);
const { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);
const { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);
const { SmartMailboxUtils } = ChromeUtils.importESModule(
  "resource:///modules/SmartMailboxUtils.sys.mjs"
);

add_setup(async () => {
  do_get_profile();
  // Make sure timezone service is initialized.
  Cc["@mozilla.org/calendar/timezone-service;1"]
    .getService(Ci.calIStartupService)
    .startup(null);
  await new Promise(resolve => cal.manager.startup({ onResult: resolve }));
  calendarDeactivator.initializeDeactivator();
});

add_task(function testFirstRunWithoutAnything() {
  Assert.ok(isFirstRun(), "Should indicate a first run");
});

add_task(function testNotFirstRunWithPref() {
  Services.prefs.setBoolPref("mail.provider.suppress_dialog_on_startup", true);

  Assert.ok(!isFirstRun(), "Should indicate not a first run with the pref set");

  Services.prefs.clearUserPref("mail.provider.suppress_dialog_on_startup");
});

add_task(function testNotFirstRunWithContact() {
  const addressbook = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");
  const contact = new AddrBookCard();
  contact.displayName = "Beltrametti";
  contact.primaryEmail = "beltrametti@blaueswunderland.invalid";
  addressbook.addCard(contact);

  Assert.ok(!isFirstRun(), "Should indicate not first run with a contact");

  addressbook.deleteCards(addressbook.childCards);
});

add_task(function testNotFirstRunWithCalendar() {
  const calendar = cal.manager.createCalendar(
    "storage",
    Services.io.newURI("moz-storage-calendar://")
  );
  calendar.name = "First Run Calendar";
  calendar.setProperty("calendar-main-default", true);
  cal.manager.registerCalendar(calendar);

  Assert.ok(
    !isFirstRun(),
    "Should indicate not first run with an enabled calendar"
  );

  CalendarTestUtils.removeCalendar(calendar);
});

add_task(function testNotFirstRunWithMailAccount() {
  const server = MailServices.accounts.createIncomingServer(
    "firstrun@foo.invalid",
    "foo.invalid",
    "imap"
  );
  server.password = "password";
  const identity = MailServices.accounts.createIdentity();
  identity.email = "firstrun@foo.invalid";
  identity.fullName = "first run test";
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;
  account.addIdentity(identity);
  const outgoing = MailServices.outgoingServer.createServer("smtp");
  outgoing.QueryInterface(Ci.nsISmtpServer);
  outgoing.username = "firstrun@foo.invalid";
  outgoing.hostname = "foo.invalid";
  identity.smtpServerKey = outgoing.key;

  Assert.ok(
    !isFirstRun(),
    "Should indicate not first run with a valid account"
  );

  MailServices.accounts.removeAccount(account, true);
  MailServices.outgoingServer.deleteServer(outgoing);
});

add_task(function testNotFirstRunWithFeedAccount() {
  const account = FeedUtils.createRssAccount("firstRun");

  Assert.ok(!isFirstRun(), "Should indicate not first run with a feed account");

  MailServices.accounts.removeAccount(account, true);
});

add_task(function testFirstRunWithOnlyHiddenAccounts() {
  SmartMailboxUtils.getSmartMailbox();

  Assert.ok(
    isFirstRun(),
    "Unified folders should not influence first run status"
  );

  // Removing the unified folder server on a debug build makes it crash. Since
  // this test asserts that unified folders don't influence the result, we know
  // that not removing them doesn't affect tasks that follow, it's just not
  // great test isolation.
  if (!AppConstants.DEBUG) {
    SmartMailboxUtils.removeAll(false);
  }
});

add_task(function testNotFirstRunWithLocalFolders() {
  const account = MailServices.accounts.createLocalMailAccount();

  Assert.ok(!isFirstRun(), "Should not indicate first run with a local folder");

  MailServices.accounts.removeAccount(account, true);
});

add_task(function testFirstRunWithInvalidMailAccount() {
  const server = MailServices.accounts.createIncomingServer(
    "firstrun@foo.invalid",
    "foo.invalid",
    "imap"
  );
  server.valid = false;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = server;

  Assert.ok(
    isFirstRun(),
    "Should indicate a first run with an invalid account"
  );

  MailServices.accounts.removeAccount(account, true);
});

add_task(
  { skip_if: () => AppConstants.platform != "macos" },
  function testFirstRunIgnoresMacOSAddressBook() {
    let hadAddressBook = false;
    try {
      MailServices.ab.newAddressBook(
        "test",
        "moz-abosxdirectory:///",
        Ci.nsIAbManager.MAPI_DIRECTORY_TYPE
      );
    } catch {
      hadAddressBook = true;
    }

    Assert.ok(
      isFirstRun(),
      "Should indicate first run even with native address book"
    );

    if (!hadAddressBook) {
      MailServices.ab.deleteAddressBook("moz-abosxdirectory:///");
    }
  }
);
