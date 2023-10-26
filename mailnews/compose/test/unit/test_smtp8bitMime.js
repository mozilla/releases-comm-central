/**
 * 8BITMIME tests for SMTP.
 *
 * This test verifies that 8BITMIME is sent to the server only if the server
 * advertises it AND if mail.strictly_mime doesn't force us to send 7bit.
 * It does not check the data of the message on either side of the link.
 */
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

var server;

var kIdentityMail = "identity@foo.invalid";
var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";

// aStrictMime: Test if mail.strictly_mime omits the BODY=8BITMIME attribute.
// aServer8bit: Test if BODY=8BITMIME is only sent if advertised by the server.

async function test_8bitmime(aStrictMime, aServer8bit) {
  // Test file
  var testFile = do_get_file("data/message1.eml");

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();

  server.start();
  var smtpServer = getBasicSmtpServer(server.port);
  var identity = getSmtpIdentity(kIdentityMail, smtpServer);

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    test =
      "Strictly MIME" +
      (aStrictMime ? "on (7bit" : "off (8bit") +
      ", 8BITMIME " +
      (aServer8bit ? "" : "not ") +
      "advertised)";

    Services.prefs.setBoolPref("mail.strictly_mime", aStrictMime);

    const urlListener = new PromiseTestUtils.PromiseUrlListener();
    MailServices.smtp.sendMailMessage(
      testFile,
      kTo,
      identity,
      kSender,
      null,
      urlListener,
      null,
      null,
      false,
      "",
      {},
      {}
    );

    await urlListener.promise;

    var transaction = server.playTransaction();
    do_check_transaction(transaction, [
      "EHLO test",
      "MAIL FROM:<" +
        kSender +
        (!aStrictMime && aServer8bit
          ? "> BODY=8BITMIME SIZE=159"
          : "> SIZE=159"),
      "RCPT TO:<" + kTo + ">",
      "DATA",
    ]);

    server.resetTest();
  } catch (e) {
    do_throw(e);
  } finally {
    server.stop();

    var thread = gThreadManager.currentThread;
    while (thread.hasPendingEvents()) {
      thread.processNextEvent(true);
    }
  }
}

add_task(async function run() {
  // The default SMTP server advertises 8BITMIME capability.
  server = setupServerDaemon();
  await test_8bitmime(true, true);
  await test_8bitmime(false, true);

  // Now we need a server which does not advertise 8BITMIME capability.
  function createHandler(d) {
    var handler = new SMTP_RFC2821_handler(d);
    handler.kCapabilities = ["SIZE"];
    return handler;
  }
  server = setupServerDaemon(createHandler);
  await test_8bitmime(true, false);
  await test_8bitmime(false, false);
});
