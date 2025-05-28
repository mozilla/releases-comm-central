/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { DNS } = ChromeUtils.importESModule("resource:///modules/DNS.sys.mjs");

const { cal } = ChromeUtils.importESModule(
  "resource:///modules/calendar/calUtils.sys.mjs"
);

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
  if (name == "_carddavs._tcp.localhost") {
    return [
      {
        strings: [
          "path=/browser/comm/mail/components/addrbook/test/browser/data/dns.sjs",
        ],
      },
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

add_task(async function test_address_book_option_select_account_with_ab() {
  IMAPServer.open();
  const abAccount = MailServices.accounts.createAccount();
  abAccount.incomingServer = MailServices.accounts.createIncomingServer(
    "john.doe@imap.test",
    "imap.test",
    "imap"
  );

  const abAccountIdentity = MailServices.accounts.createIdentity();
  abAccountIdentity.email = "john.doe@imap.test";
  abAccount.addIdentity(abAccountIdentity);
  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(
    "https://example.org",
    null,
    "https://example.org",
    "john.doe@imap.test",
    "abc12345",
    "",
    ""
  );
  await Services.logins.addLoginAsync(loginInfo);

  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");

  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );

  await TestUtils.waitForCondition(
    () =>
      optionSelectTemplate.l10n.getAttributes(
        optionSelectTemplate.querySelector("#syncExistingAccountsData")
      ).id === "account-hub-address-book-sync-option-data",
    "The option select subview should have applied the address book count"
  );

  // The sync accounts option should be enabled as there are is one account
  // with an available address book.
  Assert.ok(
    !optionSelectTemplate.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be enabled"
  );

  Services.logins.removeAllLogins();
  MailServices.accounts.removeAccount(abAccount);
  IMAPServer.close();
});

add_task(async function test_address_book_option_select_no_accounts() {
  // Open the dialog.
  const dialog = await subtest_open_account_hub_dialog("ADDRESS_BOOK");

  const optionSelectTemplate = dialog.querySelector(
    "address-book-option-select"
  );

  await BrowserTestUtils.waitForMutationCondition(
    optionSelectTemplate,
    { childList: true },
    () => !!optionSelectTemplate.querySelector("#syncExistingAccounts")
  );

  // The sync accounts option should be disabled as there are no accounts.
  Assert.ok(
    optionSelectTemplate.querySelector("#syncExistingAccounts").disabled,
    "The sync accounts option should be disabled"
  );
});
