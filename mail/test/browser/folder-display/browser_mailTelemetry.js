/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Test telemetry related to secure mails (signed, encrypted).
 */

const { be_in_folder, create_folder, select_click_row } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { add_message_to_folder, create_message } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { OpenPGPTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mail/OpenPGPTestUtils.sys.mjs"
);
const { SmimeUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/SmimeUtils.sys.mjs"
);
const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

add_setup(async function () {
  SmimeUtils.ensureNSS();
  SmimeUtils.loadPEMCertificate(
    new FileUtils.File(getTestFilePath("../smime/data/TestCA.pem")),
    Ci.nsIX509Cert.CA_CERT
  );
  SmimeUtils.loadCertificateAndKey(
    new FileUtils.File(getTestFilePath("../smime/data/Bob.p12")),
    "nss"
  );

  await OpenPGPTestUtils.importPrivateKey(
    window,
    new FileUtils.File(
      getTestFilePath(
        "../openpgp/data/keys/alice@openpgp.example-0xf231550c4f47e38e-secret.asc"
      )
    )
  );

  registerCleanupFunction(async function () {
    const certDB = Cc["@mozilla.org/security/x509certdb;1"].getService(
      Ci.nsIX509CertDB
    );
    for (const cert of certDB.getCerts()) {
      if (cert.commonName == "NSS Test CA (RSA)" || cert.commonName == "Bob") {
        certDB.deleteCertificate(cert);
      }
    }
    await OpenPGPTestUtils.removeKeyById("0xf231550c4f47e38e", true);
  });
});

/**
 * Check that we're counting secure mails read, with the correct combined status,
 * and only once per message.
 */
add_task(async function test_secure_mails_read() {
  Services.fog.testResetFOG();

  const NUM_PLAIN_MAILS = 2;
  const headers = { from: "alice@t1.example.com", to: "bob@t2.example.net" };
  const folder = await create_folder("secure-mail");
  const tabmail = document.getElementById("tabmail");

  for (let i = 0; i < NUM_PLAIN_MAILS; i++) {
    await add_message_to_folder(
      [folder],
      create_message({ clobberHeaders: headers })
    );
  }

  // Triples of [eml file path, expected security technology, {is_signed, is_encrypted}].
  const secureMessages = [
    [
      "../smime/data/alice.sig.SHA256.opaque.eml",
      "S/MIME",
      { is_signed: true, is_encrypted: false },
    ],
    [
      "../smime/data/alice.env.eml",
      "S/MIME",
      { is_signed: false, is_encrypted: true },
    ],
    [
      "../smime/data/alice.sig.SHA256.opaque.env.eml",
      "S/MIME",
      { is_signed: true, is_encrypted: true },
    ],
    [
      "../openpgp/data/eml/alice-signed.eml",
      "OpenPGP",
      { is_signed: true, is_encrypted: false },
    ],
    [
      "../openpgp/data/eml/encrypted-to-alice-as-hidden-recipient.eml",
      "OpenPGP",
      { is_signed: false, is_encrypted: true },
    ],
    [
      "../openpgp/data/eml/signed-by-0x3099ff1238852b9f-encrypted-to-0xf231550c4f47e38e.eml",
      "OpenPGP",
      { is_signed: true, is_encrypted: true },
    ],
  ];

  for (const [msgFile] of secureMessages) {
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

  const NUM_SECURE_MAILS = secureMessages.length;
  const TOTAL_MAILS = NUM_PLAIN_MAILS + NUM_SECURE_MAILS;

  for (let i = 0; i < TOTAL_MAILS; i++) {
    await be_in_folder(folder);
    // Plain messages use MsgLoaded; secure messages use SecureMailLoaded.
    const isSecure = i < NUM_SECURE_MAILS;
    const eventName = isSecure ? "SecureMailLoaded" : "MsgLoaded";
    const win = tabmail.currentTabInfo.chromeBrowser.contentWindow;
    const eventPromise = new Promise(resolve =>
      win.addEventListener(eventName, resolve, { once: true })
    );
    info(`Selecting message at index ${i}`);
    await select_click_row(i);
    info(`Awaiting ${eventName} event for message at index ${i}`);
    await eventPromise;
    info(`Seen ${eventName} event for message at index ${i}`);
  }

  // Verify that each secure message produced exactly one telemetry event with
  // the expected security, is_signed, and is_encrypted fields.
  const events = Glean.mail.secureMailLoaded.testGetValue();
  Assert.equal(
    events.length,
    NUM_SECURE_MAILS,
    "should have one telemetry event per secure message"
  );
  for (const [, security, { is_signed, is_encrypted }] of secureMessages) {
    Assert.equal(
      events.filter(
        e =>
          e.extra.security == security &&
          e.extra.is_signed == String(is_signed) &&
          e.extra.is_encrypted == String(is_encrypted)
      ).length,
      1,
      `whould have one event for ${security} signed=${is_signed} encrypted=${is_encrypted}`
    );
  }
  folder.deleteSelf(null);
});
