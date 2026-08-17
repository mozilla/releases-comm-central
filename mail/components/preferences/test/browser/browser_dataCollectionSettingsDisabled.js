/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.data_collection_settings.enabled", false]],
  });
});

add_task(async function test_dataCollectionSettings_disabled() {
  const { prefsDocument } = await openNewPrefsTab("panePrivacy");

  const category = prefsDocument.getElementById(
    "privacyDataCollectionCategory"
  );
  if (!category) {
    // Data reporting and its settings UI are not built in this configuration.
    info("Data collection settings UI is not present; nothing to hide");
    await closePrefsTab();
    return;
  }

  Assert.ok(
    BrowserTestUtils.isHidden(category),
    "The data collection category header should be hidden by DisableDataCollectionSettings"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(
      prefsDocument.getElementById("dataCollectionGroup")
    ),
    "The data collection settings section should be hidden by DisableDataCollectionSettings"
  );

  await closePrefsTab();
});
