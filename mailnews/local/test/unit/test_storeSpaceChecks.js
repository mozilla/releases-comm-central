/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const bundle = Services.strings.createBundle(
  "chrome://messenger/locale/messenger.properties"
);
const alerts = [];

add_setup(function () {
  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", true);
  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
    onAlert(message) {
      alerts.push(message);
      return true;
    },
  };
  MailServices.mailSession.addUserFeedbackListener(listener);
  registerCleanupFunction(() => {
    MailServices.mailSession.removeUserFeedbackListener(listener);
    Services.prefs.clearUserPref("mailnews.allowMboxOver4GB");
  });
});

/**
 * Checks available space, filesystem errors, and disk-full alerts for a store.
 *
 * @param {string} storeID - The contract ID of the message store to test.
 */
function checkStoreSpace(storeID) {
  localAccountUtils.loadLocalMailAccount(storeID);
  const folder = localAccountUtils.rootFolder
    .createLocalSubfolder("space-check")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const store = folder.msgStore;
  const file = folder.filePath;

  alerts.length = 0;
  Assert.ok(
    store.hasSpaceAvailable(folder, 1),
    "The store should have room for a small message"
  );
  Assert.ok(
    !folder.warnIfLocalFileTooBig(null, 1),
    "The folder should allow a message when space is available"
  );
  Assert.deepEqual(alerts, [], "Available space should not trigger an alert");

  alerts.length = 0;
  file.remove(true);
  try {
    let queryError;
    Assert.throws(
      () => file.diskSpaceAvailable,
      error => {
        queryError = error.result;
        return true;
      },
      "Querying the missing store should fail"
    );
    Assert.throws(
      () => store.hasSpaceAvailable(folder, 1),
      error => error.result == queryError,
      "The store should preserve the filesystem query error"
    );
    Assert.throws(
      () => folder.warnIfLocalFileTooBig(null, 1),
      error => error.result == queryError,
      "The folder should propagate the filesystem query error"
    );
    Assert.deepEqual(
      alerts,
      [],
      "A filesystem query error should not trigger a disk-space alert"
    );
  } finally {
    store.ensureLocalStore(folder);
  }

  const spaceRequested = file.diskSpaceAvailable + 1024 ** 3;
  Assert.throws(
    () => store.hasSpaceAvailable(folder, spaceRequested),
    error => error.result == Cr.NS_ERROR_FILE_NO_DEVICE_SPACE,
    "A request exceeding the usable space should report a full disk"
  );
  Assert.ok(
    folder.warnIfLocalFileTooBig(null, spaceRequested),
    "The folder should reject a message that does not fit"
  );
  Assert.deepEqual(
    alerts,
    [bundle.GetStringFromName("outOfDiskSpaceGeneric")],
    "A full disk should trigger an alert that also applies to manual copies"
  );
}

add_task(function test_mboxSpaceChecks() {
  checkStoreSpace("@mozilla.org/msgstore/berkeleystore;1");
});

add_task(function test_maildirSpaceChecks() {
  checkStoreSpace("@mozilla.org/msgstore/maildirstore;1");
});

add_task(function test_mboxSizeLimit() {
  localAccountUtils.loadLocalMailAccount(
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  const folder = localAccountUtils.rootFolder
    .createLocalSubfolder("size-limit")
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const store = folder.msgStore;
  const file = folder.filePath;

  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", false);
  try {
    alerts.length = 0;
    Assert.throws(
      () => store.hasSpaceAvailable(folder, 0xffc00000),
      error => error.result == Cr.NS_ERROR_FILE_TOO_BIG,
      "Exceeding the mbox size limit should report a full mailbox"
    );
    Assert.ok(
      folder.warnIfLocalFileTooBig(null, 0xffc00000),
      "The folder should reject a message exceeding its size limit"
    );
    const folderName = bundle.formatStringFromName("verboseFolderFormat", [
      folder.prettyPath,
      localAccountUtils.incomingServer.prettyName,
    ]);
    Assert.deepEqual(
      alerts,
      [bundle.formatStringFromName("mailboxTooLarge", [folderName])],
      "The mailbox limit should trigger a folder-size alert"
    );

    alerts.length = 0;
    file.remove(false);
    Assert.throws(
      () => folder.warnIfLocalFileTooBig(null, 1),
      error => error.result == Cr.NS_ERROR_FILE_NOT_FOUND,
      "A missing mbox should report a file error when checking its size"
    );
    Assert.deepEqual(
      alerts,
      [],
      "A missing mbox should not trigger a disk-space alert"
    );
  } finally {
    store.ensureLocalStore(folder);
    Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", true);
  }
});
