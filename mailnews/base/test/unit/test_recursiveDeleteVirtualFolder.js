/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { VirtualFolderHelper } = ChromeUtils.importESModule(
  "resource:///modules/VirtualFolderWrapper.sys.mjs"
);

/**
 * Tests that the automatic removal of a search folder (due to removal of its
 * last search target) does not break the recursive delete of an ancestor
 * folder.
 */
add_task(
  async function test_listener_mutates_children_during_recursive_delete() {
    const account = MailServices.accounts.createLocalMailAccount();
    const rootFolder = account.incomingServer.rootFolder;

    const parentFolder = await rootFolder.createSubfolderAsync(
      "recursive-delete-parent"
    );
    const targetFolder =
      await parentFolder.createSubfolderAsync("search-target");
    const wrapped = VirtualFolderHelper.createNewVirtualFolder(
      "saved-search-sibling",
      parentFolder,
      [targetFolder],
      "ALL",
      false
    );

    Assert.equal(
      parentFolder.numSubFolders,
      2,
      "the target and saved search should both be children"
    );

    rootFolder.propagateDelete(parentFolder, true);

    Assert.ok(
      !rootFolder.containsChildNamed("recursive-delete-parent"),
      "the parent should be deleted when its child list changes"
    );
    Assert.equal(
      parentFolder.parent,
      null,
      "the deleted parent folder should have no parent"
    );
    Assert.equal(
      targetFolder.parent,
      null,
      "the search target should have no parent after recursive deletion"
    );
    Assert.equal(
      wrapped.virtualFolder.parent,
      null,
      "the saved search should be removed with its sole target"
    );

    MailServices.accounts.removeAccount(account);
  }
);
