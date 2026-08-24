/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that a virtual folder beneath an IMAP folder whose on-disk name has a
 * collision suffix is stored beneath the actual parent path (bug 709449).
 */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);
async function moveFolder(source, destination) {
  const copyListener = new PromiseTestUtils.PromiseCopyListener();
  MailServices.copy.copyFolder(source, destination, true, copyListener, null);
  await copyListener.promise;
}

add_setup(function () {
  setupIMAPPump();
});

add_task(async function test_virtual_folder_uses_parent_file_path() {
  const parent = IMAPPump.inbox;
  const root = IMAPPump.incomingServer.rootFolder;
  const originalParentPath = parent.filePath;

  // Simulate an existing IMAP folder whose summary file had to use a unique
  // name because the natural on-disk name was already occupied.
  const suffixedParentPath = originalParentPath.clone();
  suffixedParentPath.leafName += "-1";
  parent.filePath = suffixedParentPath;

  // Make the directory implied by the URI available too. Before the fix, the
  // virtual folder silently used this wrong directory, as in the original bug.
  const wrongDirectory = originalParentPath.clone();
  wrongDirectory.leafName += ".sbd";
  wrongDirectory.create(Ci.nsIFile.DIRECTORY_TYPE, 0o700);

  const wrapped = VirtualFolderHelper.createNewVirtualFolder(
    "SavedSearch",
    parent,
    [],
    "ALL",
    false
  );
  let virtualFolder = wrapped.virtualFolder;

  const expectedPath = suffixedParentPath.clone();
  expectedPath.leafName += ".sbd";
  expectedPath.append("SavedSearch");

  Assert.equal(
    virtualFolder.filePath.path,
    expectedPath.path,
    "the virtual folder should use the parent's actual on-disk path"
  );
  Assert.equal(
    virtualFolder.summaryFile.path,
    expectedPath.path + ".msf",
    "the virtual folder summary should be beneath the suffixed parent"
  );
  Assert.ok(
    virtualFolder.summaryFile.exists(),
    "the virtual folder summary should be created"
  );

  const wrongSummary = wrongDirectory.clone();
  wrongSummary.append("SavedSearch.msf");
  Assert.ok(
    !wrongSummary.exists(),
    "no virtual folder summary should be created beneath the URI-derived path"
  );

  // Moving the saved search out failed with NS_ERROR_FILE_NOT_FOUND when its
  // folder object pointed at the URI-derived path instead of the summary file
  // copied beneath the parent's actual path (bug 2009626).
  await moveFolder(virtualFolder, root);
  virtualFolder = root.getChildNamed("SavedSearch");
  Assert.ok(
    virtualFolder.summaryFile.exists(),
    "the summary should exist after moving the virtual folder to the root"
  );

  // Move it back beneath the suffixed parent and out again. This exercises the
  // LocalCopyVirtualFolder path, where AddSubfolder must assign the same path
  // to the new folder object that the copy operation used for its summary.
  await moveFolder(virtualFolder, parent);
  virtualFolder = parent.getChildNamed("SavedSearch");
  Assert.equal(
    virtualFolder.filePath.path,
    expectedPath.path,
    "the moved virtual folder should use the parent's actual on-disk path"
  );
  Assert.ok(
    virtualFolder.summaryFile.exists(),
    "the moved virtual folder summary should be beneath the suffixed parent"
  );
  Assert.ok(
    !wrongSummary.exists(),
    "moving should not create a summary beneath the URI-derived path"
  );

  await moveFolder(virtualFolder, root);
  virtualFolder = root.getChildNamed("SavedSearch");
  Assert.ok(
    virtualFolder.summaryFile.exists(),
    "the virtual folder should move back out of the suffixed parent"
  );
});

add_task(function endTest() {
  teardownIMAPPump();
});
