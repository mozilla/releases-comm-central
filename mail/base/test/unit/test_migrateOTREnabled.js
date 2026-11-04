/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that OTR stays enabled after migration only for profiles that have
 * OTR fingerprints, or where the user has set the pref.
 */

var { MailMigrator } = ChromeUtils.importESModule(
  "resource:///modules/MailMigrator.sys.mjs"
);

const PREF = "chat.otr.enable";
const fingerprintsPath = PathUtils.join(
  do_get_profile().path,
  "otr.fingerprints"
);

function migrate() {
  Services.prefs.setIntPref("mail.ui-rdf.version", 66);
  MailMigrator._migrateUI();
}

const defaults = Services.prefs.getDefaultBranch("");

add_setup(function () {
  defaults.setBoolPref(PREF, false);
});

add_task(async function test_noFingerprintsFile() {
  migrate();
  Assert.ok(!Services.prefs.prefHasUserValue(PREF), "pref should be unset");
  Assert.ok(!Services.prefs.getBoolPref(PREF), "OTR should be disabled");
});

add_task(async function test_emptyFingerprintsFile() {
  await IOUtils.writeUTF8(fingerprintsPath, "");
  migrate();
  Assert.ok(!Services.prefs.getBoolPref(PREF), "OTR should be disabled");
  await IOUtils.remove(fingerprintsPath);
});

add_task(async function test_withFingerprints() {
  await IOUtils.writeUTF8(
    fingerprintsPath,
    "buddy@example.com\tme@example.com\tprpl-jabber\t" +
      "0123456789abcdef0123456789abcdef01234567\tverified\n"
  );
  migrate();
  Assert.ok(Services.prefs.getBoolPref(PREF), "OTR should stay enabled");
  Services.prefs.clearUserPref(PREF);
  await IOUtils.remove(fingerprintsPath);
});

add_task(async function test_userDisabled() {
  await IOUtils.writeUTF8(fingerprintsPath, "x\n");
  // A user value of false, set while the default was still true.
  defaults.setBoolPref(PREF, true);
  Services.prefs.setBoolPref(PREF, false);
  defaults.setBoolPref(PREF, false);
  migrate();
  Assert.ok(Services.prefs.prefHasUserValue(PREF), "user value is kept");
  Assert.ok(!Services.prefs.getBoolPref(PREF), "OTR should stay disabled");
  Services.prefs.clearUserPref(PREF);
  await IOUtils.remove(fingerprintsPath);
});
