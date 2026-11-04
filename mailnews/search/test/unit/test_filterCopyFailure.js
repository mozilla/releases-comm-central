/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

let folderIndex = 0;

add_setup(function () {
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
  source.addMessage(
    "From: sender@example.invalid\r\n" +
      "To: recipient@example.invalid\r\n" +
      "Subject: Filter failure\r\n" +
      `Message-ID: <failure-${folderIndex}@example.invalid>\r\n` +
      "\r\nMessage body.\r\n"
  );
  const messages = [...source.messages];
  const originalContent = await IOUtils.readUTF8(source.filePath.path);

  const filterList = MailServices.filters.getTempFilterList(source);
  source.setFilterList(filterList);
  const filter = filterList.createFilter("Failing copy or move");
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
  applyFilters(filterList, source, messages, listener);
  await Assert.rejects(
    listener.promise,
    new RegExp(Cr.NS_ERROR_FAILURE),
    "The filter run should report the failed copy or move"
  );

  Assert.equal(
    source.getTotalMessages(false),
    1,
    "The source message should remain after the failed operation"
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

  const retryListener = new PromiseTestUtils.PromiseCopyListener();
  const isMove = actionType == Ci.nsMsgFilterAction.MoveToFolder;
  MailServices.copy.copyMessages(
    source,
    messages,
    target,
    isMove,
    retryListener,
    null,
    false
  );
  await retryListener.promise;
  Assert.equal(
    target.getTotalMessages(false),
    1,
    "A retry should succeed after restoring the destination"
  );
  Assert.equal(
    source.getTotalMessages(false),
    isMove ? 0 : 1,
    "Only a successful move should remove the source message"
  );
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
