/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to secure mails read.
 */

const {
  create_folder,
  be_in_folder,
  create_message,
  add_message_to_folder,
  select_click_row,
  smimeUtils_loadPEMCertificate,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(async function () {
  SmimeUtils.ensureNSS();
  smimeUtils_loadPEMCertificate(
    new FileUtils.File(getTestFilePath("../smime/data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("../smime/data/Bob.p12")),
    "nss"
  );

  // Set up the alice's private key.
  await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../openpgp/data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );
});

/**
 * Check that we're counting secure mails read.
 */
add_task(async function test_secure_mails_read() {
  Services.fog.testResetFOG();

  const NUM_PLAIN_MAILS = 4;
  const headers = { from: "alice@t1.example.com", to: "bob@t2.example.net" };
  const folder = await create_folder("secure-mail");

  const tabmail = document.getElementById("tabmail");

  for (let i = 0; i < NUM_PLAIN_MAILS; i++) {
    await add_message_to_folder(
      [folder],
      create_message({
        clobberHeaders: headers,
      })
    );
  }

  const smimeFiles = [
    "../smime/data/alice.sig.SHA256.opaque.env.eml",
    "../smime/data/alice.dsig.SHA256.multipart.env.eml",
  ];
  const openpgpFiles = [
    "../openpgp/data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml",
  ];
  const NUM_SECURE_MAILS = smimeFiles.length + openpgpFiles.length;

  // Copy over all the openpgp/smime mails into the folder.
  for (const msgFile of smimeFiles.concat(openpgpFiles)) {
    const theFile = new FileUtils.File(getTestFilePath(msgFile));
    const copyListener = new PromiseTestUtils.PromiseCopyListener();
    MailServices.copy.copyFileMessage(
      theFile,
      folder,
      null,
      false,
      0,
      "",
      copyListener,
      null
    );
    await copyListener.promise;
  }

  // Selecting all added mails multiple times should not change read statistics.
  for (let run = 1; run < 3; run++) {
    info(`Checking security; run=#${run}`);
    for (let i = 0; i < NUM_SECURE_MAILS + NUM_PLAIN_MAILS; i++) {
      await be_in_folder(folder);
      const eventName =
        i < NUM_SECURE_MAILS ? "MsgSecurityTelemetryProcessed" : "MsgLoaded";
      const win = tabmail.currentTabInfo.chromeBrowser.contentWindow;
      const eventPromise = new Promise(resolve =>
        win.addEventListener(eventName, resolve, { once: true })
      );
      info(`Selecting message at index ${i}`);
      await select_click_row(i);
      info(`Awaiting ${eventName} event for message at index ${i}`);
      const event = await eventPromise;
      info(`Seen ${eventName} event for message at index ${i}`);

      // Check if telemetry for encrypted messages are correctly skipped on the
      // additional runs.
      if (i < NUM_SECURE_MAILS) {
        const { skipped } = event.detail;
        if (run == 1) {
          Assert.equal(
            false,
            skipped,
            `Telemetry data for the first run should not be skipped`
          );
        } else {
          Assert.equal(
            true,
            skipped,
            `Telemetry data for additional runs should be skipped`
          );
        }
      }
    }

    const events = Glean.mail.mailsReadSecure.testGetValue();
    Assert.equal(
      events.filter(
        e => e.extra.security == "S/MIME" && e.extra.is_encrypted == "true"
      )?.length,
      smimeFiles.length,
      `Count of S/MIME encrypted mails read should be correct in run ${run}`
    );
    Assert.equal(
      events.filter(
        e => e.extra.security == "OpenPGP" && e.extra.is_encrypted == "true"
      )?.length,
      openpgpFiles.length,
      `Count of OpenPGP encrypted mails read should be correct in run ${run}`
    );
  }
});

var smimeMessage = [
  "MIAGCSqGSIb3DQEHA6CAMIACAQAxggGFMIIBgQIBADBpMGQxCzAJBgNVBAYTAlVT",
  "MRMwEQYDVQQIEwpDYWxpZm9ybmlhMRYwFAYDVQQHEw1Nb3VudGFpbiBWaWV3MRIw",
  "EAYDVQQKEwlCT0dVUyBOU1MxFDASBgNVBAMTC05TUyBUZXN0IENBAgEoMA0GCSqG",
  "SIb3DQEBAQUABIIBAByaXGnoQAgRiPjvcpotJWBQwXjAxYldgMaT/hEX0Hlnas6m",
  "OcBIOJLB9CHhmBOSo/yryDOnRcl9l1cQYzSEpExYSGoVzPCpPOLKw5C/A+6NFzpe",
  "44EUX5/gVbVeQ4fl2dOB3NbW5Cnx3Js7O1MFr8UPFOh31TBhvWjOMl+3CkMWndUi",
  "G4C/srgdeuQRdKJcWoROtBjQuibVHfn0TcA7olIj8ysmJoTT3Irx625Sh5mDDVbJ",
  "UyR2WWqw6wPAaCS2urUXtYrEuxsr7EmdcZc0P6oikzf/KoMvzBWBmWJXad1QSdeO",
  "s5Bk2MYKXoM9Iqddr/n9mvg4jJNnFMzG0cFKCAgwgAYJKoZIhvcNAQcBMB0GCWCG",
  "SAFlAwQBAgQQ2QrTbolonzr0vAfmGH2nJ6CABIGQKA2mKyOQShspbeDIf/QlYHg+",
  "YbiqdhlENHHM5V5rICjM5LFzLME0TERDJGi8tATlqp3rFOswFDGiymK6XZrpQZiW",
  "TBTEa2E519Mw86NEJ1d/iy4aLpPjATH2rhZLm3dix42mFI5ToszGNu9VuDWDiV4S",
  "sA798v71TaSlFwh9C3VwODQ8lWwyci4aD3wdxevGBBC3fYMuEns+NIQhqpzlUADX",
  "AAAAAAAAAAAAAA==",
].join("\n");
