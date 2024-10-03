/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

let prefsWindow, prefsDocument, tabmail;

add_setup(async function () {
  ({ prefsWindow, prefsDocument } = await openNewPrefsTab("paneQrExport"));
  tabmail = document.getElementById("tabmail");
});

add_task(async function test_init() {
  Assert.ok(
    BrowserTestUtils.isVisible(prefsDocument.getElementById("qrExportIntro")),
    "Intro screen should be visible by default"
  );
});
