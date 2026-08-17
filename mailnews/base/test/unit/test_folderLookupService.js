/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This tests that nsIFolderLookupService works according to specification.
 */
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var kRootURI = "mailbox://nobody@Local%20Folders";

add_task(async function test_fls_basics() {
  const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );

  // Make sure that the local mail account exists.
  localAccountUtils.loadLocalMailAccount();

  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Inbox"),
    localAccountUtils.inboxFolder,
    "There should exist an Inbox"
  );

  // Can we get the root folder?
  const root = localAccountUtils.rootFolder;
  Assert.equal(
    fls.getFolderForURL(kRootURI),
    root,
    "We should be able to get the root folder."
  );

  // The child folder Child doesn't exist yet... make sure that fls doesn't
  // return it yet
  Assert.equal(fls.getFolderForURL(kRootURI + "/Child"), null);

  // Create the Child folder, and test we can find it.
  // (NOTE: createSubFolder() can be async for IMAP folders. But for now
  // we know we're using local folders and it'll happen right away).
  root.createSubfolder("Child", null);
  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child")
  );

  // Try it again... it should load from cache this time.
  Assert.equal(
    fls.getFolderForURL(kRootURI + "/Child"),
    root.getChildNamed("Child")
  );

  // Now delete the folder; we should be unable to find it
  root.propagateDelete(root.getChildNamed("Child"), true);
  Assert.equal(fls.getFolderForURL(kRootURI + "/Child"), null);

  Assert.equal(fls.getFolderForURL(kRootURI + "/"), null);
  Assert.equal(
    fls.getFolderForURL("mailbox://idonotexist@Local%20Folders"),
    null
  );
});

add_task(async function test_unicode_uris() {
  const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.rootFolder;

  // Create a folder with non-ASCII characters.
  // Unicode abuse - dotless letter i and a metal umlaut over the n.
  const tapName = "Sp\u0131n\u0308al Tap";
  root.createSubfolder(tapName, null);

  // Make sure we can find it.
  // (URI is percent-escaped utf-8)
  const tapURI = kRootURI + "/Sp%C4%B1n%CC%88al%20Tap";
  const tap = fls.getFolderForURL(tapURI);
  Assert.equal(tap.URI, tapURI);
});

add_task(async function test_create_folder_with_separator() {
  const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.rootFolder;

  const folder1Name = "Name/with/separator";
  const folder1 = fls.createFolderAndCache(root, folder1Name);
  const expectedUri1 =
    "mailbox://nobody@Local%20Folders/Name%2Fwith%2Fseparator";
  Assert.equal(folder1.URI, expectedUri1);

  const folder2Name = "and/again";
  const folder2 = fls.createFolderAndCache(folder1, folder2Name);
  const expectedUri2 =
    "mailbox://nobody@Local%20Folders/Name%2Fwith%2Fseparator/and%2Fagain";
  Assert.equal(folder2.URI, expectedUri2);
});

add_task(async function test_create_folder_with_percent() {
  const fls = Cc["@mozilla.org/mail/folder-lookup;1"].getService(
    Ci.nsIFolderLookupService
  );
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.rootFolder;

  const folderName = "%this has a %";
  const folder = fls.createFolderAndCache(root, folderName);
  Assert.equal(
    folder.URI,
    "mailbox://nobody@Local%20Folders/%25this%20has%20a%20%25"
  );
});

add_task(async function test_virtual_folder_not_reused_after_delete() {
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.rootFolder;

  // Create a virtual folder, and keep a strong reference to it so that the
  // folder lookup service's weak reference still resolves after deletion.
  const vfName = "VirtualFolder";
  const vf = root.addSubfolder(vfName);
  vf.setFlag(Ci.nsMsgFolderFlags.Virtual);

  // Delete the virtual folder. Its C++ object is removed from the folder tree
  // (parent set to null), but the cache entry still resolves because of the
  // strong reference above. Recreating a folder with the same name must NOT
  // reuse it, otherwise the new folder would incorrectly inherit the Virtual
  // flag (bug 450059).
  root.propagateDelete(vf, true);
  Assert.equal(vf.parent, null, "deleted virtual folder should have no parent");

  const recreated = root.addSubfolder(vfName);
  Assert.notEqual(recreated, vf, "recreated folder should be a fresh object");
  Assert.ok(
    !recreated.getFlag(Ci.nsMsgFolderFlags.Virtual),
    "recreated folder should not inherit the Virtual flag"
  );
});

add_task(async function test_virtual_folder_not_reused_by_get_or_create() {
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.rootFolder;

  // Same as above, but exercised through getOrCreateFolderForURL, which is
  // what (re)creating an IMAP folder uses (via nsImapMailFolder::AddSubfolder
  // and AddSubfolderWithPath). It must not return the stale parentless virtual
  // folder either, otherwise the caller would re-parent it and the new folder
  // would incorrectly inherit the Virtual flag (bug 450059).
  const vfName = "VirtualFolder2";
  const vf = root.addSubfolder(vfName);
  vf.setFlag(Ci.nsMsgFolderFlags.Virtual);

  root.propagateDelete(vf, true);

  const got = MailServices.folderLookup.getOrCreateFolderForURL(vf.URI);
  Assert.notEqual(
    got,
    vf,
    "getOrCreateFolderForURL should return a fresh object, not the stale virtual folder"
  );
  Assert.ok(
    !got.getFlag(Ci.nsMsgFolderFlags.Virtual),
    "fresh object should not inherit the Virtual flag"
  );
});
