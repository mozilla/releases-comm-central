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
  localAccountUtils.loadLocalMailAccount(
    "@mozilla.org/msgstore/berkeleystore;1"
  );
});

/**
 * Fail a batch after its first copy and check the source and failure log.
 *
 * @param {number} actionType - Copy or move filter action.
 * @param {boolean} selection - Whether to filter selected messages.
 * @param {number} [messageCount=3] - The number of messages in the batch.
 */
async function checkPartialBatch(actionType, selection, messageCount = 3) {
  const root = localAccountUtils.rootFolder;
  const source = root
    .createLocalSubfolder(`partial-source-${++folderIndex}`)
    .QueryInterface(Ci.nsIMsgLocalMailFolder);
  const target = root.createLocalSubfolder(`partial-target-${folderIndex}`);
  for (let index = 0; index < messageCount; index++) {
    source.addMessage(
      "From: sender@example.invalid\r\n" +
        "To: recipient@example.invalid\r\n" +
        `Subject: Partial batch ${index}\r\n` +
        `Message-ID: <partial-${folderIndex}-${index}@example.invalid>\r\n` +
        `\r\nBody ${index}.\r\n`
    );
  }
  const messages = [...source.messages];
  const messageIds = messages.map(message => message.messageId);
  const originalContent = await IOUtils.readUTF8(source.filePath.path);
  const originalToken = messages[1].storeToken;
  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  filterList.clearLog();
  filterList.loggingEnabled = true;
  registerCleanupFunction(() => {
    messages[1].storeToken = originalToken;
    filterList.loggingEnabled = false;
  });
  const filter = filterList.createFilter("Partial batch");
  filter.enabled = true;
  filter.filterType = Ci.nsMsgFilterType.Manual;
  const term = filter.createTerm();
  term.matchAll = true;
  filter.appendTerm(term);
  const action = filter.createAction();
  action.type = actionType;
  action.targetFolderUri = target.URI;
  filter.appendAction(action);
  filterList.insertFilterAt(0, filter);

  // Fail while reading the second message, after the first copy is committed.
  messages[1].storeToken = String(Number(originalToken) + 3);
  const listener = new PromiseTestUtils.PromiseMsgOperationListener();
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
    new RegExp(Cr.NS_ERROR_FAILURE),
    "The incomplete batch should report failure"
  );
  messages[1].storeToken = originalToken;
  Assert.deepEqual(
    [...target.messages].map(message => message.messageId),
    [messageIds[0]],
    "The first message should remain copied after the second message fails"
  );
  Assert.equal(
    source.getTotalMessages(false),
    messageCount,
    "The failed batch should retain all source messages"
  );
  const content = await IOUtils.readUTF8(source.filePath.path);
  Assert.equal(
    content,
    originalContent,
    "The failed batch should preserve the source message bodies"
  );

  filterList.loggingEnabled = false;
  const logFile = Services.io
    .newURI(filterList.logURL)
    .QueryInterface(Ci.nsIFileURL).file;
  const log = await IOUtils.readUTF8(logFile.path);
  const entries = [
    ...new DOMParser().parseFromString(log, "text/html").querySelectorAll("p"),
  ].map(entry => entry.textContent);
  const failures = entries.filter(entry => entry.includes("0x80004005"));
  Assert.equal(
    failures.length,
    1,
    "The log should record one batch failure instead of individual message failures"
  );
  const failure = failures[0];
  const loggedIds = failure.match(/partial-\d+-\d+@example\.invalid/g) ?? [];
  Assert.equal(
    loggedIds.length,
    Math.min(messageCount, 20),
    "The batch failure should list at most 20 requested message IDs"
  );
  Assert.equal(
    new Set(loggedIds).size,
    loggedIds.length,
    "The bounded list should include each message ID only once"
  );
  Assert.ok(
    loggedIds.every(id => messageIds.includes(id)),
    "The bounded list should contain only IDs requested by this batch"
  );
  const expected = new Localization(
    ["messenger/filterEditor.ftl"],
    true
  ).formatValueSync(
    actionType == Ci.nsMsgFilterAction.MoveToFolder
      ? "filter-move-batch-failed"
      : "filter-copy-batch-failed",
    {
      folder: target.URI,
      errorCode: "0x80004005",
      messageIds: loggedIds.join(", "),
      count: Math.max(0, messageCount - 20),
    }
  );
  Assert.ok(
    failure.includes(expected),
    "The log should explain partial completion and count omitted message IDs"
  );
  Assert.ok(
    failure.includes(filter.filterName),
    "The batch failure should identify the filter"
  );
  Assert.deepEqual(
    entries.filter(
      entry => entry.includes(target.URI) && !entry.includes("0x80004005")
    ),
    [],
    "The incomplete batch should not claim that every message succeeded"
  );
}

add_task(async function test_copySelectionLogLimit() {
  await checkPartialBatch(Ci.nsMsgFilterAction.CopyToFolder, true, 20);
});

add_task(async function test_copyFolderLogLimit() {
  await checkPartialBatch(Ci.nsMsgFilterAction.CopyToFolder, false, 21);
});

add_task(async function test_moveSelectionLogLimit() {
  await checkPartialBatch(Ci.nsMsgFilterAction.MoveToFolder, true, 22);
});

add_task(async function test_partialMoveFolder() {
  await checkPartialBatch(Ci.nsMsgFilterAction.MoveToFolder, false);
});
