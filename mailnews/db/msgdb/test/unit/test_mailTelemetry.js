/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to mails read.
 */

add_setup(function test_setup() {
  // FOG needs a profile directory to put its data in.
  do_get_profile();

  // FOG needs to be initialized in order for data to flow.
  Services.fog.initializeFOG();
});

/**
 * Check that we're counting mails read.
 */
add_task(async function test_mails_read() {
  Services.fog.testResetFOG();

  localAccountUtils.loadLocalMailAccount();

  const NUM_MAILS = 5;
  const headers =
    "from: alice@t1.example.com\r\n" +
    "to: bob@t2.example.net\r\n" +
    "return-path: alice@t1.example.com\r\n" +
    "Disposition-Notification-To: alice@t1.example.com\r\n";
  for (let i = 0; i < NUM_MAILS; i++) {
    localAccountUtils.inboxFolder.addMessage(
      "From \r\n" + headers + "\r\nhello\r\n"
    );
  }
  localAccountUtils.inboxFolder.markAllMessagesRead(null);
  Assert.equal(
    Glean.mail.mailsRead.testGetValue(),
    NUM_MAILS,
    "mails_read count should be correct"
  );
});
