/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_setup(async function () {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.qrexport.enabled", false]],
  });
});

add_task(async function test_qrExport_disabled() {
  const { prefsDocument } = await openNewPrefsTab();

  Assert.ok(
    !prefsDocument.getElementById("category-qrexport"),
    "The Export for Mobile category should not be present"
  );

  Assert.ok(
    !prefsDocument.getElementById("paneQrExport"),
    "The Export for Mobile pane should not be present"
  );
});
