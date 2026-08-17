/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test bug 450059: a virtual folder (saved search) that is deleted while it is
 * displayed in a DBViewWrapper must not be resurrected.
 *
 * The view wrapper's close() used to call endFolderLoading() even for folders
 * being deleted, which runs UpdateSummaryTotals() -> FlushToFolderCache() and
 * re-writes the folder cache entry (including the Virtual flag) for a folder
 * whose cache entry and summary file were just removed by the deletion. A
 * subsequent folder created with the same name would then incorrectly read the
 * Virtual flag back from the cache.
 */

/* import-globals-from resources/viewWrapperTestUtils.js */
load("resources/viewWrapperTestUtils.js");
initViewWrapperTestUtils({ mode: "local" });

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Deleting a virtual folder that is displayed in a view wrapper must not
 * re-add its entry to the folder cache (bug 450059).
 */
add_task(async function test_deleted_virtual_folder_not_reflushed_to_cache() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne]] = await messageInjection.makeFoldersWithSets(1, [{}]);
  const virtFolder = messageInjection.makeVirtualFolder([folderOne], {});
  await view_open(viewWrapper, virtFolder);
  Assert.ok(viewWrapper.isVirtual);

  // For a non-server folder the folder cache key is the persistent descriptor
  // of its summary file.
  const cache = MailServices.accounts.folderCache;
  const cacheKey = virtFolder.summaryFile.persistentDescriptor;

  // The entry exists while the folder exists. getCacheElement throws
  // NS_ERROR_NOT_AVAILABLE when the key is not present.
  cache.getCacheElement(cacheKey, false);

  const parent = virtFolder.parent;
  parent.propagateDelete(virtFolder, true);
  Assert.equal(virtFolder.parent, null, "deleted virtual folder has no parent");
  Assert.equal(
    viewWrapper.displayedFolder,
    null,
    "view wrapper should have closed on deletion"
  );
  Assert.ok(
    !viewWrapper.isFolderLoading(),
    "view wrapper should no longer be loading a folder"
  );

  // The deletion must not have re-added the folder's entry to the folder
  // cache (the stale object would carry the Virtual flag).
  Assert.throws(
    () => cache.getCacheElement(cacheKey, false),
    /NS_ERROR_NOT_AVAILABLE/,
    "deleted folder should not be re-added to the folder cache"
  );
});

/**
 * Recreating a folder with the same name after deleting a displayed virtual
 * folder must not inherit the Virtual flag (bug 450059).
 */
add_task(async function test_recreated_folder_does_not_inherit_virtual() {
  const viewWrapper = make_view_wrapper();

  const [[folderOne]] = await messageInjection.makeFoldersWithSets(1, [{}]);
  const virtFolder = messageInjection.makeVirtualFolder([folderOne], {});
  await view_open(viewWrapper, virtFolder);

  const parent = virtFolder.parent;
  const name = virtFolder.name;
  parent.propagateDelete(virtFolder, true);

  const recreated = parent.addSubfolder(name);
  Assert.notEqual(recreated, virtFolder, "recreated folder should be fresh");
  Assert.ok(
    !recreated.getFlag(Ci.nsMsgFolderFlags.Virtual),
    "recreated folder should not inherit the Virtual flag"
  );

  // Clean up the recreated folder.
  recreated.parent.propagateDelete(recreated, true);
});
