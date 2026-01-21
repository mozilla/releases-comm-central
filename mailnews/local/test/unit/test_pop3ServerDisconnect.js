/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var server;
var daemon;
var incomingServer;

add_setup(async function () {
  // Set up a server that immediately answers with an error after connecting.
  daemon = new Pop3Daemon();
  function createHandler(d) {
    var handler = new POP3_RFC1939_handler(d);
    handler.onStartup = () => {
      return "-ERR Permission denied - do not try again";
    };
    return handler;
  }
  server = new nsMailServer(createHandler, daemon);
  server.start();

  incomingServer = createPop3ServerAndLocalFolders(server.port);

  // Check that we haven't got any messages in the folder, if we have its a test
  // setup issue.
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  daemon.setMessages(["message1.eml"]);
});

add_task(async function getMail() {
  // Now get the mail.
  const urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.pop3.GetNewMail(
    null,
    urlListener,
    localAccountUtils.inboxFolder,
    incomingServer
  );
  server.performTest();
  await Assert.rejects(
    urlListener.promise,
    reason => {
      return reason === Cr.NS_ERROR_FAILURE;
    },
    "Check that getting mail failed as expected"
  );

  // Should send nothing after the server denied access.
  const transaction = server.playTransaction();
  do_check_transaction(transaction, [""]);

  // We shouldn't have emails either.
  Assert.equal(localAccountUtils.inboxFolder.getTotalMessages(false), 0);

  server.resetTest();
});

add_task(function endTest() {
  // Cleanup for potential Sockets/Ports leakage.
  server.stop();
  server = null;
  daemon = null;
  incomingServer = null;
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
