/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that subfolders added to searched folders are also searched.
 */

const { VirtualFolderHelper } = ChromeUtils.import(
  "resource:///modules/VirtualFolderWrapper.jsm"
);

add_task(function () {
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;

  // Create some real folders to test.
  rootFolder.createSubfolder("test A", null);
  const testFolderA = rootFolder.getChildNamed("test A");
  rootFolder.createSubfolder("test B", null);
  const testFolderB = rootFolder.getChildNamed("test B");
  rootFolder.createSubfolder("test C", null);
  const testFolderC = rootFolder.getChildNamed("test C");

  // Create a virtual folder with no search folders.
  const wrappedFolderZ = VirtualFolderHelper.createNewVirtualFolder(
    "virtual Z",
    rootFolder,
    [],
    "ANY",
    false
  );
  Assert.equal(
    wrappedFolderZ.virtualFolder,
    rootFolder.getChildNamed("virtual Z")
  );
  Assert.equal(wrappedFolderZ.searchFolderURIs, "");
  Assert.deepEqual(wrappedFolderZ.searchFolders, []);

  // Create a virtual folder with one search folder.
  const wrappedFolderY = VirtualFolderHelper.createNewVirtualFolder(
    "virtual Y",
    rootFolder,
    [testFolderA],
    "ANY",
    false
  );
  Assert.equal(
    wrappedFolderY.virtualFolder,
    rootFolder.getChildNamed("virtual Y")
  );
  Assert.equal(wrappedFolderY.searchFolderURIs, testFolderA.URI);
  Assert.deepEqual(wrappedFolderY.searchFolders, [testFolderA]);

  // Create a virtual folder with two search folders.
  const wrappedFolderX = VirtualFolderHelper.createNewVirtualFolder(
    "virtual X",
    rootFolder,
    [testFolderB, testFolderC],
    "ANY",
    false
  );
  Assert.equal(
    wrappedFolderX.virtualFolder,
    rootFolder.getChildNamed("virtual X")
  );
  Assert.equal(
    wrappedFolderX.searchFolderURIs,
    `${testFolderB.URI}|${testFolderC.URI}`
  );
  Assert.deepEqual(wrappedFolderX.searchFolders, [testFolderB, testFolderC]);

  // Add a subfolder to real folder B. Check it is added to virtual folder X.
  testFolderB.createSubfolder("test BB", null);
  const testFolderBB = testFolderB.getChildNamed("test BB");
  Assert.equal(
    wrappedFolderZ.searchFolderURIs,
    "",
    "virtual folder Z should not change"
  );
  Assert.deepEqual(
    wrappedFolderZ.searchFolders,
    [],
    "virtual folder Z should not change"
  );
  Assert.equal(
    wrappedFolderY.searchFolderURIs,
    testFolderA.URI,
    "virtual folder Y should not change"
  );
  Assert.deepEqual(
    wrappedFolderY.searchFolders,
    [testFolderA],
    "virtual folder Y should not change"
  );
  Assert.equal(
    wrappedFolderX.searchFolderURIs,
    `${testFolderB.URI}|${testFolderC.URI}|${testFolderBB.URI}`
  );
  Assert.deepEqual(wrappedFolderX.searchFolders, [
    testFolderB,
    testFolderBB,
    testFolderC,
  ]);

  // Add a subfolder to real folder BB. Check it is added to virtual folder X.
  testFolderBB.createSubfolder("test BBB", null);
  const testFolderBBB = testFolderBB.getChildNamed("test BBB");
  Assert.equal(
    wrappedFolderZ.searchFolderURIs,
    "",
    "virtual folder Z should not change"
  );
  Assert.deepEqual(
    wrappedFolderZ.searchFolders,
    [],
    "virtual folder Z should not change"
  );
  Assert.equal(
    wrappedFolderY.searchFolderURIs,
    testFolderA.URI,
    "virtual folder Y should not change"
  );
  Assert.deepEqual(
    wrappedFolderY.searchFolders,
    [testFolderA],
    "virtual folder Y should not change"
  );
  Assert.equal(
    wrappedFolderX.searchFolderURIs,
    `${testFolderB.URI}|${testFolderC.URI}|${testFolderBB.URI}|${testFolderBBB.URI}`
  );
  Assert.deepEqual(wrappedFolderX.searchFolders, [
    testFolderB,
    testFolderBB,
    testFolderBBB,
    testFolderC,
  ]);

  // Remove BB from virtual folder X.
  wrappedFolderX.searchFolders = [testFolderB, testFolderBBB, testFolderC];
  Assert.equal(
    wrappedFolderZ.searchFolderURIs,
    "",
    "virtual folder Z should not change"
  );
  Assert.deepEqual(
    wrappedFolderZ.searchFolders,
    [],
    "virtual folder Z should not change"
  );
  Assert.equal(
    wrappedFolderY.searchFolderURIs,
    testFolderA.URI,
    "virtual folder Y should not change"
  );
  Assert.deepEqual(
    wrappedFolderY.searchFolders,
    [testFolderA],
    "virtual folder Y should not change"
  );
  Assert.equal(
    wrappedFolderX.searchFolderURIs,
    `${testFolderB.URI}|${testFolderBBB.URI}|${testFolderC.URI}`
  );
  Assert.deepEqual(wrappedFolderX.searchFolders, [
    testFolderB,
    testFolderBBB,
    testFolderC,
  ]);

  // Add a second subfolder to the removed folder. Check it is not added to
  // virtual folder X, because the parent folder is not in X.
  testFolderBB.createSubfolder("test BBB two", null);
  Assert.equal(
    wrappedFolderZ.searchFolderURIs,
    "",
    "virtual folder Z should not change"
  );
  Assert.deepEqual(
    wrappedFolderZ.searchFolders,
    [],
    "virtual folder Z should not change"
  );
  Assert.equal(
    wrappedFolderY.searchFolderURIs,
    testFolderA.URI,
    "virtual folder Y should not change"
  );
  Assert.deepEqual(
    wrappedFolderY.searchFolders,
    [testFolderA],
    "virtual folder Y should not change"
  );
  Assert.equal(
    wrappedFolderX.searchFolderURIs,
    `${testFolderB.URI}|${testFolderBBB.URI}|${testFolderC.URI}`
  );
  Assert.deepEqual(wrappedFolderX.searchFolders, [
    testFolderB,
    testFolderBBB,
    testFolderC,
  ]);
});
