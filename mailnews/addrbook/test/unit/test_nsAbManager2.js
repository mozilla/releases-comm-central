/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsAbManager functions relating to add/delete directories and
 * getting the list of directories..
 */

function checkDirs(aDirs, aDirArray) {
  // Don't modify the passed in array.
  var dirArray = aDirArray.concat();

  for (const dir of aDirs) {
    var loc = dirArray.indexOf(dir.URI);

    Assert.equal(MailServices.ab.getDirectory(dir.URI), dir);

    if (loc == -1) {
      do_throw(
        "Unexpected directory " + dir.URI + " found in address book list"
      );
    } else {
      dirArray[loc] = null;
    }
  }

  dirArray.forEach(function (value) {
    Assert.equal(value, null);
  });
}

function addDirectory(dirName) {
  // Add the directory
  const dirPrefId = MailServices.ab.newAddressBook(
    dirName,
    "",
    kPABData.dirType
  );
  return MailServices.ab.getDirectoryFromId(dirPrefId);
}

async function run_test() {
  var expectedABs = [kPABData.URI, kCABData.URI];

  // Test - Check initial directories

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Add a directory

  var newDirectory1 = addDirectory("testAb1");

  // Test - Check new directory list
  expectedABs.push(newDirectory1.URI);

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Repeat for a second directory

  var newDirectory2 = addDirectory("testAb2");

  // Test - Check new directory list
  expectedABs.push(newDirectory2.URI);

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Remove a directory

  var pos = expectedABs.indexOf(newDirectory1.URI);

  expectedABs.splice(pos, 1);

  await promiseDirectoryRemoved(newDirectory1.URI);
  newDirectory1 = null;

  // Test - Check new directory list

  checkDirs(MailServices.ab.directories, expectedABs);

  // Test - Repeat the removal

  await promiseDirectoryRemoved(newDirectory2.URI);
  newDirectory2 = null;

  expectedABs.pop();

  // Test - Check new directory list
  checkDirs(MailServices.ab.directories, expectedABs);
}
