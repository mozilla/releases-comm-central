/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { isFirstRun } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FirstRun.sys.mjs"
);

add_setup(async () => {
  do_get_profile();
});

add_task(function testNotFirstRunWithPref() {
  Assert.ok(!isFirstRun(), "Should indicate not a first run at all");
});
