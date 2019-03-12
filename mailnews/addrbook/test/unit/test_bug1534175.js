// Tests an address list can still be added to if a member's email address is removed.

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
  contact2.primaryEmail = "contact2@invalid";
  contact2 = book.addCard(contact2);
  list.addCard(contact2);

  let contact3 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  contact3.firstName = "contact";
  contact3.lastName = "3";
  contact3.primaryEmail = "contact3@invalid";
  contact3 = book.addCard(contact3);
  list.addCard(contact3);

  // listCards should contain contacts 1 to 3.
  let database = book.QueryInterface(Ci.nsIAbMDBDirectory).database;
  let listCards = database.enumerateListAddresses(list);
  ok(listCards.hasMoreElements());
  ok(contact1.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact2.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact3.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listCards.hasMoreElements());

  contact2.setProperty("PrimaryEmail", null);
  book.modifyCard(contact2);
  list.editMailListToDatabase(null);

  // listCards should still contain contacts 1 to 3.
  listCards = database.enumerateListAddresses(list);
  ok(listCards.hasMoreElements());
  ok(contact1.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact2.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact3.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listCards.hasMoreElements());

  let contact4 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(Ci.nsIAbCard);
  contact4.firstName = "contact";
  contact4.lastName = "4";
  contact4.primaryEmail = "contact4@invalid";
  contact4 = book.addCard(contact4);
  list.addCard(contact4);

  // listCards should contain contacts 1 to 4.
  listCards = database.enumerateListAddresses(list);
  ok(listCards.hasMoreElements());
  ok(contact1.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact2.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact3.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(listCards.hasMoreElements());
  ok(contact4.UID, listCards.getNext().QueryInterface(Ci.nsIAbCard).UID);
  ok(!listCards.hasMoreElements());
}
