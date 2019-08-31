/* This file is testing that the UUID semantics of cards and directories match
 * the guarantees of their documented requirements.
 */

/**
 * Checks that the directory follows the contract for UUIDs.
 *
 * If the directory is modifiable, it will be modified, although the net effect
 * will not change the state if the code works properly.
 */
function check_directory(directory) {
  var prefId = directory.dirPrefId + "&" + directory.dirName;

  var testModification = !directory.readOnly;
  dump("Testing " + prefId);
  if (testModification) {
    dump(" (with modifications)");
  }
  dump("...\n");

  // Question 1: Is the UUID the preference ID?
  Assert.equal(prefId, directory.uuid);

  // Now we need to run through the cards, checking that each card meets the
  // requirements.
  var seenIds = [],
    cards = [];
  var enumerator = directory.childCards;
  while (enumerator.hasMoreElements()) {
    let card = enumerator.getNext().QueryInterface(Ci.nsIAbCard);
    cards.push(card);

    // Question 2.1: Is the directory ID correct?
    Assert.equal(prefId, card.directoryId);

    // Question 2.2: Is the local ID unique and valid?
    Assert.notEqual(card.localId, "");
    Assert.equal(seenIds.indexOf(card.localId), -1);
    seenIds.push(card.localId);

    // Question 2.3: Is the format equal to generateUUID?
    Assert.equal(card.uuid, MailServices.ab.generateUUID(prefId, card.localId));
  }

  // Question 3: Do cards returned via searches return UUIDs correctly?
  var uri = directory.URI;
  uri += "?(or(DisplayName,=,a)(DisplayName,!=,a))";
  let search = MailServices.ab.getDirectory(uri);

  enumerator = search.childCards;
  while (enumerator.hasMoreElements()) {
    let card = enumerator.getNext().QueryInterface(Ci.nsIAbCard);

    // Question 3.1: Is the directory ID correct?
    Assert.equal(prefId, card.directoryId);

    // Question 3.2: Is the local ID valid?
    Assert.notEqual(card.localId, "");

    // Question 3.3: Is the format equal to generateUUID?
    Assert.equal(card.uuid, MailServices.ab.generateUUID(prefId, card.localId));
  }

  // The remaining tests deal with modification of address books.
  if (!testModification) {
    return;
  }

  // Question 4: Does adding a new card properly set the UUID?
  var newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  newCard.displayName = "Test User";
  newCard.primaryEmail = "user1@test.invalid";
  newCard.firstName = "Test";
  newCard.lastName = "User";

  newCard = directory.addCard(newCard);
  Assert.equal(newCard.directoryId, prefId);
  Assert.notEqual(newCard.localId, "");
  Assert.equal(seenIds.indexOf(newCard.localId), -1);

  // Remove the new card to be stable!
  var array = Cc["@mozilla.org/array;1"].createInstance(Ci.nsIMutableArray);
  array.appendElement(newCard);
  directory.deleteCards(array);

  // We need to iterate over the array of cards to avoid any problems if someone
  // makes the childCards enumerator reflect changes to directory...
  for (let card of cards) {
    // Question 5.1: Does deleting a card properly set the uids?
    var localId = card.localId;
    array.clear();
    array.appendElement(card);
    directory.deleteCards(array);
    Assert.equal(card.directoryId, "");
    Assert.equal(card.localId, localId);

    // Question 5.2: Does readding a card try to best-fit the uid?
    card = directory.addCard(card);
    Assert.equal(card.directoryId, prefId);
    Assert.equal(card.localId, localId);
  }
}

function run_test() {
  loadABFile("data/cardForEmail", kPABData.fileName);

  // Step 1: What is the ID of an empty card?
  var newCard = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
    Ci.nsIAbCard
  );
  Assert.equal(newCard.uuid, "");
  Assert.equal(newCard.directoryId, "");
  Assert.equal(newCard.localId, "");

  // Step 2: Check the directories
  let dirs = MailServices.ab.directories;
  while (dirs.hasMoreElements()) {
    let directory = dirs.getNext().QueryInterface(Ci.nsIAbDirectory);
    check_directory(directory);
  }
}
