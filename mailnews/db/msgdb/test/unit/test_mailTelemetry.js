/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to mails read.
 */

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

/**
 * Check that we're counting mails read.
 */
add_task(async function test_mails_read() {
  Services.telemetry.clearScalars();

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
  const scalars = TelemetryTestUtils.getProcessScalars("parent");
  Assert.equal(
    scalars["tb.mails.read"],
    NUM_MAILS,
    "Count of mails read must be correct."
  );
});
