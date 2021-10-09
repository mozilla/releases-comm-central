/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test sending is aborted when alwaysSTARTTLS is set, but the server doesn't
 * support STARTTLS.
 */
add_task(async function testAbort() {
  let server = setupServerDaemon();
  server.start();

  let smtpServer = getBasicSmtpServer(server.port);
  let identity = getSmtpIdentity("identity@foo.invalid", smtpServer);
  // Set to always use STARTTLS.
  smtpServer.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;

  do_test_pending();

  let urlListener = {
    OnStartRunningUrl(url) {},
    OnStopRunningUrl(url, status) {
      // Test sending is aborted with NS_ERROR_STARTTLS_FAILED_EHLO_STARTTLS.
      Assert.equal(status, 0x80553126);
      do_test_finished();
    },
  };

  // Send a message.
  let testFile = do_get_file("data/message1.eml");
  MailServices.smtp.sendMailMessage(
    testFile,
    "to@foo.invalid",
    identity,
    "from@foo.invalid",
    null,
    urlListener,
    null,
    null,
    false,
    "",
    {},
    {}
  );
});
