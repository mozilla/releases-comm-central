/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);

function run_test() {
  do_get_profile();

  // Test the handling of accounts for unknown protocols.
  const kAccountName = "Unknown";
  const kPrplId = "prpl-unknown";

  Services.prefs.setCharPref("messenger.account.account1.name", kAccountName);
  Services.prefs.setCharPref("messenger.account.account1.prpl", kPrplId);
  Services.prefs.setCharPref("mail.accountmanager.accounts", "account1");
  Services.prefs.setCharPref("mail.account.account1.server", "server1");
  Services.prefs.setCharPref("mail.server.server1.imAccount", "account1");
  Services.prefs.setCharPref("mail.server.server1.type", "im");
  Services.prefs.setCharPref("mail.server.server1.userName", kAccountName);
  Services.prefs.setCharPref("mail.server.server1.hostname", kPrplId);
  try {
    IMServices.core.init();

    const account = IMServices.accounts.getAccountByNumericId(1);
    Assert.ok(
      account.QueryInterface(Ci.imIAccount),
      "Can query interface the account to imIAccount"
    );
    Assert.equal(account.name, kAccountName);
    Assert.equal(account.normalizedName, kAccountName);
    Assert.equal(account.protocol.id, kPrplId);
    Assert.equal(
      account.connectionErrorReason,
      Ci.imIAccount.ERROR_UNKNOWN_PRPL
    );
  } finally {
    IMServices.core.quit();

    Services.prefs.deleteBranch("messenger");
  }
}
