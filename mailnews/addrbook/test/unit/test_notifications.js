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
    this.result.push(["onItemPropertyChanged", item, property, oldValue, newValue]);
  },
};

function run_test() {
  // XXX Getting all directories ensures we create all ABs because the
  // address collecter can't currently create ABs itself (bug 314448).
  MailServices.ab.directories;

  // Add a listener
  MailServices.ab.addAddressBookListener(abListener, Ci.nsIAbListener.all);

  // Get the directory
  let AB = MailServices.ab.getDirectory(kPABData.URI);

  // For card tests, the most we expect is one notification.
  abListener.maxResults = 1;

  // Test - add a card

  var card = Cc["@mozilla.org/addressbook/cardproperty;1"]
               .createInstance(Ci.nsIAbCard);

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
  Assert.equal(abListener.result[0][2], null);
  Assert.equal(abListener.result[0][3], null);
  Assert.equal(abListener.result[0][4], null);
  abListener.result = [];

  // Test - delete a card

  var cardsToDelete = Cc["@mozilla.org/array;1"]
                        .createInstance(Ci.nsIMutableArray);

  cardsToDelete.appendElement(newCard);

  AB.deleteCards(cardsToDelete);

  Assert.equal(abListener.result[0][0], "onItemRemoved");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[0][2], newCard);
  abListener.result = [];

  print("Finished Cards");

  // Test - add a mailing list

  var mailList = Cc["@mozilla.org/addressbook/directoryproperty;1"]
                   .createInstance(Ci.nsIAbDirectory);

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

  AB.deleteDirectory(book);

  Assert.equal(abListener.result.length, 2);
  Assert.equal(abListener.result[0][0], "onItemRemoved");
  Assert.equal(abListener.result[0][1], AB);
  Assert.equal(abListener.result[1][0], "onItemRemoved");
  Assert.equal(abListener.result[1][1], AB);

  // Now verify the card and the directory
  card = abListener.result[0][2].QueryInterface(Ci.nsIAbCard);
  Assert.ok(card.isMailList);
  Assert.equal(card.displayName, "TestList");
  Assert.equal(card.getProperty("Notes", "BAD"), "testdescription");
  Assert.equal(card.getProperty("NickName", "BAD"), "test");

  book = abListener.result[1][2].QueryInterface(Ci.nsIAbDirectory);
  Assert.ok(book.isMailList);
  Assert.equal(book.dirName, "TestList");
  Assert.equal(book.listNickName, "test");
  Assert.equal(book.description, "testdescription");

  // Remove listener

  MailServices.ab.removeAddressBookListener(abListener);
}
