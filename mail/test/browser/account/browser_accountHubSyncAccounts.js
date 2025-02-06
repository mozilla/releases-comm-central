/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

let emailUser;
const PREF_NAME = "mailnews.auto_config_url";
const PREF_VALUE = Services.prefs.getCharPref(PREF_NAME);
const _srv = DNS.srv;
const _txt = DNS.txt;

DNS.srv = function (name) {
  if (["_caldavs._tcp.localhost", "_carddavs._tcp.localhost"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  if (["_caldavs._tcp.imap.test", "_carddavs._tcp.imap.test"].includes(name)) {
    return [{ prio: 0, weight: 0, host: "example.org", port: 443 }];
  }
  throw new Error(`Unexpected DNS SRV lookup: ${name}`);
};
DNS.txt = function (name) {
  if (name == "_caldavs._tcp.localhost") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.localhost") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  if (name == "_caldavs._tcp.imap.test") {
    return [
      { strings: ["path=/browser/comm/calendar/test/browser/data/dns.sjs"] },
    ];
  }
  if (name == "_carddavs._tcp.imap.test") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
    ];
  }
  throw new Error(`Unexpected DNS TXT lookup: ${name}`);
};

add_setup(function () {
  emailUser = {
    name: "John Doe",
    email: "john.doe@momo.invalid",
    password: "abc12345",
    incomingHost: "mail.momo.invalid",
    outgoingHost: "mail.momo.invalid",
    outgoingPort: 465,
  };

  // Set the pref to load a local autoconfig file.
  const url =
    "http://mochi.test:8888/browser/comm/mail/test/browser/account/xml/";
  Services.prefs.setCharPref(PREF_NAME, url);
});

registerCleanupFunction(function () {
  DNS.srv = _srv;
  DNS.txt = _txt;
  // Restore the original pref.
  Services.prefs.setCharPref(PREF_NAME, PREF_VALUE);
});

add_task(async function test_account_load_sync_accounts_imap_account() {
  IMAPServer.open();
  SMTPServer.open();
  emailUser = {
    name: "John Doe",
    email: "john.doe@imap.test",
    password: "abc12345",
    incomingHost: "testin.imap.test",
    outgoingHost: "testout.imap.test",
  };

  const dialog = await subtest_open_account_hub_dialog();
  await subtest_fill_initial_config_fields(dialog, emailUser);
  const footer = dialog.querySelector("account-hub-footer");
  const footerForward = footer.querySelector("#forward");
  const configFoundTemplate = dialog.querySelector("email-config-found");

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(configFoundTemplate.querySelector("#imap")),
    "The IMAP config option should be visible"
  );

  // Continue button should lead to password template.
  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  Assert.ok(
    BrowserTestUtils.isHidden(configFoundTemplate),
    "The config found template should be hidden."
  );
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(dialog.querySelector("email-password-form")),
    "The email password form should be visible."
  );

  const emailPasswordTemplate = dialog.querySelector("email-password-form");
  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        emailPasswordTemplate.querySelector("#password")
      ),
    "The password form input should be visible."
  );
  const passwordInput = emailPasswordTemplate.querySelector("#password");

  EventUtils.synthesizeMouseAtCenter(passwordInput, {});

  // Entering the correct password should hide current subview.
  const inputEvent = BrowserTestUtils.waitForEvent(
    passwordInput,
    "input",
    true,
    event => event.target.value === "abc12345"
  );
  EventUtils.sendString("abc12345", window);
  await inputEvent;

  EventUtils.synthesizeMouseAtCenter(footerForward, {});
  await TestUtils.waitForCondition(
    () => BrowserTestUtils.isHidden(emailPasswordTemplate),
    "The email password subview should be hidden."
  );

  let imapAccount;

  await TestUtils.waitForCondition(
    () =>
      (imapAccount = MailServices.accounts.accounts.find(
        account => account.identities[0]?.email === emailUser.email
      )),
    "The imap account should be created."
  );

  await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        dialog.querySelector("email-sync-accounts-form")
      ),
    "The sync accounts view should be in view."
  );
  const syncAccountsTemplate = dialog.querySelector("email-sync-accounts-form");
  // Wait for the select all buttons to be in view to show the sync accounts.
  const selectAllAddressBooksButtonPromise = await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        syncAccountsTemplate.querySelector("#selectAllAddressBooks")
      ),
    "The select all address books button should be visible."
  );
  const selectAllCalendarsButtonPromise = await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(
        syncAccountsTemplate.querySelector("#selectAllCalendars")
      ),
    "The select all calendars button should be visible."
  );
  await selectAllAddressBooksButtonPromise;
  await selectAllCalendarsButtonPromise;

  const selectAllAddressBooks = syncAccountsTemplate.querySelector(
    "#selectAllAddressBooks"
  );
  const selectAllCalendars = syncAccountsTemplate.querySelector(
    "#selectAllCalendars"
  );
  const selectedAddressBooks = syncAccountsTemplate.querySelector(
    "#selectedAddressBooks"
  );
  const selectedCalendars =
    syncAccountsTemplate.querySelector("#selectedCalendars");

  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectAllAddressBooks).id,
    "account-hub-deselect-all",
    "Address book select toggle should be deselect all."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedAddressBooks).args.count,
    1,
    "Address books count should be 1."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectAllCalendars).id,
    "account-hub-deselect-all",
    "Calendars select toggle should be deselect all."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedCalendars).args.count,
    2,
    "Calendars count should be 2."
  );

  const addressBooks = syncAccountsTemplate.querySelectorAll(
    "#addressBooks label"
  );
  Assert.equal(addressBooks.length, 1, "There should be one address book.");
  Assert.equal(
    syncAccountsTemplate.querySelectorAll("#addressBooks input:checked").length,
    1,
    "There should 1 checked address book."
  );
  Assert.equal(
    addressBooks[0].textContent,
    "You found me!",
    "The address book found should have the name - You found me!"
  );

  const calendars = syncAccountsTemplate.querySelectorAll("#calendars label");
  Assert.equal(calendars.length, 2, "There should be two calendars.");
  Assert.equal(
    syncAccountsTemplate.querySelectorAll("#calendars input:checked").length,
    2,
    "There should 2 checked calendars."
  );
  Assert.equal(
    calendars[0].textContent,
    "You found me!",
    "The first calendar found should have the name - You found me!"
  );
  Assert.equal(
    calendars[1].textContent,
    "Röda dagar",
    "The second calendar found should have the name - Röda dagar"
  );

  // Unchecking an input should update the count label, and the select toggle
  // fluent id.
  let checkEvent = BrowserTestUtils.waitForEvent(
    addressBooks[0].querySelector("input"),
    "change",
    true,
    event => !event.target.checked
  );
  EventUtils.synthesizeMouseAtCenter(
    addressBooks[0].querySelector("input"),
    {}
  );
  await checkEvent;
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectAllAddressBooks).id,
    "account-hub-select-all",
    "Address book select toggle should be select all."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedAddressBooks).args.count,
    0,
    "Address books count should be 0."
  );

  // Selecting deselect all calendars should update all inputs to be unchecked
  // and set the count to 0.
  const selectToggleEvent = BrowserTestUtils.waitForEvent(
    selectAllCalendars,
    "click"
  );
  EventUtils.synthesizeMouseAtCenter(selectAllCalendars, {});
  await selectToggleEvent;
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectAllCalendars).id,
    "account-hub-select-all",
    "Calendar select toggle should be select all."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedCalendars).args.count,
    0,
    "Calendars count should be 0."
  );

  // Select the first calendar and address book and click continue to add
  // the selected calendar and address book.
  checkEvent = BrowserTestUtils.waitForEvent(
    addressBooks[0].querySelector("input"),
    "change",
    true,
    event => event.target.checked
  );
  EventUtils.synthesizeMouseAtCenter(
    addressBooks[0].querySelector("input"),
    {}
  );
  await checkEvent;
  checkEvent = BrowserTestUtils.waitForEvent(
    calendars[0].querySelector("input"),
    "change",
    true,
    event => event.target.checked
  );
  EventUtils.synthesizeMouseAtCenter(calendars[0].querySelector("input"), {});
  await checkEvent;

  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedAddressBooks).args.count,
    1,
    "Address books count should be 1."
  );
  Assert.equal(
    syncAccountsTemplate.l10n.getAttributes(selectedCalendars).args.count,
    1,
    "Calendars count should be 1."
  );
  const calendarPromise = new Promise(resolve => {
    const observer = {
      onCalendarRegistered(calendar) {
        cal.manager.removeObserver(this);
        resolve(calendar);
      },
      onCalendarUnregistering() {},
      onCalendarDeleting() {},
    };
    cal.manager.addObserver(observer);
  });
  const addressBookDirectoryPromise = TestUtils.topicObserved(
    "addrbook-directory-synced"
  );

  EventUtils.synthesizeMouseAtCenter(footerForward, {});

  // Check existance of address book and calendar.
  const [addressBookDirectory] = await addressBookDirectoryPromise;
  Assert.equal(addressBookDirectory.dirName, "You found me!");
  Assert.equal(
    addressBookDirectory.dirType,
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  Assert.equal(
    addressBookDirectory.getStringValue("carddav.url", ""),
    "https://example.org/browser/comm/mail/components/addrbook/test/browser/data/addressbook.sjs"
  );

  const calendar = await calendarPromise;
  Assert.equal(calendar.name, "You found me!");
  Assert.equal(calendar.type, "caldav");

  // Remove the address book and calendar.
  MailServices.ab.deleteAddressBook(addressBookDirectory.URI);
  cal.manager.removeCalendar(calendar);

  await subtest_clear_status_bar();
  MailServices.accounts.removeAccount(imapAccount);
  Services.logins.removeAllLogins();

  IMAPServer.close();
  SMTPServer.close();
  await subtest_close_account_hub_dialog(dialog);
});
