/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the operation of the GlodaContent (in GlodaContent.jsm) and its exposure
 * via Gloda.getMessageContent for IMAP messages that are offline.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);

glodaTestHelperInitialize({ mode: "imap", offline: true });

/* import-globals-from base_gloda_content.js */
load("base_gloda_content.js");

add_task(async function setupTest() {
  // Stub. We're fine here.
});

base_gloda_content_tests.forEach(e => {
  add_task(e);
});
