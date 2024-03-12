/**
 * Authentication tests for SMTP.
 *
 * Test code <copied from="test_pop3AuthMethods.js">
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var server;
var kAuthSchemes;
var smtpServer;
var testFile;
var identity;

var kUsername = "fred";
var kPassword = "wilma";
var kIdentityMail = "identity@foo.invalid";
var kSender = "from@foo.invalid";
var kTo = "to@foo.invalid";
var MAILFROM = "MAIL FROM:<" + kSender + "> BODY=8BITMIME SIZE=159";
var RCPTTO = "RCPT TO:<" + kTo + ">";
var AUTHPLAIN = "AUTH PLAIN " + AuthPLAIN.encodeLine(kUsername, kPassword);

var tests = [
  {
    title:
      "Cleartext password, with server supporting AUTH PLAIN, LOGIN, and CRAM",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: ["PLAIN", "LOGIN", "CRAM-MD5"],
    expectSuccess: true,
    transaction: ["EHLO test", AUTHPLAIN, MAILFROM, RCPTTO, "DATA"],
  },
  {
    title: "Cleartext password, with server only supporting AUTH LOGIN",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordCleartext,
    serverAuthMethods: ["LOGIN"],
    expectSuccess: true,
    transaction: ["EHLO test", "AUTH LOGIN", MAILFROM, RCPTTO, "DATA"],
  },
  {
    title:
      "Encrypted password, with server supporting AUTH PLAIN, LOGIN and CRAM",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    serverAuthMethods: ["PLAIN", "LOGIN", "CRAM-MD5"],
    expectSuccess: true,
    transaction: ["EHLO test", "AUTH CRAM-MD5", MAILFROM, RCPTTO, "DATA"],
  },
  {
    title:
      "Encrypted password, with server only supporting AUTH PLAIN (must fail)",
    clientAuthMethod: Ci.nsMsgAuthMethod.passwordEncrypted,
    serverAuthMethods: ["PLAIN"],
    expectSuccess: false,
    transaction: ["EHLO test"],
  },
  {
    title:
      "Any secure method, with server supporting AUTH PLAIN, LOGIN and CRAM",
    clientAuthMethod: Ci.nsMsgAuthMethod.secure,
    serverAuthMethods: ["PLAIN", "LOGIN", "CRAM-MD5"],
    expectSuccess: true,
    transaction: ["EHLO test", "AUTH CRAM-MD5", MAILFROM, RCPTTO, "DATA"],
  },
  {
    title:
      "Any secure method, with server only supporting AUTH PLAIN (must fail)",
    clientAuthMethod: Ci.nsMsgAuthMethod.secure,
    serverAuthMethods: ["PLAIN"],
    expectSuccess: false,
    transaction: ["EHLO test"],
  },
];

function nextTest() {
  if (tests.length == 0) {
    // this is sync, so we run into endTest() at the end of run_test() now
    return;
  }
  server.resetTest();

  var curTest = tests.shift();
  test = curTest.title;
  dump("NEXT test: " + curTest.title + "\n");

  // Adapt to curTest
  kAuthSchemes = curTest.serverAuthMethods;
  smtpServer.authMethod = curTest.clientAuthMethod;

  // Run test
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
  let resolved = false;
  urlListener.promise.catch(e => {}).finally(() => (resolved = true));
  Services.tm.spinEventLoopUntil("wait for sending", () => resolved);

  do_check_transaction(server.playTransaction(), curTest.transaction);

  smtpServer.closeCachedConnections();
  nextTest();
}

function run_test() {
  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    function createHandler(d) {
      var handler = new SMTP_RFC2821_handler(d);
      handler.kUsername = kUsername;
      handler.kPassword = kPassword;
      handler.kAuthRequired = true;
      handler.kAuthSchemes = kAuthSchemes;
      return handler;
    }
    server = setupServerDaemon(createHandler);
    dump("AUTH PLAIN = " + AUTHPLAIN + "\n");
    server.start();

    localAccountUtils.loadLocalMailAccount();
    smtpServer = getBasicSmtpServer(server.port);
    smtpServer.socketType = Ci.nsMsgSocketType.plain;
    smtpServer.username = kUsername;
    smtpServer.password = kPassword;
    identity = getSmtpIdentity(kIdentityMail, smtpServer);

    testFile = do_get_file("data/message1.eml");

    nextTest();
  } catch (e) {
    do_throw(e);
  } finally {
    endTest();
  }
}

function endTest() {
  dump("endTest()\n");
  server.stop();

  dump("emptying event loop\n");
  var thread = Services.tm.currentThread;
  while (thread.hasPendingEvents()) {
    dump("next event\n");
    thread.processNextEvent(true);
  }
}
