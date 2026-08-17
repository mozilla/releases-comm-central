/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests bug 450059: creating a virtual folder (saved search) under an IMAP
 * account, deleting it, and then creating an ordinary folder with the same
 * name must not leave the new folder with the Virtual flag.
 *
 * The stale virtual folder object is removed from the folder tree on deletion
 * (parent set to null), but a strong reference may keep the object alive so
 * that the folder lookup service's weak reference still resolves. Recreating a
 * folder at the same URI must not reuse it, otherwise the new folder
 * incorrectly inherits the Virtual flag.
 */

var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

add_setup(async function () {
  setupIMAPPump();
  Services.prefs.setBoolPref(
    "mail.server.default.autosync_offline_stores",
    false
  );
});

add_task(async function test_virtual_folder_not_reused_after_delete() {
  const rootFolder = IMAPPump.incomingServer.rootFolder;

  // Create a parent folder (like a "Label" folder), then the virtual folder
  // (saved search) under it, the same way VirtualFolderWrapper does: the VF is
  // created locally via addSubfolder (it has no server mailbox) and then
  // flagged Virtual. Keep the strong reference so that the folder lookup
  // service's weak reference still resolves after deletion.
  rootFolder.createSubfolder("Label-A", null);
  await PromiseTestUtils.promiseFolderAdded("Label-A");
  const parent = rootFolder.getChildNamed("Label-A");

  const vf = parent.addSubfolder("AB");
  vf.setFlag(Ci.nsMsgFolderFlags.Virtual);

  // Delete the virtual folder. Virtual folders are deleted locally (no server
  // round trip), which removes them from the folder tree.
  vf.deleteSelf(null);
  Assert.equal(vf.parent, null, "deleted virtual folder should have no parent");
  Assert.equal(
    parent.getChildNamed("AB"),
    null,
    "virtual folder should be gone"
  );

  // Recreate an ordinary folder with the same name. For IMAP this goes through
  // the server (CREATE followed by folder discovery), which ends up in
  // AddSubfolderWithPath -> GetOrCreateFolderForURL.
  parent.createSubfolder("AB", null);
  const recreated = await PromiseTestUtils.promiseFolderAdded("AB");

  Assert.ok(
    !recreated.getFlag(Ci.nsMsgFolderFlags.Virtual),
    "recreated folder should not inherit the Virtual flag"
  );
});
