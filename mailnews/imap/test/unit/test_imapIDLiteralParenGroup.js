/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Regression test for bug 2057805: a server ID response whose paren group
 * contains a literal that exactly fills its line used to leave
 * nsImapGenericParser::CreateParenGroup() reading from a freed tokenizer
 * buffer (heap-use-after-free). The crafted response below reproduces that
 * exact shape; parsing it must complete cleanly and land the parsed value in
 * the serverIDResponse pref.
 *
 * On the wire the server emits:
 *   * ID ({4}<CR><LF>
 *   ab<CR><LF>
 *   )<CR><LF>
 * where {4} is a literal of the four octets 'a', 'b', CR, LF -- i.e. the
 * literal length equals the whole "ab\r\n" line including its CRLF, which is
 * what triggered the use-after-free.
 */

/* import-globals-from ../../../test/resources/logHelper.js */
load("../../../resources/logHelper.js");

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// The fake server joins the pieces of an ID response with a NUL, which the
// transport turns into separate CRLF-terminated lines. Keeping the literal
// marker and its payload here produces the crafted three-line response.
var kIDResponse = "({4}\r\nab\r\n)";

add_setup(async function () {
  setupIMAPPump("GMail");
  IMAPPump.daemon.idResponse = kIDResponse;

  // Update the folder to kick start the ID exchange.
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(async function updateInboxAgain() {
  // A second update proves the connection and parser state survived parsing
  // the crafted response (a corrupted parser would fail or hang here).
  const promiseUrlListener = new PromiseTestUtils.PromiseUrlListener();
  IMAPPump.inbox.updateFolderWithListener(null, promiseUrlListener);
  await promiseUrlListener.promise;
});

add_task(function checkParsedServerID() {
  // The literal payload must have been parsed out of the paren group without
  // crashing and persisted to the pref.
  const serverID = IMAPPump.incomingServer.serverIDPref;
  Assert.ok(!!serverID, "serverIDResponse pref should be set");
  Assert.ok(
    serverID.includes("ab"),
    `parsed server ID should contain the literal payload, got: ${JSON.stringify(
      serverID
    )}`
  );
});

add_task(teardownIMAPPump);
