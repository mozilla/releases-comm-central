/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to secure mails read.
 */

let {
  create_folder,
  be_in_folder,
  create_message,
  create_encrypted_smime_message,
  create_encrypted_openpgp_message,
  add_message_to_folder,
  select_click_row,
  assert_selected_and_displayed,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
let { SmimeUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/smimeUtils.jsm"
);
let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);

add_setup(function() {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("../openpgp/data/smime/Bob.p12"))
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
  let headers = { from: "alice@t1.example.com", to: "bob@t2.example.net" };
  let folder = await create_folder("secure-mail");

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
    select_click_row(i);
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
    select_click_row(i);
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
  "SIb3DQEBAQUABIIBAGgZHxKKXrR3tMqJkkADZoYNqIJJXOXmrmXHHV830/RUW6gU",
  "V3NNwsnl4L99kygitGe4X4gnjqPHs0FNxEL1DfxwyySfkcQge5BktBcBk448TUzz",
  "WrS19L4UAfJkalu+stezAO0L4hs/kYaSrvFhuQ6vxfixHxGydwX008Ps16aua5zI",
  "EYgiSoXxAUajtEh6phqAcC+FMhObZyEZXQKSgs3X0nYTQib8I6L7dWquYoQMVfsp",
  "wpERLhEqtTghEW/CT8z6gQajkEgV9tFM0f2gLSH1672LRlHVAbk4ZceBmvxa02sr",
  "PHW8gffMVWF6RX05rKzVnxm9IzJjHdWblc7SPJowgAYJKoZIhvcNAQcBMB0GCWCG",
  "SAFlAwQBAgQQSSldfdzyN/cUjHJO2EXrGKCABIGglkOJOh25hjmvYeJtxlyih1CC",
  "1tlMGVnct6Zuiy1y7jVIsJRSRFXsA4TQyFICPe4aq7ArNzT0Bizj8mzDXmJQNh5v",
  "5bwmMwMrvW5p9NMasuFIaIqbvmVnLC5c/DcJoplx1eOG0OOfXevGLrepLzF9Yeya",
  "TFli/xvLNSwTA+xSsFCxets7vknAXFBSqnRQP2fk2bnihfHdBh6JYIFKWStJlwQQ",
  "Y0jCR94CgCHcP6Yi/0bwKQAAAAAAAAAAAAA=",
].join("\n");
