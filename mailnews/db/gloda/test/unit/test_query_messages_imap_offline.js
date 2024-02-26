/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test query support for IMAP messages that were offline before they were
 * indexed.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { MessageGenerator } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var msgGen;
var messageInjection;

/* import-globals-from base_query_messages.js */
load("base_query_messages.js");

add_setup(function () {
  msgGen = new MessageGenerator();
  messageInjection = new MessageInjection(
    { mode: "imap", offline: true },
    msgGen
  );
  glodaTestHelperInitialize(messageInjection);
});

base_query_messages_tests.forEach(test => {
  add_task(test);
});
