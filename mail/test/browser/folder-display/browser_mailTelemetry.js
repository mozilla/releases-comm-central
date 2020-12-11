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
let { TelemetryTestUtils } = ChromeUtils.import(
  "resource://testing-common/TelemetryTestUtils.jsm"
);

/**
 * Check that we're counting secure mails read.
 */
add_task(async function test_secure_mails_read() {
  Services.telemetry.clearScalars();

  const NUM_PLAIN_MAILS = 4;
  const NUM_SMIME_MAILS = 2;
  const NUM_OPENPGP_MAILS = 3;
  let headers = "from: alice@t1.example.com\r\nto: bob@t2.example.net\r\n";
  let folder = create_folder("secure-mail");

  // normal message should not be counted
  for (let i = 0; i < NUM_PLAIN_MAILS; i++) {
    add_message_to_folder(
      folder,
      create_message({
        clobberHeaders: headers,
      })
    );
  }
  for (let i = 0; i < NUM_SMIME_MAILS; i++) {
    add_message_to_folder(
      folder,
      create_encrypted_smime_message({
        clobberHeaders: headers,
      })
    );
  }
  for (let i = 0; i < NUM_OPENPGP_MAILS; i++) {
    add_message_to_folder(
      folder,
      create_encrypted_openpgp_message({
        clobberHeaders: headers,
      })
    );
  }

  // Select (read) all added mails.
  be_in_folder(folder);
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
