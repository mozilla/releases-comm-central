function run_test() {
  do_get_profile();
  MailServices.ab.directories;
  let book = MailServices.ab.getDirectory(kPABData.URI);

  let list = Cc["@mozilla.org/addressbook/directoryproperty;1"].createInstance(Ci.nsIAbDirectory);
  list.isMailList = true;
  list.dirName = "list";
  list = book.addMailList(list);

  let contact1 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  contact1.firstName = "contact";
  contact1.lastName = "1";
  contact1.primaryEmail = "contact1@invalid";
  contact1 = book.addCard(contact1);
  list.addCard(contact1);

  let contact2 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  contact2.firstName = "contact";
  contact2.lastName = "2";
  // No email address!
  contact2 = book.addCard(contact2);
  list.addCard(contact2);

  let contact3 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  contact3.firstName = "contact";
  contact3.lastName = "3";
  contact3.primaryEmail = "contact3@invalid";
  contact3 = book.addCard(contact3);
  list.addCard(contact3);

  // book.childCards should contain the list and all three contacts.
  let bookCards = book.childCards;
  ok(bookCards.hasMoreElements());
  equal(list.UID, bookCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(bookCards.hasMoreElements());
  equal(contact1.UID, bookCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(bookCards.hasMoreElements());
  equal(contact2.UID, bookCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(bookCards.hasMoreElements());
  equal(contact3.UID, bookCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!bookCards.hasMoreElements());

  // list.childCards should contain contacts 1 and 3, and crucially, not die at 2.
  let listCards = list.childCards;
  ok(listCards.hasMoreElements());
  equal(contact1.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  equal(contact3.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listCards.hasMoreElements());

  // list.addressLists should contain contacts 1 and 3.
  let listEnum = list.addressLists.enumerate();
  ok(listEnum.hasMoreElements());
  equal(contact1.UID, listEnum.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listEnum.hasMoreElements());
  equal(contact3.UID, listEnum.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listEnum.hasMoreElements());

  // Reload the address book manager.
  Services.obs.notifyObservers(null, "addrbook-reload");

  MailServices.ab.directories;
  book = MailServices.ab.getDirectory(kPABData.URI);

  // For some unknown reason this is necessary for book.addressLists to be populated.
  if (kPABData.dirType == 2) {
    book.QueryInterface(Ci.nsIAbMDBDirectory).database.getMailingListsFromDB(book);
    equal(1, book.addressLists.Count());
  }
  list = book.addressLists.GetElementAt(0).QueryInterface(Ci.nsIAbDirectory);

  // list.childCards should contain contacts 1 and 3.
  listCards = list.childCards;
  ok(listCards.hasMoreElements());
  equal(contact1.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  equal(contact3.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listCards.hasMoreElements());

  // list.addressLists should contain contacts 1 and 3.
  listEnum = list.addressLists.enumerate();
  ok(listEnum.hasMoreElements());
  equal(contact1.UID, listEnum.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listEnum.hasMoreElements());
  equal(contact3.UID, listEnum.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listEnum.hasMoreElements());
}
