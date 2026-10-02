/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests nsIMsgFolder.renameAsync(). Failures must be reported to the caller,
 * since the backend no longer alerts the user itself.
 */

add_task(async function testLocal() {
  const localAccount = MailServices.accounts.createLocalMailAccount();
  const localRoot = localAccount.incomingServer.rootFolder;
  localRoot.createSubfolder("original", null);
  localRoot.createSubfolder("taken", null);

  await localRoot.getChildNamed("original").renameAsync("renamed");
  Assert.ok(
    localRoot.getChildNamed("renamed"),
    "the folder should have been renamed"
  );
  Assert.ok(
    !localRoot.containsChildNamed("original"),
    "the old name should be gone"
  );

  // Renaming onto a sibling's name must be refused.
  await Assert.rejects(
    localRoot.getChildNamed("renamed").renameAsync("taken"),
    /NS_MSG_FOLDER_EXISTS/,
    "renaming to an existing sibling name should reject"
  );
  Assert.ok(
    localRoot.getChildNamed("renamed"),
    "the folder should keep its name after a refused rename"
  );

  // Renaming to the name it already has is a no-op, not a failure.
  await localRoot.getChildNamed("renamed").renameAsync("renamed");

  Assert.deepEqual(
    localRoot.subFolders.map(f => f.name).toSorted(),
    ["Trash", "Unsent Messages", "renamed", "taken"],
    "the folder list should be unchanged apart from the one rename"
  );
});
