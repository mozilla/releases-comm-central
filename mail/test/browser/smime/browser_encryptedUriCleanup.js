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
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const gEncryptedURIService = Cc[
  "@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"
].getService(Ci.nsIEncryptedSMIMEURIsService);

const MSG_BODY = "This is a test message from Alice to Bob.";

let survivingFolder;
const removableAccounts = [];
let accountCounter = 0;

async function addEnvelopedMessage(folder) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFileMessage(
    new FileUtils.File(getTestFilePath("data/alice.env.eml")),
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
 * removed later), put an enveloped message in it, and display it. Returns the
 * account plus the URIs that were remembered while displaying it.
 */
async function displayEncryptedMessageInRemovableAccount() {
  accountCounter++;
  const account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    `example-${accountCounter}.test`,
    "pop3"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "bob@example.com";
  account.addIdentity(identity);
  removableAccounts.push(account);

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const folder = rootFolder.createLocalSubfolder("Encrypted");
  await addEnvelopedMessage(folder);

  await be_in_folder(folder);
  await select_click_row(0);
  const aboutMessage = get_about_message();
  await TestUtils.waitForCondition(
    () => aboutMessage.gMyLastEncryptedURI,
    "the encrypted message should be processed"
  );
  const messageUri = aboutMessage.gMyLastEncryptedURI;
  const neckoUri = MailServices.neckoURLForMessageURI(messageUri);
  await TestUtils.waitForCondition(
    () => gEncryptedURIService.isEncrypted(neckoUri),
    "the displayed encrypted message should be registered with the service"
  );
  return { account, aboutMessage, messageUri, neckoUri };
}

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    new FileUtils.File(getTestFilePath("data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  // The message is enveloped to Bob; his key is needed to decrypt it.
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Bob.p12")),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Alice.p12")),
    "nss"
  );

  survivingFolder = await create_folder("EncryptedUriCleanupSurviving");
  await addEnvelopedMessage(survivingFolder);

  registerCleanupFunction(function () {
    for (const account of removableAccounts) {
      if (MailServices.accounts.accounts.includes(account)) {
        MailServices.accounts.removeAccount(account, true);
      }
    }
    SmimeUtils.removeCertificates(["NSS Test CA (RSA)", "Bob", "Alice"]);
  });
});

/**
 * Cleanup check: after the account is removed, the remembered message URI and
 * necko URL are both forgotten - even though the necko URL can no longer be
 * derived from the (now unresolvable) message URI.
 */
add_task(async function test_entriesForgottenWhenAccountRemoved() {
  const { account, aboutMessage, messageUri, neckoUri } =
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
    aboutMessage.forgetEncryptedURI();
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
    () => getMsgBodyTxt().includes(MSG_BODY),
    "the next message must still decrypt and display after the account was removed"
  );
});
