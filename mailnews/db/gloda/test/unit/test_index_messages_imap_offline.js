/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests how well gloda indexes IMAP messages that are offline from the start.
 */

var { glodaTestHelperInitialize } = ChromeUtils.import(
  "resource://testing-common/gloda/GlodaTestHelper.jsm"
);
var { MessageGenerator, MessageScenarioFactory } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

/* import-globals-from base_index_messages.js */
load("base_index_messages.js");

var msgGen;
var scenarios;
var messageInjection;

add_setup(async function () {
  msgGen = new MessageGenerator();
  scenarios = new MessageScenarioFactory(msgGen);
  messageInjection = new MessageInjection(
    { mode: "imap", offline: true },
    msgGen
  );
  glodaTestHelperInitialize(messageInjection);
});

base_index_messages_tests.forEach(e => {
  add_task(e);
});
