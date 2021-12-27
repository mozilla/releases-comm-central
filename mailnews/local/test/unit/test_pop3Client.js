/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test when alwaysSTARTTLS is set, but the server doesn't support STARTTLS,
 * should abort after CAPA response.
 */
add_task(async function testSTARTTLS() {
  let [, server] = setupServerDaemon();
  server.start();
  registerCleanupFunction(() => {
    server.stop();
  });

  let incomingServer = createPop3ServerAndLocalFolders(server.port);
  // Set to always use STARTTLS.
  incomingServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  let urlListener = {
    OnStartRunningUrl() {},
    OnStopRunningUrl(url, result) {
      let transaction = server.playTransaction();
      do_check_transaction(transaction, ["AUTH", "CAPA"]);
      Assert.equal(result, Cr.NS_ERROR_FAILURE);
      do_test_finished();
    },
  };

  // Now get the mail.
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );

  server.performTest();

  do_test_pending();
});
