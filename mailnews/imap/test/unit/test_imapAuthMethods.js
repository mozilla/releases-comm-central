/**
 * Login tests for IMAP
 *
 * Test code <copied from="test_mailboxes.js">
 * and <copied from="test_pop3AuthMethods.js">
 *
 * BUGS:
 * - cleanup after each test doesn't seem to work correctly. Effects:
 *    - one more "lsub" per test, e.g. "capability", "auth...", "lsub", "lsub", "lsub", "list" in the 3. test.,
 *    - root folder check succeeds although login failed
 * - removeIncomingServer(..., true); (cleanup files) fails.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

// const kUsername = "fred";
// const kPassword = "wilma";

var thisTest;

var tests = [
  {
    title: "Cleartext password, with server only supporting old-style login",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: [],
    expectSuccess: true,
    transaction: ["CAPABILITY", "LOGIN", "CAPABILITY", "LIST", "LSUB"],
  },
  {
    // Just to make sure we clean up properly - in the test and in TB, e.g. don't cache stuff
    title:
      "Second time Cleartext password, with server only supporting old-style login",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: [],
    expectSuccess: true,
    transaction: ["CAPABILITY", "LOGIN", "CAPABILITY", "LIST", "LSUB"],
  },
  {
    title:
      "Cleartext password, with server supporting AUTH PLAIN, LOGIN and CRAM",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: ["PLAIN", "LOGIN", "CRAM-MD5"],
    expectSuccess: true,
    transaction: [
      "CAPABILITY",
      "AUTHENTICATE PLAIN",
      "CAPABILITY",
      "LIST",
      "LSUB",
    ],
  },
  {
    title: "Cleartext password, with server supporting only AUTH LOGIN",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: ["LOGIN"],
    expectSuccess: true,
    transaction: [
      "CAPABILITY",
      "AUTHENTICATE LOGIN",
      "CAPABILITY",
      "LIST",
      "LSUB",
    ],
  },
  {
    title: "Encrypted password, with server supporting PLAIN and CRAM",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    serverAuthMethods: ["PLAIN", "LOGIN", "CRAM-MD5"],
    expectSuccess: true,
    transaction: [
      "CAPABILITY",
      "AUTHENTICATE CRAM-MD5",
      "CAPABILITY",
      "LIST",
      "LSUB",
    ],
  },
  {
    title:
      "Encrypted password, with server only supporting AUTH PLAIN and LOGIN (must fail)",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    serverAuthMethods: ["PLAIN", "LOGIN"],
    expectSuccess: false,
    transaction: ["CAPABILITY"],
  },
];

function nextTest() {
  try {
    thisTest = tests.shift();
    if (!thisTest) {
      endTest();
      return;
    }

    dump("NEXT test: " + thisTest.title + "\n");

    // (re)create fake server
    var daemon = new ImapDaemon();
    var server = makeServer(daemon, "", {
      kAuthSchemes: thisTest.serverAuthMethods,
    });
    server.setDebugLevel(nsMailServer.debugAll);

    // If Mailnews ever caches server capabilities, delete and re-create the incomingServer here
    var incomingServer = createLocalIMAPServer(server.port);

    const msgServer = incomingServer;
    msgServer.QueryInterface(Ci.nsIMsgIncomingServer);
    msgServer.authMethod = thisTest.clientAuthMethod;

    // connect
    incomingServer.performExpand(null);
    server.performTest("LSUB");

    dump("should " + (thisTest.expectSuccess ? "" : "not ") + "be logged in\n");
    Assert.equal(true, incomingServer instanceof Ci.nsIImapServerSink);
    do_check_transaction(server.playTransaction(), thisTest.transaction, false);

    do {
      incomingServer.closeCachedConnections();
    } while (incomingServer.serverBusy);
    deleteIMAPServer(incomingServer);
    incomingServer = null;
    MailServices.accounts.closeCachedConnections();
    MailServices.accounts.shutdownServers();
    MailServices.accounts.unloadAccounts();
    server.stop();
  } catch (e) {
    // server.stop();
    // endTest();
    do_throw(e);
  }

  nextTest();
}

function deleteIMAPServer(incomingServer) {
  if (!incomingServer) {
    return;
  }
  MailServices.accounts.removeIncomingServer(incomingServer, true);
}

function run_test() {
  do_test_pending();

  registerAlertTestUtils();

  nextTest();
}

function endTest() {
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    thread.processNextEvent(true);
  }

  do_test_finished();
}
