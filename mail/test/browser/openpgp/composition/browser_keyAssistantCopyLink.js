/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests copying the source link of a collected key in the Key Assistant.
 */

"use strict";

const { be_in_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
const { open_compose_new_mail } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { CollectedKeysDB } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/CollectedKeysDB.sys.mjs"
);
const { EnigmailKey } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/key.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const RECIPIENT = "carol@example.com";
const SOURCE_URL =
  "https://example.com/.well-known/openpgpkey/hu/carol?l=carol";

let bobAcct;

add_setup(async function () {
  bobAcct = MailServices.accounts.createAccount();
  bobAcct.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "openpgp.example",
    "imap"
  );
  const bobIdentity = MailServices.accounts.createIdentity();
  bobIdentity.email = "bob@openpgp.example";
  bobAcct.addIdentity(bobIdentity);

  const [id] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../data/keys/bob@openpgp.example-0xfbfcc82a015e7330-secret.asc"
      )
    )
  );
  bobIdentity.setUnicharAttribute("openpgp_key_id", id.split("0x").join(""));

  const keyBlock = await IOUtils.readUTF8(
    getTestFilePath("../data/keys/carol@example.com-0x3099ff1238852b9f-pub.asc")
  );
  const keyList = await EnigmailKey.getKeyListFromKeyBlock(
    keyBlock,
    {},
    false,
    true,
    false,
    true
  );
  Assert.equal(keyList.length, 1, "test key should be parsed");
  const db = await CollectedKeysDB.getInstance();
  await db.storeKey(
    await db.mergeExisting(keyList[0], keyList[0].pubKey, {
      uri: SOURCE_URL,
      type: "wkd",
    })
  );

  registerCleanupFunction(async () => {
    await db.deleteKeysForEmail(RECIPIENT);
    MailServices.accounts.removeAccount(bobAcct, true);
  });
});

add_task(async function testCopySourceLink() {
  await be_in_folder(bobAcct.incomingServer.rootFolder);
  const composeWin = await open_compose_new_mail();
  const doc = composeWin.document;

  composeWin.gKeyAssistant.show([RECIPIENT], false);
  await TestUtils.waitForCondition(
    () => doc.getElementById("keyAssistant").open,
    "Key Assistant should open"
  );

  const resolveButton = await TestUtils.waitForCondition(
    () => doc.querySelector("#keysListIssues button"),
    "resolve button should be shown"
  );
  EventUtils.synthesizeMouseAtCenter(resolveButton, {}, composeWin);

  const sourceLink = await TestUtils.waitForCondition(
    () =>
      BrowserTestUtils.isVisible(doc.getElementById("resolveView")) &&
      doc.querySelector(`#resolveValidKeysList a[href="${SOURCE_URL}"]`),
    "source link should be shown"
  );
  await TestUtils.waitForCondition(
    () => sourceLink.textContent,
    "source link should be localized"
  );

  const contextMenu = doc.getElementById("keyAssistantLinkContext");
  const shownPromise = BrowserTestUtils.waitForPopupEvent(contextMenu, "shown");
  EventUtils.synthesizeMouseAtCenter(
    sourceLink,
    { type: "contextmenu" },
    composeWin
  );
  await shownPromise;

  const hiddenPromise = BrowserTestUtils.waitForPopupEvent(
    contextMenu,
    "hidden"
  );
  await SimpleTest.promiseClipboardChange(SOURCE_URL, () =>
    EventUtils.synthesizeMouseAtCenter(
      doc.getElementById("keyAssistantCopyLink"),
      {},
      composeWin
    )
  );
  await hiddenPromise;

  doc.getElementById("keyAssistant").close();
  await BrowserTestUtils.closeWindow(composeWin);
});
