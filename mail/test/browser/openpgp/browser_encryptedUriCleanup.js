/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When an encrypted message is displayed, its URI is remembered by
 * gEncryptedURIService (used by the remote-content policy). That entry is
 * forgotten again when navigating away, which involves re-deriving the
 * message's necko URL. If the message can no longer be resolved (e.g. its
 * account has been removed), the cleanup must still remove the remembered entry
 * and must not throw and break the display of the next message (bug 2052976).
 *
 * Two complementary checks: one on the cleanup itself (the entries are gone),
 * and one on the user-visible symptom (the next message still displays).
 */

"use strict";

const { be_in_folder, create_folder, get_about_message, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const gEncryptedURIService = Cc[
  "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
].getService(Ci.nsIEncryptedSMIMEURIsService);

// The decrypted body of the test message.
const MSG_TEXT = "Sundays are nothing without callaloo.";

let aliceKeyId;
let survivingFolder;
const removableAccounts = [];
let accountCounter = 0;

async function addEncryptedMessage(folder) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    new FileUtils.File(
      getTestFilePath(
        "data/eml/signed-by-0xfbfcc82a015e7330-encrypted-to-0xf231550c4f47e38e.eml"
      )
    ),
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

function getMsgBodyTxt() {
  return get_about_message().getMessagePaneBrowser().contentDocument
    .documentElement.textContent;
}

/**
 * Create a dedicated account (so it, and thus the message's server, can be
 * removed later), put an encrypted message in it, and display it. Returns the
 * account, the overlay's header view, and the URIs remembered while displaying.
 */
async function displayEncryptedMessageInRemovableAccount() {
  accountCounter++;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "alice",
    `openpgp-${accountCounter}.example`,
    "pop3"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "alice@openpgp.example";
  identity.setUnicharAttribute("openpgp_key_id", aliceKeyId);
  account.addIdentity(identity);
  removableAccounts.push(account);

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const folder = rootFolder.createLocalSubfolder("Encrypted");
  await addEncryptedMessage(folder);

  await be_in_folder(folder);
  await select_click_row(0);
  const hdrView = get_about_message().Enigmail.hdrView;
  await TestUtils.waitForCondition(
    () => hdrView.lastEncryptedUri,
    "the encrypted message should be processed"
  );
  const messageUri = hdrView.lastEncryptedUri;
  const neckoUri = MailServices.neckoURLForMessageURI(messageUri);
  await TestUtils.waitForCondition(
    () => gEncryptedURIService.isEncrypted(neckoUri),
    "the displayed encrypted message should be registered with the service"
  );
  return { account, hdrView, messageUri, neckoUri };
}

add_setup(async function () {
  // Alice's (passphrase-less) private key, so the message decrypts without a
  // prompt. The message is encrypted to Alice.
  [aliceKeyId] = await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  survivingFolder = await create_folder("OpenPGPEncryptedUriCleanupSurviving");
  await addEncryptedMessage(survivingFolder);

  registerCleanupFunction(async function () {
    for (const account of removableAccounts) {
      if (MailServices.accounts.accounts.includes(account)) {
        MailServices.accounts.removeAccount(account, true);
      }
    }
    await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
  });
});

/**
 * Cleanup check: after the account is removed, the remembered message URI and
 * necko URL are both forgotten - even though the necko URL can no longer be
 * derived from the (now unresolvable) message URI.
 */
add_task(async function test_entriesForgottenWhenAccountRemoved() {
  const { account, hdrView, messageUri, neckoUri } =
    await displayEncryptedMessageInRemovableAccount();
  Assert.ok(
    gEncryptedURIService.isEncrypted(messageUri),
    "the message URI should be registered as encrypted"
  );

  MailServices.accounts.removeAccount(account, true);
  let derivable = true;
  try {
    MailServices.neckoURLForMessageURI(messageUri);
  } catch (ex) {
    derivable = false;
  }
  Assert.ok(
    !derivable,
    "the necko URL can no longer be derived from the message URI"
  );

  try {
    hdrView.forgetEncryptedMsgKey();
  } catch (ex) {}

  Assert.ok(
    !gEncryptedURIService.isEncrypted(neckoUri),
    "the necko URL entry must be cleaned up even though the account is gone"
  );
  Assert.ok(
    !gEncryptedURIService.isEncrypted(messageUri),
    "the message URI entry must be cleaned up too"
  );
});

/**
 * Symptom check: navigating to another message after the account is removed must
 * still work. Before the fix, the header sink threw while re-deriving the now
 * unresolvable necko URL, which broke display of the next message.
 */
add_task(async function test_navigatingAwayWorksAfterAccountRemoved() {
  const { account } = await displayEncryptedMessageInRemovableAccount();

  MailServices.accounts.removeAccount(account, true);

  await be_in_folder(survivingFolder);
  await select_click_row(0);
  await TestUtils.waitForCondition(
    () => getMsgBodyTxt().includes(MSG_TEXT),
    "the next message must still decrypt and display after the account was removed"
  );
});
