/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let folderIndex = 0;

add_setup(function () {
  Services.prefs.setBoolPref("mail.suppressAlertsForTests", true);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.suppressAlertsForTests");
  });
  localAccountUtils.loadLocalMailAccount();
});

/**
 * Checks that a failed filter copy or move preserves the source and allows a retry.
 *
 * @param {number} actionType - A copy or move constant from `Ci.nsMsgFilterAction`.
 * @param {function(nsIMsgFilterList, nsIMsgFolder, nsIMsgDBHdr[],
 *   nsIMsgOperationListener): void} applyFilters - Starts a manual filter run
 *   with the supplied list, source folder, messages, and completion listener.
 */
async function checkFailedFilter(actionType, applyFilters) {
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(`source-${++folderIndex}`)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const target = root.createLocalSubfolder(`target-${folderIndex}`);
  const authors = ["sender@example.invalid", "Jörg <sender@example.invalid>"];
  const subjects = ["Filter failure", "Filter failure – 日本語 <script>&"];
  for (let index = 0; index < 2; index++) {
    const author = MailServices.mimeConverter.encodeMimePartIIStr_UTF8(
      authors[index],
      true,
      "From: ".length,
      72
    );
    const subject = MailServices.mimeConverter.encodeMimePartIIStr_UTF8(
      subjects[index],
      false,
      "Subject: ".length,
      72
    );
    source.addMessage(
      `From: ${author}\r\n` +
        "To: recipient@example.invalid\r\n" +
        `Subject: ${subject}\r\n` +
        `Message-ID: <failure-${folderIndex}-${index}@example.invalid>\r\n` +
        "\r\nMessage body.\r\n"
    );
  }
  const messages = [...source.messages];
  const originalContent = await IOUtils.readUTF8(source.filePath.path);

  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  filterList.clearLog();
  filterList.loggingEnabled = true;
  registerCleanupFunction(() => {
    filterList.loggingEnabled = false;
  });
  const filter = filterList.createFilter("Failing copy or move – テスト");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = actionType;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  const stopAction = filter.createAction();
  stopAction.type = Ci.nsMsgFilterAction.StopExecution;
  filter.appendAction(stopAction);
  filterList.insertFilterAt(0, filter);

  const formatted = filter.getLogRuleHitMessage(
    action,
    messages[1],
    Cr.NS_OK,
    ""
  );
  Assert.ok(
    formatted.includes(authors[1]) && formatted.includes(subjects[1]),
    "The formatted entry should preserve Unicode message metadata"
  );

  // A directory at the mbox path makes opening the output stream fail on all
  // platforms, without depending on file permissions or available disk space.
  const targetFile = target.filePath;
  targetFile.remove(false);
  targetFile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);
  registerCleanupFunction(() => {
    if (targetFile.isDirectory()) {
      targetFile.remove(false);
      targetFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
    }
  });

  const listener = new PromiseTestUtils.PromiseMsgOperationListener();
  let completionCount = 0;
  applyFilters(filterList, source, messages, {
    onStopOperation(status) {
      completionCount++;
      listener.onStopOperation(status);
    },
  });
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_FAILURE),
    "The filter run should report the failed copy or move"
  );
  Assert.equal(
    completionCount,
    1,
    "The filter run should report completion exactly once"
  );

  filterList.loggingEnabled = false;
  const logFile = Services.io
    .newURI(filterList.logURL)
    .QueryInterface(Ci.nsIFileURL).file;
  const log = await IOUtils.readUTF8(logFile.path);
  const logDocument = new DOMParser().parseFromString(log, "text/html");
  const entries = [...logDocument.querySelectorAll("p")].map(
    entry => entry.textContent
  );
  const failures = entries.filter(entry => entry.includes("0x80004005"));
  Assert.equal(
    failures.length,
    1,
    "The filter log should record one failure for the incomplete batch"
  );
  Assert.deepEqual(
    entries.filter(
      entry => entry.includes(target.URI) && !entry.includes("0x80004005")
    ),
    [],
    "A failed copy or move should not produce success entries"
  );
  for (const message of messages) {
    const failure = failures.find(entry => entry.includes(message.messageId));
    Assert.ok(
      failure,
      "The failure entry should identify the affected message"
    );
    Assert.ok(
      failure.includes(filter.filterName),
      "The failure entry should identify the filter"
    );
    Assert.ok(
      failure.includes(target.URI),
      "The failure entry should identify the destination"
    );
  }

  Assert.equal(
    source.getTotalMessages(false),
    messages.length,
    "The source messages should remain after the failed operation"
  );
  const content = await IOUtils.readUTF8(source.filePath.path);
  Assert.equal(
    content,
    originalContent,
    "The failed operation should preserve the source message content"
  );

  targetFile.remove(false);
  targetFile.create(Ci.nsIFile.NORMAL_FILE_TYPE, 0o600);
  Assert.equal(
    target.getTotalMessages(false),
    0,
    "The failed operation should not add a destination message"
  );

  filterList.clearLog();
  filterList.loggingEnabled = true;
  const messageIds = messages.map(message => message.messageId);
  const retryListener = new PromiseTestUtils.PromiseMsgOperationListener();
  const isMove = actionType == Ci.nsMsgFilterAction.MoveToFolder;
  applyFilters(filterList, source, messages, retryListener);
  await retryListener.promise;
  Assert.equal(
    target.getTotalMessages(false),
    messages.length,
    "A retry should succeed after restoring the destination"
  );
  Assert.equal(
    source.getTotalMessages(false),
    isMove ? 0 : messages.length,
    "Only a successful move should remove the source message"
  );

  filterList.loggingEnabled = false;
  const retryLog = await IOUtils.readUTF8(logFile.path);
  const retryDocument = new DOMParser().parseFromString(retryLog, "text/html");
  const successes = [...retryDocument.querySelectorAll("p")]
    .map(entry => entry.textContent)
    .filter(entry => entry.includes(target.URI));
  Assert.equal(
    successes.length,
    messages.length,
    "A successful copy or move should produce one entry per message"
  );
  Assert.ok(
    !/0x[0-9A-F]{8}/i.test(retryLog),
    "A successful retry should not log failures"
  );
  Assert.equal(
    retryDocument.querySelector("script"),
    null,
    "The log should escape HTML in message subjects"
  );
  for (const [index, messageId] of messageIds.entries()) {
    const success = successes.find(entry => entry.includes(messageId));
    Assert.ok(
      success,
      "The success entry should identify the affected message"
    );
    Assert.ok(
      success.includes(filter.filterName),
      "The success entry should identify the filter"
    );
    Assert.ok(
      success.includes(authors[index]) && success.includes(subjects[index]),
      "The success entry should preserve the message author and subject"
    );
  }
}

function applyFiltersToMessages(filterList, source, messages, listener) {
  MailServices.filters.applyFilters(
    Ci.nsMsgFilterType.Manual,
    messages,
    [],
    source,
    null,
    listener
  );
}

function applyFiltersToFolder(filterList, source, messages, listener) {
  MailServices.filters.applyFiltersToFolders(
    filterList,
    [source],
    null,
    listener
  );
}

add_task(async function test_copyMessagesFailure() {
  await checkFailedFilter(
    Ci.nsMsgFilterAction.CopyToFolder,
    applyFiltersToMessages
  );
});

add_task(async function test_moveMessagesFailure() {
  await checkFailedFilter(
    Ci.nsMsgFilterAction.MoveToFolder,
    applyFiltersToMessages
  );
});

add_task(async function test_copyFolderFailure() {
  await checkFailedFilter(
    Ci.nsMsgFilterAction.CopyToFolder,
    applyFiltersToFolder
  );
});

add_task(async function test_moveFolderFailure() {
  await checkFailedFilter(
    Ci.nsMsgFilterAction.MoveToFolder,
    applyFiltersToFolder
  );
});

add_task(async function test_successfulCopyThenFailedCopy() {
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(`source-${++folderIndex}`)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const successfulTarget = root.createLocalSubfolder(`success-${folderIndex}`);
  const failedTarget = root.createLocalSubfolder(`failure-${folderIndex}`);
  for (let index = 0; index < 2; index++) {
    source.addMessage(
      "From: sender@example.invalid\r\n" +
        "To: recipient@example.invalid\r\n" +
        "Subject: Successive copies\r\n" +
        `Message-ID: <successive-${folderIndex}-${index}@example.invalid>\r\n` +
        "\r\nMessage body.\r\n"
    );
  }
  const messages = [...source.messages];
  const messageIds = messages.map(message => message.messageId);
  const originalContent = await IOUtils.readUTF8(source.filePath.path);
  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  filterList.clearLog();
  filterList.loggingEnabled = true;
  registerCleanupFunction(() => {
    filterList.loggingEnabled = false;
  });
  const filter = filterList.createFilter("Successive copies");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  for (const target of [successfulTarget, failedTarget]) {
    const action = filter.createAction();
    action.type = Ci.nsMsgFilterAction.CopyToFolder;
    action.targetFolderUri = target.URI;
    filter.appendAction(action);
  }
  filterList.insertFilterAt(0, filter);
  failedTarget.acquireSemaphore(source, "Successive copy test");
  registerCleanupFunction(() =>
    failedTarget.releaseSemaphore(source, "Successive copy test")
  );

  let completionCount = 0;
  const listener = new PromiseTestUtils.PromiseMsgOperationListener({
    onStopOperation() {
      completionCount++;
    },
  });
  applyFiltersToMessages(filterList, source, messages, listener);
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_MSG_FOLDER_BUSY),
    "The run should report the second copy's failure"
  );
  Assert.equal(completionCount, 1, "The run should complete exactly once");
  Assert.deepEqual(
    [...successfulTarget.messages].map(message => message.messageId).sort(),
    messageIds.toSorted(),
    "The first destination should contain every requested message"
  );
  Assert.equal(
    failedTarget.getTotalMessages(false),
    0,
    "The failed destination should remain empty"
  );
  Assert.equal(
    source.getTotalMessages(false),
    messages.length,
    "Both copy actions should retain the source messages"
  );
  const content = await IOUtils.readUTF8(source.filePath.path);
  Assert.equal(
    content,
    originalContent,
    "The copies should preserve the source message bodies"
  );

  filterList.loggingEnabled = false;
  const logFile = Services.io
    .newURI(filterList.logURL)
    .QueryInterface(Ci.nsIFileURL).file;
  const log = await IOUtils.readUTF8(logFile.path);
  const entries = [
    ...new DOMParser().parseFromString(log, "text/html").querySelectorAll("p"),
  ].map(entry => entry.textContent);
  Assert.equal(
    entries.length,
    messages.length + 1,
    "The log should contain per-message successes followed by one batch failure"
  );
  for (const [index, messageId] of messageIds.entries()) {
    Assert.ok(
      entries[index].includes(successfulTarget.URI) &&
        !entries[index].includes(failedTarget.URI) &&
        entries[index].includes(messageId) &&
        entries[index].includes(filter.filterName) &&
        !/0x[0-9A-F]{8}/i.test(entries[index]),
      "Each success should identify only the first action's destination and message"
    );
  }
  const failure = entries.at(-1);
  const errorCode = `0x${Cr.NS_MSG_FOLDER_BUSY.toString(16).toUpperCase()}`;
  Assert.ok(
    failure.includes(failedTarget.URI) &&
      failure.includes(filter.filterName) &&
      failure.includes(errorCode) &&
      !failure.includes(successfulTarget.URI),
    "The failure should identify only the second action's destination and error"
  );
  Assert.deepEqual(
    failure.match(/successive-\d+-\d+@example\.invalid/g),
    messageIds,
    "The second action's failure should list each requested message exactly once"
  );
});
