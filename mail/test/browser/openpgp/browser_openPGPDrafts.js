/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { save_compose_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const {
  open_message_from_file,
  be_in_folder,
  get_about_message,
  get_special_folder,
  select_click_row,
  open_selected_message,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

function waitForComposeWindow() {
  return BrowserTestUtils.domWindowOpened(null, async win => {
    await BrowserTestUtils.waitForEvent(win, "load");
    await BrowserTestUtils.waitForEvent(win, "focus", true);
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
add_setup(async function () {
  aliceAcct = MailServices.accounts.createAccount();
  aliceAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    "openpgp.example",
    "imap"
  );
  aliceIdentity = MailServices.accounts.createIdentity();
  aliceIdentity.email = "alice@openpgp.example";
  aliceAcct.addIdentity(aliceIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
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
  const draftsFolder = await get_special_folder(
    Ci.nsMsgFolderFlags.Drafts,
    true,
    aliceAcct.incomingServer.localFoldersServer
  );

  await be_in_folder(draftsFolder);

  // Delete the messages we saved to drafts.
  registerCleanupFunction(
    async () =>
      new Promise(resolve => {
        const msgs = [...draftsFolder.msgDatabase.enumerateMessages()];

        draftsFolder.deleteMessages(
          msgs,
          null,
          true,
          false,
          { onStopCopy: resolve },
          false
        );
      })
  );

  // Test signed-encrypted and unsigned-encrypted messages.
  const msgFiles = [
    "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml",
    "data/eml/unsigned-encrypted-to-0xf231550c4f47e38e-from-0xfbfcc82a015e7330.eml",
  ];
  let wantedRow = 0;

  for (const msg of msgFiles) {
    const msgc = await open_message_from_file(
      new FileUtils.File(getTestFilePath(msg))
    );

    const replyWindowPromise = waitForComposeWindow();
    get_about_message(msgc).document.querySelector("#hdrReplyButton").click();
    await BrowserTestUtils.closeWindow(msgc);

    const replyWindow = await replyWindowPromise;

    // Without the delay, the saving attempt that follows sometimes
    // fails. The code to save the encrypted draft fails, because
    // it finds no recipients. Maybe after opening the window,
    // some time is needed to correctly populate the reply window.
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 100));

    await save_compose_message(replyWindow);
    replyWindow.close();

    await TestUtils.waitForCondition(
      () => draftsFolder.getTotalMessages(true) > 0,
      "message saved to drafts folder"
    );

    const draftWindowPromise = waitForComposeWindow();
    await select_click_row(wantedRow);
    ++wantedRow;
    open_selected_message();

    const draftWindow = await draftWindowPromise;

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
  MailServices.accounts.removeAccount(aliceAcct);
});
