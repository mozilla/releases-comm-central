/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Test that the STANDARD_THEMES_DATA in mail/themes/BuiltInThemes.sys.mjs is in
 * sync with the actual themes at mail/themes/addons/*.
 */

var { BuiltInThemes } = ChromeUtils.importESModule(
  "resource:///modules/BuiltInThemes.sys.mjs"
);

add_task(async function test_builtInThemes() {
  const builtInThemes = BuiltInThemes.getBuiltInThemesDataMap();
  for (const [id, data] of builtInThemes) {
    const theme = await AddonManager.getAddonByID(id);
    Assert.ok(!!theme, `The built-in theme <${id}> should be installed.`);
    Assert.equal(
      data.version,
      theme.version,
      `The built-in theme <${id}> should have the expected version string (forgot to update BuiltInThemes.sys.mjs?)`
    );
  }
});
