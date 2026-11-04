/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

const alerts = [];
let folderIndex = 0;
let forcedErrorFolderURI;
let forcedErrorStatus;
let forcedErrorChecks = 0;

add_setup(function () {
  const nativeStore = Cc[
    "@mozilla.org/msgstore/berkeleystore;1"
  ].createInstance(Ci.nsIMsgPluggableStore);
  const store = new Proxy(
    {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgPluggableStore"]),

      /**
       * Report a configured error for the selected destination and delegate other checks.
       *
       * @param {nsIMsgFolder} folder - The folder to check.
       * @param {number} spaceRequested - The requested space in bytes.
       * @returns {boolean} The native result for other folders.
       * @throws {nsIException} The configured error for the selected folder.
       */
      hasSpaceAvailable(folder, spaceRequested) {
        if (folder.URI == forcedErrorFolderURI) {
          forcedErrorChecks++;
          throw Components.Exception("Store check failed", forcedErrorStatus);
        }
        return nativeStore.hasSpaceAvailable(folder, spaceRequested);
      },
    },
    {
      get(target, property) {
        if (property in target) {
          return target[property];
        }
        // Native store methods require their original receiver.
        const value = nativeStore[property];
        return typeof value == "function" ? value.bind(nativeStore) : value;
      },
    }
  );
  const contract = "@mozilla.org/msgstore/test-space-failures;1";
  const mockCID = MockRegistrar.register(contract, store);
  registerCleanupFunction(() => {
    localAccountUtils.clearAll();
    MockRegistrar.unregister(mockCID);
    Services.prefs.clearUserPref("mail.serverDefaultStoreContractID");
  });
  localAccountUtils.loadLocalMailAccount(contract);
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
 * Check copy completion, filter logging, and alerts for store preflight failures.
 *
 * @param {"mailbox"|"disk"|"access-denied"|"filesystem"} failure - The store failure.
 * @param {boolean} selection - Whether to filter selected messages or a folder.
 * @param {boolean} isMove - Whether the operation should move messages.
 * @returns {Promise<void>} Resolves after checking completion, alerts, and logs.
 */
async function checkSpaceFailure(failure, selection, isMove) {
  const mailboxTooLarge = failure == "mailbox";
  const expectedStatus = {
    mailbox: Cr.NS_ERROR_FILE_TOO_BIG,
    disk: Cr.NS_ERROR_FILE_NO_DEVICE_SPACE,
    "access-denied": Cr.NS_ERROR_FILE_ACCESS_DENIED,
    filesystem: Cr.NS_ERROR_FILE_CORRUPTED,
  }[failure];
  const errorCode = `0x${expectedStatus.toString(16).toUpperCase().padStart(8, "0")}`;
  Services.prefs.setBoolPref("mailnews.allowMboxOver4GB", !mailboxTooLarge);
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(`space-source-${++folderIndex}`)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const target = root.createLocalSubfolder(`space-target-${folderIndex}`);

  const messageCount = mailboxTooLarge ? 1 : 2;
  for (let index = 0; index < messageCount; index++) {
    source.addMessage(
      "From: sender@example.invalid\r\n" +
        "To: recipient@example.invalid\r\n" +
        "Subject: Space failure\r\n" +
        `Message-ID: <space-${folderIndex}-${index}@example.invalid>\r\n` +
        "\r\nMessage body.\r\n"
    );
  }
  const messages = [...source.messages];
  const originalContent = await IOUtils.readUTF8(source.filePath.path);
  if (mailboxTooLarge) {
    // Exercise the native mbox limit without creating a multi-gigabyte message.
    messages[0].messageSize = 0xffc00000;
  }
  forcedErrorFolderURI = mailboxTooLarge ? null : target.URI;
  forcedErrorStatus = expectedStatus;
  forcedErrorChecks = 0;

  alerts.length = 0;
  let copyCompletions = 0;
  const copyListener = new PromiseTestUtils.PromiseCopyListener({
    onStopCopy() {
      copyCompletions++;
    },
  });
  MailServices.copy.copyMessages(
    source,
    messages,
    target,
    isMove,
    copyListener,
    null,
    false
  );
  await Assert.rejects(
    copyListener.promise,
    new RegExp(expectedStatus),
    "The copy listener should receive the specific preflight failure"
  );
  Assert.equal(copyCompletions, 1, "The copy should complete exactly once");

  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  filterList.clearLog();
  filterList.loggingEnabled = true;
  registerCleanupFunction(() => {
    filterList.loggingEnabled = false;
  });
  const filter = filterList.createFilter("Space failure");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = isMove
    ? Ci.nsMsgFilterAction.MoveToFolder
    : Ci.nsMsgFilterAction.CopyToFolder;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);
  let filterCompletions = 0;
  const listener = new PromiseTestUtils.PromiseMsgOperationListener({
    onStopOperation() {
      filterCompletions++;
    },
  });
  if (selection) {
    MailServices.filters.applyFilters(
      Ci.nsMsgFilterType.Manual,
      messages,
      [],
      source,
      null,
      listener
    );
  } else {
    MailServices.filters.applyFiltersToFolders(
      filterList,
      [source],
      null,
      listener
    );
  }
  await Assert.rejects(
    listener.promise,
    new RegExp(expectedStatus),
    "The filter listener should receive the specific preflight failure"
  );
  Assert.equal(filterCompletions, 1, "The filter should complete exactly once");
  Assert.equal(
    forcedErrorChecks,
    mailboxTooLarge ? 0 : 2,
    "Only injected failures should use the controlled response for both operations"
  );

  const bundle = Services.strings.createBundle(
    "chrome://messenger/locale/messenger.properties"
  );
  const folderName = bundle.formatStringFromName("verboseFolderFormat", [
    target.prettyPath,
    target.server.prettyName,
  ]);
  let expectedAlert;
  if (mailboxTooLarge) {
    expectedAlert = bundle.formatStringFromName("mailboxTooLarge", [
      folderName,
    ]);
  } else if (failure == "disk") {
    expectedAlert = bundle.GetStringFromName("outOfDiskSpaceGeneric");
  } else {
    expectedAlert = new Localization(
      ["messenger/messenger.ftl"],
      true
    ).formatValueSync(
      failure == "access-denied"
        ? "folder-file-access-denied"
        : "folder-file-error",
      { folder: target.prettyPath, server: target.server.prettyName, errorCode }
    );
  }
  Assert.deepEqual(
    alerts,
    [expectedAlert, expectedAlert],
    "Each operation should retain its specific preflight alert"
  );

  filterList.loggingEnabled = false;
  const logFile = Services.io
    .newURI(filterList.logURL)
    .QueryInterface(Ci.nsIFileURL).file;
  const log = await IOUtils.readUTF8(logFile.path);
  const entries = [
    ...new DOMParser().parseFromString(log, "text/html").querySelectorAll("p"),
  ];
  Assert.equal(
    entries.length,
    1,
    "Preflight rejection should produce one batch failure entry"
  );
  Assert.ok(
    entries[0].textContent.includes(errorCode),
    "The batch log should retain the specific preflight error code"
  );
  Assert.ok(
    entries[0].textContent.includes(target.URI),
    "The batch failure should identify the destination"
  );
  Assert.ok(
    entries[0].textContent.includes(messages[0].messageId),
    "The batch failure should identify the requested messages"
  );
  Assert.equal(
    source.getTotalMessages(false),
    messageCount,
    "Preflight rejection should retain every source message"
  );
  Assert.equal(
    target.getTotalMessages(false),
    0,
    "Preflight rejection should leave the destination empty"
  );
  const content = await IOUtils.readUTF8(source.filePath.path);
  Assert.equal(
    content,
    originalContent,
    "Preflight rejection should preserve the source message bodies"
  );
}

add_task(async function test_copySelectionSpaceFailures() {
  await checkSpaceFailure("mailbox", true, false);
});

add_task(async function test_moveSelectionSpaceFailures() {
  await checkSpaceFailure("disk", true, true);
});

add_task(async function test_copyFolderSpaceFailures() {
  await checkSpaceFailure("disk", false, false);
});

add_task(async function test_moveFolderSpaceFailures() {
  await checkSpaceFailure("mailbox", false, true);
});

add_task(async function test_accessDeniedAlert() {
  await checkSpaceFailure("access-denied", true, false);
});

add_task(async function test_genericFilesystemAlert() {
  await checkSpaceFailure("filesystem", false, true);
});
