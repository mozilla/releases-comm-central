/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const {
  open_message_from_file,
  be_in_folder,
  get_special_folder,
  select_click_row,
  open_selected_message,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
const { close_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);
const { OpenPGPTestUtils } = ChromeUtils.import(
  "resource://testing-common/mozmill/OpenPGPTestUtils.jsm"
);
const { FileUtils } = ChromeUtils.import(
  "resource://gre/modules/FileUtils.jsm"
);
const { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

function waitForComposeWindow() {
  return BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    return (
      win.document.documentURI ===
      "chrome://messenger/content/messengercompose/messengercompose.xhtml"
    );
  });
}

let aliceAcct;
let aliceIdentity;
let initialKeyIdPref = "";

/**
 * Setup a mail account with a private key and an imported public key for an
 * address we can send messages to.
 */
add_task(async function setUp() {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "imap"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  let [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  Assert.ok(id, "private key id received");

  initialKeyIdPref = aliceIdentity.getUnicharAttribute("openpgp_key_id");
  aliceIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  await OpenPGPTestUtils.importPublicKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/bob@openpgp.example-0xfbfcc82a015e7330-pub.asc"
      )
    )
  );
});

/**
 * Test the "Re:" prefix remains in the compose window when opening a draft
 * reply for an encrypted message. See bug 1661510.
 */
add_task(async function testDraftReplyToEncryptedMessageKeepsRePrefix() {
  let draftsFolder = get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true,
    aliceAcct.incomingServer.localFoldersServer
  );

  be_in_folder(draftsFolder);

  // Delete the messages we saved to drafts.
  registerCleanupFunction(
    async () =>
      new Promise(resolve => {
        let msgs = [...draftsFolder.msgDatabase.EnumerateMessages()];

        draftsFolder.deleteMessages(
          msgs,
          null,
          true,
          false,
          { OnStopCopy: resolve },
          false
        );
      })
  );

  // Test signed-encrypted and unsigned-encrypted messages.
  let msgFiles = [
    "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml",
    "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml",
  ];

  for (let msg of msgFiles) {
    let mc = await open_message_from_file(
      new FileUtils.File(getTestFilePath(msg))
    );

    let replyWindowPromise = waitForComposeWindow();
    mc.window.document.querySelector("#hdrReplyButton").click();
    close_window(mc);

    let replyWindow = await replyWindowPromise;
    await BrowserTestUtils.waitForEvent(replyWindow, "focus", true);
    replyWindow.document.querySelector("#button-save").click();
    replyWindow.close();

    await TestUtils.waitForCondition(
      () => draftsFolder.getTotalMessages(true) > 0,
      "message saved to drafts folder"
    );

    let draftWindowPromise = waitForComposeWindow();
    select_click_row(0);
    open_selected_message();

    let draftWindow = await draftWindowPromise;
    await BrowserTestUtils.waitForEvent(draftWindow, "focus", true);

    Assert.ok(
      draftWindow.document.querySelector("#msgSubject").value.startsWith("Re:"),
      "the Re: prefix is applied"
    );

    draftWindow.close();
  }
});

registerCleanupFunction(function tearDown() {
  aliceIdentity.setUnicharAttribute("openpgp_key_id", initialKeyIdPref);
  MailServices.accounts.removeIncomingServer(aliceAcct.incomingServer, true);
});
