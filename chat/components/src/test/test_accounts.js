/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);

function run_test() {
  do_get_profile();

  // Test the handling of accounts for unknown protocols.
  const kAccountName = "Unknown";
  const kPrplId = "prpl-unknown";

  let prefs = Services.prefs;
  prefs.setCharPref("messenger.account.account1.name", kAccountName);
  prefs.setCharPref("messenger.account.account1.prpl", kPrplId);
  prefs.setCharPref("mail.accountmanager.accounts", "account1");
  prefs.setCharPref("mail.account.account1.server", "server1");
  prefs.setCharPref("mail.server.server1.imAccount", "account1");
  prefs.setCharPref("mail.server.server1.type", "im");
  prefs.setCharPref("mail.server.server1.userName", kAccountName);
  prefs.setCharPref("mail.server.server1.hostname", kPrplId);
  try {
    // Having an implementation of nsIXULAppInfo is required for
    // IMServices.core.init to work.
    updateAppInfo();
    IMServices.core.init();

    let account = IMServices.accounts.getAccountByNumericId(1);
    Assert.ok(account instanceof Ci.imIAccount);
    Assert.equal(account.name, kAccountName);
    Assert.equal(account.normalizedName, kAccountName);
    Assert.equal(account.protocol.id, kPrplId);
    Assert.equal(
      account.connectionErrorReason,
      Ci.imIAccount.ERROR_UNKNOWN_PRPL
    );
  } finally {
    IMServices.core.quit();

    prefs.deleteBranch("messenger");
  }
}
