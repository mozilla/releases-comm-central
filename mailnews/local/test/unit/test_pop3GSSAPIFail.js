/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/**
 * A server offers GSSAPI (Kerberos), but auth fails, due to client or server.
 *
 * This mainly tests whether we use the correct login mode.
 *
 * Whether it fails due to
 * - client not set up
 * - client ticket expired / not logged in
 * - server not being set up properly
 * makes no difference to Thunderbird, as that's all hidden in the gssapi-Library
 * from the OS. So, the server here just returning err is a good approximation
 * of reality of the above cases.
 *
 * Actually, we (more precisely the OS GSSAPI lib) fail out of band
 * in the Kerberos protocol, before the AUTH GSSAPI command is even issued.
 *
 * @author Ben Bucksch
 */

var server;
var daemon;
var authSchemes;
var incomingServer;
var thisTest;

var tests = [
  {
    title: "GSSAPI auth, server with GSSAPI only",
    clientAuthMethod: Ci.nsMsgAuthMethod.GSSAPI,
    serverAuthMethods: ["GSSAPI"],
    expectSuccess: false,
    transaction: ["AUTH", "CAPA"],
  },
  {
    // First GSSAPI step happens and fails out of band, thus no "AUTH GSSAPI"
    title: "GSSAPI auth, server with GSSAPI and CRAM-MD5",
    clientAuthMethod: Ci.nsMsgAuthMethod.GSSAPI,
    serverAuthMethods: ["GSSAPI", "CRAM-MD5"],
    expectSuccess: false,
    transaction: ["AUTH", "CAPA"],
  },
  {
    title: "Any secure auth, server with GSSAPI only",
    clientAuthMethod: Ci.nsMsgAuthMethod.secure,
    serverAuthMethods: ["GSSAPI"],
    expectSuccess: false,
    transaction: ["AUTH", "CAPA"],
  },
  {
    title: "Any secure auth, server with GSSAPI and CRAM-MD5",
    clientAuthMethod: Ci.nsMsgAuthMethod.secure,
    serverAuthMethods: ["GSSAPI", "CRAM-MD5"],
    expectSuccess: true,
    transaction: ["AUTH", "CAPA", "AUTH CRAM-MD5", "STAT"],
  },
  {
    title: "Encrypted password, server with GSSAPI and CRAM-MD5",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    serverAuthMethods: ["GSSAPI", "CRAM-MD5"],
    expectSuccess: true,
    transaction: ["AUTH", "CAPA", "AUTH CRAM-MD5", "STAT"],
  },
];

var urlListener = {
  OnStartRunningUrl(url) {},
  OnStopRunningUrl(url, result) {
    try {
      if (thisTest.expectSuccess) {
        Assert.equal(result, 0);
      } else {
        Assert.notEqual(result, 0);
      }

      var transaction = server.playTransaction();
      do_check_transaction(transaction, thisTest.transaction);

      do_timeout(0, checkBusy);
    } catch (e) {
      server.stop();
      var thread = gThreadManager.currentThread;
      while (thread.hasPendingEvents()) {
        thread.processNextEvent(true);
      }

      do_throw(e);
    }
  },
};

function checkBusy() {
  if (tests.length == 0) {
    incomingServer.closeCachedConnections();

    // No more tests, let everything finish
    server.stop();

    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }

    do_test_finished();
    return;
  }

  // If the server hasn't quite finished, just delay a little longer.
  if (incomingServer.serverBusy) {
    do_timeout(20, checkBusy);
    return;
  }

  testNext();
}

function testNext() {
  thisTest = tests.shift();

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    server.resetTest();

    test = thisTest.title;
    dump("NEXT test is: " + thisTest.title + "\n");

    authSchemes = thisTest.serverAuthMethods;

    // Mailnews caches server capabilities, so try to reset it
    deletePop3Server();
    incomingServer = createPop3Server();

    const msgServer = incomingServer;
    msgServer.QueryInterface(Ci.nsIMsgIncomingServer);
    msgServer.authMethod = thisTest.clientAuthMethod;

    MailServices.pop3.GetNewMail(
      null,
      urlListener,
      localAccountUtils.inboxFolder,
      incomingServer
    );
    server.performTest();
  } catch (e) {
    server.stop();
    do_throw(e);
  }
}

// <copied from="head_maillocal.js::createPop3ServerAndLocalFolders()">
function createPop3Server() {
  const incoming = MailServices.accounts.createIncomingServer(
    "fred",
    "localhost",
    "pop3"
  );
  incoming.port = server.port;
  incoming.password = "wilma";
  return incoming;
}
// </copied>

function deletePop3Server() {
  if (!incomingServer) {
    return;
  }
  MailServices.accounts.removeIncomingServer(incomingServer, true);
  incomingServer = null;
}

class GSSAPIFail_handler extends POP3_RFC5034_handler {
  _needGSSAPI = false;
  // kAuthSchemes will be set by test

  AUTH(restLine) {
    var scheme = restLine.split(" ")[0];
    if (scheme == "GSSAPI") {
      this._multiline = true;
      this._needGSSAPI = true;
      return "+";
    }
    return super.AUTH(restLine); // call parent
  }
  onMultiline(line) {
    if (this._needGSSAPI) {
      this._multiline = false;
      this._needGSSAPI = false;
      return "-ERR hm.... shall I allow you? hm... NO.";
    }

    if (super.onMultiline) {
      // Call parent.
      return super.onMultiline(line);
    }
    return undefined;
  }
}

function run_test() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);

  daemon = new Pop3Daemon();
  function createHandler(d) {
    var handler = new GSSAPIFail_handler(d);
    handler.kAuthSchemes = authSchemes;
    return handler;
  }
  server = new nsMailServer(createHandler, daemon);
  server.start();

  // incomingServer = createPop3ServerAndLocalFolders();
  localAccountUtils.loadLocalMailAccount();

  do_test_pending();

  testNext();
}
