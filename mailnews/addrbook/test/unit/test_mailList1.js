/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for mailing list functions.
 *
 * This suite relies on abLists1.mab. checkLists requires that the mailing list
 * name be "TestList<n>" where <n> is the number of the list that also matches
 * the <n> in the uri: moz-ab???directory://path/MailList<n>
 */

function checkLists(childNodes, number) {
  let count = 0;
  // See comment above for matching requirements
  for (const list of childNodes) {
    if (list.isMailList && list.dirName.startsWith("TestList")) {
      Assert.equal(list.URI, `${kPABData.URI}/${list.UID}`);
      count++;
    }
  }

  Assert.equal(count, number);
}

function run_test() {
  loadABFile("../../../data/abLists1", kPABData.fileName);

  // Test - Get the directory.

  // XXX Getting all directories ensures we create all ABs because mailing
  // lists need help initialising themselves
  MailServices.ab.directories;

  const AB = MailServices.ab.getDirectory(kPABData.URI);

  // Test - Check all the expected mailing lists exist.

  // There are three lists in abLists.mab by default.
  checkLists(AB.childNodes, 3);

  // Test - Add a new list.

  var mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);

  mailList.isMailList = true;
  mailList.dirName = "TestList4";
  mailList.listNickName = "test4";
  mailList.description = "test4description";

  AB.addMailList(mailList);

  // check them
  checkLists(AB.childNodes, 4);

  // Test - Remove a list.

  mailList = MailServices.ab.getDirectory(
    kPABData.URI + "/46cf4cbf-5945-43e4-a822-30c2f2969db9"
  );

  AB.deleteDirectory(mailList);

  // check them
  checkLists(AB.childNodes, 3);
}
