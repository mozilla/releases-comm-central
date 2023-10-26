/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that an address book, once renamed, is not deleted when a sibling address book is deleted.
 */

function addDirectory(dirName) {
  const dirPrefId = MailServices.ab.newAddressBook(
    dirName,
    "",
    kPABData.dirType
  );
  return MailServices.ab.getDirectoryFromId(dirPrefId);
}

function renameDirectory(directory, newName) {
  directory.dirName = newName;
}

/**
 * Create 4 addressbooks (directories). Rename the second one and delete
 * the third one. Check if their names are still correct. (bug 745664)
 */
async function run_test() {
  const dirNames = ["testAb0", "testAb1", "testAb2", "testAb3"];
  const directories = [];

  for (const dirName of dirNames) {
    directories.push(addDirectory(dirName));
  }

  dirNames[1] = "newTestAb1";
  renameDirectory(directories[1], dirNames[1]);
  for (const dir in dirNames) {
    Assert.equal(dirNames[dir], directories[dir].dirName);
  }
  await promiseDirectoryRemoved(directories[2].URI);
  dirNames.splice(2, 1);
  directories.splice(2, 1);

  for (const dir in dirNames) {
    Assert.equal(dirNames[dir], directories[dir].dirName);
  }
}
