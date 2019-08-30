/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource:///modules/imServices.jsm");
const { updateAppInfo } = ChromeUtils.import(
  "resource://testing-common/AppInfo.jsm"
);

function run_test() {
  do_get_profile();

  // Test the handling of accounts for unknown protocols.
  const kAccountName = "Unknown";
  const kPrplId = "prpl-unknown";

  let prefs = Services.prefs;
  prefs.setCharPref("messenger.account.account1.name", kAccountName);
  prefs.setCharPref("messenger.account.account1.prpl", kPrplId);
  prefs.setCharPref("messenger.accounts", "account1");

  try {
    // Having an implementation of nsIXULAppInfo is required for
    // Services.core.init to work.
    updateAppInfo();
    Services.core.init();

    let account = Services.accounts.getAccountByNumericId(1);
    Assert.ok(account instanceof Ci.imIAccount);
    Assert.equal(account.name, kAccountName);
    Assert.equal(account.normalizedName, kAccountName);
    Assert.equal(account.protocol.id, kPrplId);
    Assert.equal(
      account.connectionErrorReason,
      Ci.imIAccount.ERROR_UNKNOWN_PRPL
    );
  } finally {
    Services.core.quit();

    prefs.deleteBranch("messenger");
  }
}
