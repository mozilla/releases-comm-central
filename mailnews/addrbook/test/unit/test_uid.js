/*
 * Test to check that pre-existing cards are given a UID,
 * and that the UID remains the same after a shutdown.
 */
Cu.importGlobalProperties(["fetch"]);

var profD = do_get_profile();

// Installs an address book with some existing objects.
function run_test() {
  let testAB = do_get_file("data/existing.mab");
  testAB.copyTo(profD, kPABData.fileName);

  run_next_test();
}

// Tests that directories have UIDs.
add_test(function directoryUID() {
  for (let book of MailServices.ab.directories) {
    equal(36, book.UID.length, "Existing directory has a UID");
  }

  let dirName = MailServices.ab.newAddressBook("test", "", kPABData.dirType);
  let directory = MailServices.ab.getDirectoryFromId(dirName);
  equal(36, directory.UID.length, "New directory has a UID");

  run_next_test();
});

// Tests that an existing contact has a UID generated, and that that UID is
// saved to the database so that the same UID is used next time.
add_task(async function existingContactUID() {
  let book = MailServices.ab.getDirectory(kPABData.URI);
  let bookCards = [...book.childCards];
  equal(2, bookCards.length, "Loaded test address book");

  let card = bookCards[0];
  if (card.isMailList) {
    card = bookCards[1];
  }
  equal(36, card.UID.length, "Existing contact has a UID");

  let existingUID = card.UID;
  bookCards = [...book.childCards];
  card = bookCards[0];
  if (card.isMailList) {
    card = bookCards[1];
  }
  equal(existingUID, card.UID, "New reference to contact has the same UID");

  let abFile = profD.clone();
  abFile.append(kPABData.fileName);
  let response = await fetch(Services.io.newFileURI(abFile).spec);
  let text = await response.text();

  ok(text.includes(card.UID), "UID has been saved to file");
});

// Tests that new contacts have UIDs. Do this test last so we don't muck up
// the others by adding new things to the address book.
add_test(function newContactUID() {
  let book = MailServices.ab.getDirectory(kPABData.URI);
  let contact = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  let newContact = book.addCard(contact);
  equal(36, newContact.UID.length, "New contact has a UID");

  run_next_test();
});

// Tests that new lists have UIDs.
add_test(function listUID() {
  let book = MailServices.ab.getDirectory(kPABData.URI);
  let lists = book.addressLists;
  equal(1, lists.length);

  let directory = lists.GetElementAt(0);
  directory.QueryInterface(Ci.nsIAbDirectory);
  equal(36, directory.UID.length, "Existing list's directory has a UID");

  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance();
  list.QueryInterface(Ci.nsIAbDirectory);
  list.isMailList = true;
  book.addMailList(list);
  equal(2, lists.length);

  let newDirectory = lists.GetElementAt(1);
  newDirectory.QueryInterface(Ci.nsIAbDirectory);
  equal(36, newDirectory.UID.length, "New list's directory has a UID");

  run_next_test();
});
