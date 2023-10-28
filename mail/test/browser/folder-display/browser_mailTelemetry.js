/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to secure mails read.
 */

const {
  create_folder,
  be_in_folder,
  create_message,
  create_encrypted_smime_message,
  create_encrypted_openpgp_message,
  add_message_to_folder,
  select_click_row,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { SmimeUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/smimeUtils.jsm"
);
const { TelemetryTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TelemetryTestUtils.sys.mjs"
);

add_setup(function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("../openpgp/data/smime/Bob.p12")),
    "nss"
  );
});

/**
 * Check that we're counting secure mails read.
 */
add_task(async function test_secure_mails_read() {
  Services.telemetry.clearScalars();

  const NUM_PLAIN_MAILS = 4;
  const NUM_SMIME_MAILS = 2;
  const NUM_OPENPGP_MAILS = 3;
  const headers = { from: "alice@t1.example.com", to: "bob@t2.example.net" };
  const folder = await create_folder("secure-mail");

  // normal message should not be counted
  for (let i = 0; i < NUM_PLAIN_MAILS; i++) {
    await add_message_to_folder(
      [folder],
      create_message({
        clobberHeaders: headers,
      })
    );
  }
  for (let i = 0; i < NUM_SMIME_MAILS; i++) {
    await add_message_to_folder(
      [folder],
      create_encrypted_smime_message({
        to: "Bob@example.com",
        body: {
          body: smimeMessage,
        },
      })
    );
  }
  for (let i = 0; i < NUM_OPENPGP_MAILS; i++) {
    await add_message_to_folder(
      [folder],
      create_encrypted_openpgp_message({
        clobberHeaders: headers,
      })
    );
  }

  // Select (read) all added mails.
  await be_in_folder(folder);
  for (
    let i = 0;
    i < NUM_PLAIN_MAILS + NUM_SMIME_MAILS + NUM_OPENPGP_MAILS;
    i++
  ) {
    await select_click_row(i);
  }

  let scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.mails.read_secure"]["encrypted-smime"],
    NUM_SMIME_MAILS,
    "Count of smime encrypted mails read must be correct."
  );
  Assert.equal(
    scalars["tb.mails.read_secure"]["encrypted-openpgp"],
    NUM_OPENPGP_MAILS,
    "Count of openpgp encrypted mails read must be correct."
  );

  // Select all added mails again should not change read statistics.
  for (
    let i = 0;
    i < NUM_PLAIN_MAILS + NUM_SMIME_MAILS + NUM_OPENPGP_MAILS;
    i++
  ) {
    await select_click_row(i);
  }

  scalars = TelemetryTestUtils.getProcessScalars("parent", true);
  Assert.equal(
    scalars["tb.mails.read_secure"]["encrypted-smime"],
    NUM_SMIME_MAILS,
    "Count of smime encrypted mails read must still be correct."
  );
  Assert.equal(
    scalars["tb.mails.read_secure"]["encrypted-openpgp"],
    NUM_OPENPGP_MAILS,
    "Count of openpgp encrypted mails read must still be correct."
  );
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
