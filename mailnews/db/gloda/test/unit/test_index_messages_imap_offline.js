/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests how well gloda indexes IMAP messages that are offline from the start.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);

glodaTestHelperInitialize({ mode: "imap", offline: true });

/* import-globals-from base_index_messages.js */
load("base_index_messages.js");

add_task(async function setupTest() {
  // Stub. We're fine here.
});

base_index_messages_tests.forEach(e => {
  add_task(e);
});
