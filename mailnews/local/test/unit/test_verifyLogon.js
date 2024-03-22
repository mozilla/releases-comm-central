/**
 * This test checks to see if the pop3 verify logon handles password failure correctly.
 * The steps are:
 *   - Set an invalid password on the server object.
 *   - Check that verifyLogon fails
 */

/* import-globals-from ../../../test/resources/alertTestUtils.js */
load("../../../resources/alertTestUtils.js");

var server;
var daemon;
var incomingServer;

var kUserName = "testpop3";
var kInvalidPassword = "pop3test";
var kValidPassword = "testpop3";

function verifyPop3Logon(validPassword) {
  incomingServer.password = validPassword ? kValidPassword : kInvalidPassword;
  urlListener.expectSuccess = validPassword;
  const uri = incomingServer.verifyLogon(urlListener, gDummyMsgWindow);
  // clear msgWindow so url won't prompt for passwords.
  uri.QueryInterface(Ci.nsIMsgMailNewsUrl).msgWindow = null;

  server.performTest();
  return false;
}

var urlListener = {
  expectSucess: false,
  OnStartRunningUrl() {},
  OnStopRunningUrl(url, aResult) {
    Assert.equal(Components.isSuccessCode(aResult), this.expectSuccess);
  },
};

function actually_run_test() {
  daemon.setMessages(["message1.eml"]);

  // check that verifyLogon fails with bad password
  verifyPop3Logon(false);

  dump("\nverify logon false 1\n");
  do_timeout(1000, verifyGoodLogon);
}

function verifyGoodLogon() {
  server.resetTest();

  // check that verifyLogon succeeds with good password
  verifyPop3Logon(true);

  dump("\nverify logon true 1\n");
  do_test_finished();
}

function run_test() {
  // Disable new mail notifications
  Services.prefs.setBoolPref("mail.biff.play_sound", false);
  Services.prefs.setBoolPref("mail.biff.show_alert", false);
  Services.prefs.setBoolPref("mail.biff.show_tray_icon", false);
  Services.prefs.setBoolPref("mail.biff.animate_dock_icon", false);
  // Set up the Server
  daemon = new Pop3Daemon();
  function createHandler(d) {
    var handler = new POP3_RFC1939_handler(d);
    // Login information needs to match the one stored in the signons json file.
    handler.kUsername = kUserName;
    handler.kPassword = kValidPassword;
    handler.dropOnAuthFailure = true;
    return handler;
  }
  server = new nsMailServer(createHandler, daemon);
  server.start();

  // Set up the basic accounts and folders.
  // We would use createPop3ServerAndLocalFolders() however we want to have
  // a different username and NO password for this test (as we expect to load
  // it from the signons json file in which the login information is stored).
  localAccountUtils.loadLocalMailAccount();

  incomingServer = MailServices.accounts.createIncomingServer(
    kUserName,
    "localhost",
    "pop3"
  );
  incomingServer.port = server.port;

  do_test_pending();

  actually_run_test();
}
