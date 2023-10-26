/* Any copyright is dedicated to the Public Domain.
http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var incomingServer, server;

const kUserName = "user";
const kValidPassword = "password";

var gTests = [
  {
    title: "Cleartext password, with server only supporting old-style login",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: [],
    expectSuccess: true,
    transaction: [
      "capability",
      "CLIENTID",
      "authenticate PLAIN",
      "capability",
      "list",
      "lsub",
    ],
  },
];

add_task(async function () {
  const daemon = new ImapDaemon();
  server = makeServer(daemon, "", {
    // Make username of server match the singons.txt file
    // (pw there is intentionally invalid)
    kUsername: kUserName,
    kPassword: kValidPassword,
  });
  server.setDebugLevel(fsDebugAll);
  incomingServer = createLocalIMAPServer(server.port);

  // Turn on CLIENTID and populate the clientid with a uuid.
  incomingServer.clientidEnabled = true;
  incomingServer.clientid = "4d8776ca-0251-11ea-8d71-362b9e155667";

  // Connect.
  incomingServer.performExpand(null);
  server.performTest("LSUB");

  do_check_transaction(server.playTransaction(), gTests[0].transaction, false);

  server.resetTest();
});

registerCleanupFunction(function () {
  incomingServer.closeCachedConnections();
  server.stop();

  var thread = gThreadManager.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }
});
