/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for an untagged ID response with no argument at all:
 *
 *   * ID<CR><LF>
 *
 * nsImapServerResponseParser::id_data() used to hand that to
 * CreateParenGroup(), which assumed fNextToken pointed into the tokenizer
 * buffer. At end of line AdvanceToNextToken() instead hands out the static
 * CRLF literal, so the tokenizer got advanced by the distance between two
 * unrelated objects and was then dereferenced (wild pointer read). Parsing
 * such a response must now just be a syntax error, leaving the connection
 * usable.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump("GMail");
  // The fake server emits "* ID " + idResponse, so an empty response means the
  // ID line carries no token after "ID".
  IMAPPump.daemon.idResponse = "";

  // Update the folder to kick start the ID exchange.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(async function updateInboxAgain() {
  // A second update proves the connection and parser state survived parsing
  // the malformed response (a corrupted parser would crash, fail or hang).
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(function checkNoServerID() {
  // Nothing parseable was sent, so no server ID should have been recorded.
  Assert.ok(
    !IMAPPump.incomingServer.serverIDPref,
    "serverIDResponse pref should be unset after a malformed ID response"
  );
});

add_task(teardownIMAPPump);
