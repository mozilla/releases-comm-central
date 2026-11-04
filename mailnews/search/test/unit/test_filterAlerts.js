/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const globalAlerts = [];
let folderIndex = 0;

add_setup(function () {
  localAccountUtils.loadLocalMailAccount(
    "@mozilla.org/msgstore/berkeleystore;1"
  );
  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", false);
  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIMsgUserFeedbackListener"]),
    onAlert(message, serverKey, silent) {
      globalAlerts.push({ message, serverKey, silent });
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
 * Create an oversized message header to exercise the mbox size limit.
 *
 * @returns {{source: nsIMsgLocalMailFolder, target: nsIMsgFolder, header: nsIMsgDBHdr}}
 *   The message and its source and destination folders.
 */
function createOversizedMessage() {
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(`alert-source-${++folderIndex}`)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const target = root.createLocalSubfolder(`alert-target-${folderIndex}`);
  source.addMessage(
    "From: sender@example.invalid\r\n" +
      "To: recipient@example.invalid\r\n" +
      "Subject: Filter alert\r\n" +
      `Message-ID: <alert-${folderIndex}@example.invalid>\r\n` +
      "\r\nMessage body.\r\n"
  );
  const [header] = source.messages;
  header.messageSize = 0xffc00000;
  return { source, target, header };
}

/**
 * Check routing of a folder alert through a manual filter's callback.
 *
 * @param {boolean|null} handleAlert - Whether the callback handles the alert,
 *   or null to use a callback without a feedback interface.
 * @param {boolean} selection - Whether to filter selected messages.
 * @param {"oversized"|"missing"|"busy"} [failure="oversized"] - The folder error to exercise.
 */
async function checkFilterAlert(handleAlert, selection, failure = "oversized") {
  const missingMbox = failure == "missing";
  const expectedStatus = {
    oversized: Cr.NS_ERROR_FILE_TOO_BIG,
    missing: Cr.NS_ERROR_FILE_NOT_FOUND,
    busy: Cr.NS_MSG_FOLDER_BUSY,
  }[failure];
  const { source, target, header } = createOversizedMessage();
  if (missingMbox) {
    target.filePath.remove(false);
    registerCleanupFunction(() => target.msgStore.ensureLocalStore(target));
  }
  if (failure == "busy") {
    header.messageSize = 1;
    target.acquireSemaphore(source, "Filter alert test");
    registerCleanupFunction(() =>
      target.releaseSemaphore(source, "Filter alert test")
    );
  }
  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  const filter = filterList.createFilter("Oversized move");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = Ci.nsMsgFilterAction.MoveToFolder;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  globalAlerts.length = 0;
  const alerts = [];
  const finished = Promise.withResolvers();
  let completionCount = 0;
  const callback = {
    onStopOperation(status) {
      completionCount++;
      finished.resolve(status);
    },
  };
  if (handleAlert !== null) {
    callback.QueryInterface = ChromeUtils.generateQI([
      "nsIMsgOperationListener",
      "nsIMsgUserFeedbackListener",
    ]);
    callback.onAlert = (message, serverKey, silent) => {
      alerts.push({ message, serverKey, silent });
      if (handleAlert) {
        MailServices.mailSession.alertUser("Unrelated alert", serverKey, false);
      }
      return handleAlert;
    };
  }
  if (selection) {
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Manual,
      [header],
      [],
      source,
      null,
      callback
    );
  } else {
    MailServices.filters.applyFiltersToFolders(
      filterList,
      [source],
      null,
      callback
    );
  }
  const status = await finished.promise;
  Assert.equal(
    completionCount,
    1,
    "A synchronous failure should complete the run exactly once"
  );
  Assert.equal(
    status,
    expectedStatus,
    "The failed move should preserve its completion status"
  );

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const folderName = bundle.formatStringFromName("verboseFolderFormat", [
    target.prettyPath,
    target.server.prettyName,
  ]);
  const message = missingMbox
    ? new Localization(["messenger/messenger.ftl"], true).formatValueSync(
        "folder-file-not-found",
        { folder: target.prettyPath, server: target.server.prettyName }
      )
    : bundle.formatStringFromName(
        failure == "busy" ? "operationFailedFolderBusy" : "mailboxTooLarge",
        [folderName]
      );
  Assert.deepEqual(
    alerts,
    handleAlert === null
      ? []
      : [{ message, serverKey: target.server.key, silent: false }],
    "The operation callback should receive its folder alert when it supports feedback"
  );
  Assert.deepEqual(
    globalAlerts,
    handleAlert
      ? [
          {
            message: "Unrelated alert",
            serverKey: target.server.key,
            silent: false,
          },
          { message, serverKey: target.server.key, silent: true },
        ]
      : [{ message, serverKey: target.server.key, silent: false }],
    "Handled errors should reach global listeners silently, while unrelated and unhandled alerts should remain visible"
  );
  Assert.equal(
    source.getTotalMessages(false),
    1,
    "The failed move should retain the source message"
  );
  Assert.equal(
    target.getTotalMessages(false),
    0,
    "The failed move should leave the destination empty"
  );
}

add_task(async function test_handledFolderAlert() {
  await checkFilterAlert(true, false);
});

add_task(async function test_folderAlertWithoutFeedback() {
  await checkFilterAlert(null, false);
});

add_task(async function test_declinedSelectionAlert() {
  await checkFilterAlert(false, true);
});

add_task(async function test_ordinaryCopyAlert() {
  const { source, target, header } = createOversizedMessage();
  globalAlerts.length = 0;
  const listener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyMessages(
    source,
    [header],
    target,
    false,
    listener,
    null,
    false
  );
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_FILE_TOO_BIG),
    "An ordinary copy should report the mailbox size limit"
  );
  Assert.equal(
    globalAlerts.length,
    1,
    "An ordinary copy should still produce a global alert"
  );
  Assert.ok(
    !globalAlerts[0].silent,
    "An ordinary copy failure should still produce a visible alert"
  );
});

add_task(async function test_missingMboxSelectionAlert() {
  await checkFilterAlert(true, true, "missing");
});

add_task(async function test_busyFolderAlert() {
  await checkFilterAlert(true, false, "busy");
});
