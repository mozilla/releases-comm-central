/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Tests that SMTP over a SOCKS proxy works.

const { NetworkTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/NetworkTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const PORT = 25;
var daemon, localserver, server;

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
  server = setupServerDaemon();
  daemon = server._daemon;
  server.start();
  NetworkTestUtils.configureProxy("smtp.tinderbox.invalid", PORT, server.port);
  localserver = getBasicSmtpServer(PORT, "smtp.tinderbox.invalid");
});

add_task(async function sendMessage() {
  equal(daemon.post, undefined);
  const identity = getSmtpIdentity("test@tinderbox.invalid", localserver);
  var testFile = do_get_file("data/message1.eml");

  const messageId = Cc["@mozilla.org/messengercompose/computils;1"]
    .createInstance(Ci.nsIMsgCompUtils)
    .msgGenerateMessageId(identity, null);

  const listener = new PromiseTestUtils.PromiseMsgOutgoingListener();
  const smtpServer = MailServices.outgoingServer.getServerByIdentity(identity);
  smtpServer.sendMailMessage(
    testFile,
    MailServices.headerParser.parseEncodedHeaderW("somebody@example.org"),
    [],
    identity,
    "me@example.org",
    null,
    null,
    false,
    messageId,
    listener
  );
  await listener.promise;

  notEqual(daemon.post, "");
});

add_task(async function cleanUp() {
  NetworkTestUtils.shutdownServers();
});
