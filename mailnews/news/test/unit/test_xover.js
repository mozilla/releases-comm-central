/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const daemon = setupNNTPDaemon();
const server = makeServer(NNTP_RFC2980_handler, daemon);
server.start();
registerCleanupFunction(() => {
  server.stop();
});

const incomingServer = setupLocalServer(server.port);

/**
 * Test nsIDBFolderInfo.knownArtsSet is correctly updated after XOVER response.
 * knownArtsSet depends on the XOVER range requested, it doesn't matter if
 * articles in that range don't exist on the server.
 */
add_task(function test_updateKnownKeySetAfterXOver() {
  // setupNNTPDaemon inited test.filter with 8 messages, delete the 5th, 6th here.
  daemon.removeArticleFromGroup("test.filter", 5);
  daemon.removeArticleFromGroup("test.filter", 6);

  // Trigger a get new messages request.
  const prefix = "news://localhost:" + server.port + "/";
  setupProtocolTest(server.port, prefix + "test.filter", incomingServer);
  server.performTest();
  const transaction = server.playTransaction();

  // Test XOVER was sent correctly.
  do_check_transaction(transaction, [
    "MODE READER",
    "GROUP test.filter",
    "XOVER 1-8",
  ]);

  // Test knownArtsSet was updated correctly.
  const folder = incomingServer.rootFolder.getChildNamed("test.filter");
  const groupInfo = folder.msgDatabase.dBFolderInfo;
  // knownArtsSet should be "1-8", not "1-4,7-8".
  equal(groupInfo.knownArtsSet, "1-8");
});
