/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for checking we get the correct notifications when cards are
 * modified.
 *
 * XXX Still to do:
 * - Editing a mailing list properties (name/nickname/notes)
 * - Adding, editing and deleting items in mailing lists
 */

var abListener = {
  result: [],
  maxResults: 1,
  onItemAdded(parentItem, item) {
    Assert.ok(this.result.length < this.maxResults);
    this.result.push(["onItemAdded", parentItem, item]);
  },
  onItemRemoved(parentItem, item) {
    Assert.ok(this.result.length < this.maxResults);
    this.result.push(["onItemRemoved", parentItem, item]);
  },
  onItemPropertyChanged(item, property, oldValue, newValue) {
    Assert.ok(this.result.length < this.maxResults);
    this.result.push([
      "onItemPropertyChanged",
      item,
      property,
      oldValue,
      newValue,
    ]);
  },
};

var abObserver = {
  result: [],
  maxResults: 1,
  observe(subject, topic, data) {
    Assert.ok(this.result.length < this.maxResults);
    this.result.push([subject, topic, data]);
  },
};

function run_test() {
  // XXX Getting all directories ensures we create all ABs because the
  // address collecter can't currently create ABs itself (bug 314448).
  MailServices.ab.directories;

  run_next_test();
}

add_test(function() {
  // Add a listener
  MailServices.ab.addAddressBookListener(abListener, Ci.nsIAbListener.all);

  // Get the directory
  let AB = MailServices.ab.getDirectory(kPABData.URI);

  // For card tests, the most we expect is one notification.
  abListener.maxResults = 1;

  // Test - add a card

  var card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );

  card.firstName = "test";
  card.primaryEmail = "test@foo.invalid";

  var newCard = AB.addCard(card);

  Assert.ok(newCard instanceof Ci.nsIAbCard);
  Assert.equal(abListener.result[0][0], "onItemAdded");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[0][2], newCard);
  abListener.result = [];

  // Test - modify a card

  newCard.lastName = "invalid";

  AB.modifyCard(newCard);

  Assert.equal(abListener.result[0][0], "onItemPropertyChanged");
  Assert.equal(abListener.result[0][1], newCard);
  Assert.equal(abListener.result[0][2], "LastName");
  Assert.ok(!abListener.result[0][3]);
  Assert.equal(abListener.result[0][4], "invalid");
  abListener.result = [];

  // Test - delete a card

  var cardsToDelete = Cc["@mozilla.org/array;1"].createInstance(
    Ci.nsIMutableArray
  );

  cardsToDelete.appendElement(newCard);

  AB.deleteCards(cardsToDelete);

  Assert.equal(abListener.result[0][0], "onItemRemoved");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[0][2], newCard);
  abListener.result = [];

  print("Finished Cards");

  // Test - add a mailing list

  var mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);

  mailList.isMailList = true;
  mailList.dirName = "TestList";
  mailList.listNickName = "test";
  mailList.description = "testdescription";

  // For mailing list addition, we expect 2 results, one for the card, one
  // for the directory
  abListener.maxResults = 2;

  AB.addMailList(mailList);

  Assert.equal(abListener.result.length, 2);
  Assert.equal(abListener.result[0][0], "onItemAdded");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[1][0], "onItemAdded");
  Assert.equal(abListener.result[1][1], AB);

  // Now verify the card and the directory
  card = abListener.result[0][2].QueryInterface(Ci.nsIAbCard);
  Assert.ok(card.isMailList);
  Assert.equal(card.displayName, "TestList");
  Assert.equal(card.getProperty("Notes", "BAD"), "testdescription");
  Assert.equal(card.getProperty("NickName", "BAD"), "test");

  var book = abListener.result[1][2].QueryInterface(Ci.nsIAbDirectory);
  Assert.ok(book.isMailList);
  Assert.equal(book.dirName, "TestList");
  Assert.equal(book.listNickName, "test");
  Assert.equal(book.description, "testdescription");

  abListener.result = [];

  // Test - Remove a list.

  // With this line, there'll be three notifications below.
  // Without it, there'll be two. Go figure.
  [...book.childCards];

  abListener.maxResults = 3;
  AB.deleteDirectory(book);

  Assert.equal(abListener.result.length, 3);
  Assert.equal(abListener.result[0][0], "onItemRemoved");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[1][0], "onItemRemoved");
  Assert.equal(
    abListener.result[1][1].QueryInterface(Ci.nsIAbDirectory).UID,
    book.UID
  );
  Assert.equal(abListener.result[2][0], "onItemRemoved");
  Assert.equal(abListener.result[2][1], AB);

  // Now verify the card and the directory
  card = abListener.result[0][2].QueryInterface(Ci.nsIAbCard);
  Assert.ok(card.isMailList);
  Assert.equal(card.displayName, "TestList");
  Assert.equal(card.getProperty("Notes", "BAD"), "testdescription");
  Assert.equal(card.getProperty("NickName", "BAD"), "test");

  book = abListener.result[2][2].QueryInterface(Ci.nsIAbDirectory);
  Assert.ok(book.isMailList);
  Assert.equal(book.dirName, "TestList");
  Assert.equal(book.listNickName, "test");
  Assert.equal(book.description, "testdescription");

  // Remove listener

  MailServices.ab.removeAddressBookListener(abListener);

  run_next_test();
});

add_test(function() {
  let dirName = MailServices.ab.newAddressBook(
    "TestBook",
    "",
    kPABData.dirType
  );
  let AB = MailServices.ab.getDirectoryFromId(dirName);

  let mailList = Cc[
    "@mozilla.org/addressbook/directoryproperty;1"
  ].createInstance(Ci.nsIAbDirectory);
  mailList.isMailList = true;
  mailList.dirName = "TestList";
  mailList = AB.addMailList(mailList);

  let card1 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card1.firstName = "test1";
  card1.primaryEmail = "test1@foo.invalid";
  card1 = AB.addCard(card1);

  let card2 = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  card2.firstName = "test2";
  card2.primaryEmail = "test2@foo.invalid";
  card2 = AB.addCard(card2);
  mailList.addCard(card2);

  // Test: remove one card that ISN'T in the mailing list

  Services.obs.addObserver(abObserver, "addrbook-list-member-removed");
  abObserver.maxResults = 0;
  abObserver.result = [];

  let cardsToDelete = Cc["@mozilla.org/array;1"].createInstance(
    Ci.nsIMutableArray
  );
  cardsToDelete.appendElement(card1);
  AB.deleteCards(cardsToDelete);

  // Test: remove one card that IS in the mailing list

  abObserver.maxResults = 1;
  abObserver.result = [];

  cardsToDelete.clear();
  cardsToDelete.appendElement(card2);
  AB.deleteCards(cardsToDelete);

  Assert.equal(abObserver.result.length, 1);
  Assert.equal(abObserver.result[0][0], card2);
  Assert.equal(abObserver.result[0][1], "addrbook-list-member-removed");
  Assert.equal(abObserver.result[0][2], mailList.UID);

  Services.obs.removeObserver(abObserver, "addrbook-list-member-removed");

  run_next_test();
});
