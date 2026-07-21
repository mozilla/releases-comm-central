/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * When an encrypted message is displayed, its URI is remembered.
 * When the user navigates away, the entry must be forgotten again,
 * even when the message can no longer be resolved to its necko URL.
 * Not forgetting would cause the URL entry to be kept, and could
 * wrongly cause an unrelated message to be treated as encrypted.
 */

"use strict";

const { be_in_folder, get_about_message, select_click_row } =
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

let account;
let folder;

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    new FileUtils.File(getTestFilePath("data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Bob.p12")),
    "nss"
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("data/Alice.p12")),
    "nss"
  );

  // A dedicated account that can be removed while the message is displayed.
  account = MailServices.accounts.createAccount();
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "bob",
    "example.com",
    "pop3"
  );
  const identity = MailServices.accounts.createIdentity();
  identity.email = "bob@example.com";
  account.addIdentity(identity);

  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder = rootFolder.createLocalSubfolder("Encrypted");

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

  registerCleanupFunction(function () {
    if (MailServices.accounts.accounts.includes(account)) {
      MailServices.accounts.removeAccount(account, true);
    }
    SmimeUtils.removeCertificates(["NSS Test CA (RSA)", "Bob", "Alice"]);
  });
});

add_task(async function test_encryptedUriForgottenWhenAccountRemoved() {
  await be_in_folder(folder);
  await select_click_row(0);

  const aboutMessage = get_about_message();
  await TestUtils.waitForCondition(
    () => aboutMessage.gMyLastEncryptedURI,
    "the message should be processed"
  );

  // Displaying the decrypted message registers both the message URI and the
  // corresponding necko URL.
  const messageUri = aboutMessage.gMyLastEncryptedURI;
  const neckoUri = MailServices.neckoURLForMessageURI(messageUri);
  await TestUtils.waitForCondition(
    () => gEncryptedURIService.isEncrypted(neckoUri),
    "the displayed encrypted message should be registered with the service"
  );
  Assert.ok(
    gEncryptedURIService.isEncrypted(messageUri),
    "the message URI should be registered as encrypted"
  );

  // Remove the account, so the message URI can no longer be resolved to its
  // necko URL.
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

  // The message-header sink forgets the remembered URIs when navigating away.
  // Ensure the necko URL was forgotten, too.
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
