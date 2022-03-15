/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test indexing support for online IMAP junk.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);

glodaTestHelperInitialize({
  mode: "imap",
  offline: false,
});

/* import-globals-from base_index_junk.js */
load("base_index_junk.js");

add_task(async function setupTest() {
  // Stub. We're fine here.
});

base_index_junk_tests.forEach(e => {
  add_task(e);
});
