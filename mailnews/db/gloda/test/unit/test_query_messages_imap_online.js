/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test query support for IMAP messages that aren't offline.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

glodaTestHelperInitialize({
  mode: "imap",
  offline: false,
});

/* import-globals-from base_query_messages.js */
load("base_query_messages.js");

expectFulltextResults = false;

base_query_messages_tests.forEach(test => {
  add_task(test);
});
