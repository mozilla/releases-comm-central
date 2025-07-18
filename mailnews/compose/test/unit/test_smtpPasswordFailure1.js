/**
 * This test checks to see if the smtp password failure is handled correctly.
 * The steps are:
 *   - Have an invalid password in the password database.
 *   - Check we get a prompt asking what to do.
 *   - Check retry does what it should do.
 *   - Check cancel does what it should do.
 *
 * XXX Due to problems with the fakeserver + smtp not using one connection for
 * multiple sends, the rest of this test is in test_smtpPasswordFailure2.js.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/* import-globals-from ../../../test/resources/alertTestUtils.js */
/* import-globals-from ../../../test/resources/passwordStorage.js */
load("../../../resources/alertTestUtils.js");
load("../../../resources/passwordStorage.js");

var server;
var attempt = 0;

var kIdentityMail = "identity@foo.invalid";
var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";
var kUsername = "testsmtp";
// Login information needs to match the login information stored in the signons
// json file.
var kInvalidPassword = "smtptest";
var kValidPassword = "smtptest1";

/* exported alert, confirmEx */
// for alertTestUtils.js
function alert(aDialogText, aText) {
  // The first few attempts may prompt about the password problem, the last
  // attempt shouldn't.
  Assert.less(attempt, 4);

  // Log the fact we've got an alert, but we don't need to test anything here.
  dump("Alert Title: " + aDialogText + "\nAlert Text: " + aText + "\n");
}

function confirmExPS() {
  switch (++attempt) {
    // First attempt, retry.
    case 1:
      dump("\nAttempting retry\n");
      return 0;
    // Second attempt, cancel.
    case 2:
      dump("\nCancelling login attempt\n");
      return 1;
    default:
      do_throw("unexpected attempt number " + attempt);
      return 1;
  }
}

add_task(async function () {
  function createHandler(d) {
    var handler = new SMTP_RFC2821_handler(d);
    // Username needs to match the login information stored in the signons json
    // file.
    handler.kUsername = kUsername;
    handler.kPassword = kValidPassword;
    handler.kAuthRequired = true;
    return handler;
  }
  server = setupServerDaemon(createHandler);

  // Prepare files for passwords (generated by a script in bug 1018624).
  await setupForPassword("signons-mailnews1.8.json");

  registerAlertTestUtils();

  // Test file
  var testFile = do_get_file("data/message1.eml");

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();

  // Start the fake SMTP server. The server's socket type defaults to
  // Ci.nsMsgSocketType.plain, so no need to set it.
  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
  var identity = getSmtpIdentity(kIdentityMail, smtpServer);

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // This time with auth
    test = "Auth sendMailMessage";

    smtpServer.authMethod = Ci.nsMsgAuthMethod.passwordCleartext;
    smtpServer.username = kUsername;

    dump("Send\n");

    const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
      .createInstance(Ci.nsIMsgCompUtils)
      .msgGenerateMessageId(identity, null);

    smtpServer.sendMailMessage(
      testFile,
      MailServices.headerParser.parseEncodedHeaderW(kTo),
      [],
      identity,
      kSender,
      null,
      null,
      false,
      messageId,
      null
    );

    server.performTest();

    dump("End Send\n");

    Assert.equal(attempt, 2);

    // Check that we haven't forgetton the login even though we've retried and cancelled.
    const logins = Services.logins.findLogins(
      "smtp://localhost",
      null,
      "smtp://localhost"
    );

    Assert.equal(logins.length, 1);
    Assert.equal(logins[0].username, kUsername);
    Assert.equal(logins[0].password, kInvalidPassword);
  } catch (e) {
    do_throw(e);
  } finally {
    server.stop();

    var thread = Services.tm.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
});
