/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to mails sent.
 */

const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

let server;

const kIdentityMail = "identity@foo.invalid";
const kSender = "from@foo.invalid";
const kTo = "to@foo.invalid";

const NUM_MAILS = 3;

const deliveryListener = {
  count: 0,
  OnStartRunningUrl() {},
  OnStopRunningUrl() {
    if (++this.count == NUM_MAILS) {
      const scalars = TelemetryTestUtils.getProcessScalars("parent");
      Assert.equal(
        scalars["tb.mails.sent"],
        NUM_MAILS,
        "Count of mails sent must be correct."
      );
    }
  },
};

/**
 * Check that we're counting mails sent.
 */
add_task(async function test_mails_sent() {
  Services.telemetry.clearScalars();

  server = setupServerDaemon();
  registerCleanupFunction(() => {
    server.stop();
  });

  // Test file
  const testFile = do_get_file("data/message1.eml");

  // Ensure we have at least one mail account
  localAccountUtils.loadLocalMailAccount();

  // Handle the server in a try/catch/finally loop so that we always will stop
  // the server if something fails.
  try {
    // Start the fake SMTP server
    server.start();
    const smtpServer = getBasicSmtpServer(server.port);
    const identity = getSmtpIdentity(kIdentityMail, smtpServer);

    for (let i = 0; i < NUM_MAILS; i++) {
      MailServices.smtp.sendMailMessage(
        testFile,
        kTo,
        identity,
        kSender,
        null,
        deliveryListener,
        null,
        null,
        false,
        "",
        {},
        {}
      );
    }
  } catch (e) {
    do_throw(e);
  }
});
