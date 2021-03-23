/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test for libotr.
 */

"use strict";

const { OTRLibLoader } = ChromeUtils.import("resource:///modules/OTRLib.jsm");

/**
 * Initialize libotr.
 */
add_task(async function setUp() {
  let libOTR = await OTRLibLoader.init();
  Assert.ok(libOTR.otrl_version, "libotr did load");
});
