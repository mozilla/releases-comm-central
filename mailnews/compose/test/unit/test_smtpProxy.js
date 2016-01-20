/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */
// Tests that SMTP over a SOCKS proxy works.

Components.utils.import("resource://testing-common/mailnews/NetworkTestUtils.jsm");
Components.utils.import("resource://testing-common/mailnews/PromiseTestUtils.jsm");

const PORT = 25;
var daemon, localserver, server;

add_task(function* setup() {
  server = setupServerDaemon();
  daemon = server._daemon;
  server.start();
  NetworkTestUtils.configureProxy("smtp.tinderbox.invalid", PORT, server.port);
  localserver = getBasicSmtpServer(PORT, "smtp.tinderbox.invalid");
});

let CompFields = CC("@mozilla.org/messengercompose/composefields;1",
                    Ci.nsIMsgCompFields);

add_task(function* sendMessage() {
  equal(daemon.post, undefined);
  let identity = getSmtpIdentity("test@tinderbox.invalid", localserver);
  var testFile = do_get_file("data/message1.eml");
  var urlListener = new PromiseTestUtils.PromiseUrlListener();
  MailServices.smtp.sendMailMessage(testFile, "somebody@example.org", identity,
                                    null, urlListener, null, null,
                                    false, {}, {});
  yield urlListener.promise;
  notEqual(daemon.post, "");
});

add_task(function* cleanUp() {
  NetworkTestUtils.shutdownServers();
});

function run_test() {
  localAccountUtils.loadLocalMailAccount();
  run_next_test();
}

