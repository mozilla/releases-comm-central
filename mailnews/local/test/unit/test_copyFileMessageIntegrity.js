/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const CRLF = "\r\n";

// Two well-formed sources, one with a Date: header and one without. Both reach
// the header/body separator, so both must be stored regardless of the date.
const VALID_SOURCES = {
  "a complete message":
    [
      "From: alice@example.invalid",
      "To: bob@example.invalid",
      "Subject: A complete message",
      "Date: Wed, 10 Jun 2026 12:00:00 +0000",
      "Message-ID: <complete@example.invalid>",
      "",
      "Body text.",
    ].join(CRLF) + CRLF,
  "a complete message without a Date header":
    [
      "From: alice@example.invalid",
      "To: bob@example.invalid",
      "Subject: A complete message without a Date header",
      "Message-ID: <nodate@example.invalid>",
      "",
      "Body text.",
    ].join(CRLF) + CRLF,
};

// The truncated entry carries a valid Date: but still has no header/body
// separator, proving the separator (not the date) is what decides storage.
const INCOMPLETE_SOURCES = {
  "an empty file": "",
  "a body with no headers": "Loose text with no headers at all." + CRLF,
  "headers truncated before the separator":
    [
      "From: alice@example.invalid",
      "To: bob@example.invalid",
      "Subject: Cut off mid-transfer",
      "Date: Wed, 10 Jun 2026 12:00:00 +0000",
      "Message-ID: <truncated@example.invalid>",
    ].join(CRLF) + CRLF,
};

async function writeTempFile(name, contents) {
  const file = Services.dirsvc.get("TmpD", Ci.nsIFile);
  file.append(name);
  if (file.exists()) {
    file.remove(false);
  }
  await IOUtils.writeUTF8(file.path, contents);
  return file;
}

async function copyFileInto(subName, contents) {
  const dest = localAccountUtils.rootFolder.createLocalSubfolder(subName);
  const file = await writeTempFile(`${subName}.eml`, contents);
  const listener = new PromiseTestUtils.PromiseCopyListener();
  try {
    MailServices.copy.copyFileMessage(
      file,
      dest,
      null,
      false,
      0,
      "",
      listener,
      null
    );
    await listener.promise;
  } catch (ex) {
    // A rejected copy is an acceptable outcome; only a stored phantom is not.
    info(`copyFileMessage rejected (acceptable): ${ex}`);
  }
  return dest;
}

async function withLocalAccount(store, body) {
  Services.prefs.setCharPref("mail.serverDefaultStoreContractID", store);
  localAccountUtils.loadLocalMailAccount();
  try {
    await body();
  } finally {
    localAccountUtils.clearAll();
  }
}

add_task(async function test_validSourcesAreStored() {
  for (const store of localAccountUtils.pluggableStores) {
    await withLocalAccount(store, async () => {
      for (const [description, contents] of Object.entries(VALID_SOURCES)) {
        const dest = await copyFileInto(`valid-${description}`, contents);
        Assert.equal(
          dest.getTotalMessages(false),
          1,
          `${description} is stored as exactly one message (${store})`
        );
      }
    });
  }
});

add_task(async function test_incompleteSourcesAreNotStored() {
  for (const store of localAccountUtils.pluggableStores) {
    await withLocalAccount(store, async () => {
      for (const [description, contents] of Object.entries(
        INCOMPLETE_SOURCES
      )) {
        const dest = await copyFileInto(`incomplete-${description}`, contents);
        Assert.equal(
          dest.getTotalMessages(false),
          0,
          `${description} is not a message and must not be stored (${store})`
        );
      }
    });
  }
});
