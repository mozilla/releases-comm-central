/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test indexing bad messages for online IMAP folders.
 */

var { glodaTestHelperInitialize } = ChromeUtils.importESModule(
  "resource://testing-common/gloda/GlodaTestHelper.sys.mjs"
);
var { MessageGenerator } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

var msgGen;
var messageInjection;

/* import-globals-from base_index_bad_messages.js */
load("base_index_bad_messages.js");

add_setup(async function () {
  msgGen = new MessageGenerator();
  messageInjection = new MessageInjection(
    { mode: "imap", offline: false },
    msgGen
  );
  glodaTestHelperInitialize(messageInjection);
  testFolder = await messageInjection.makeEmptyFolder();
});

base_index_bad_messages_tests.forEach(e => {
  add_task(e);
});
