/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.update_settings.enabled", false]],
  });
});

add_task(async function test_updateSettings_disabled() {
  const { prefsDocument } = await openNewPrefsTab("paneGeneral");

  const updatesCategory = prefsDocument.getElementById("updatesCategory");
  if (!updatesCategory) {
    // The updater and its settings UI are not built in this configuration.
    info("Update settings UI is not present; nothing to hide");
    await closePrefsTab();
    return;
  }

  Assert.ok(
    BrowserTestUtils.isHidden(updatesCategory),
    "The updates category header should be hidden by DisableUpdateSettings"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(prefsDocument.getElementById("updateApp")),
    "The update settings section should be hidden by DisableUpdateSettings"
  );

  await closePrefsTab();
});
