/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

function doDrag(sourceIndex, destIndex, modifiers, expectedEffect) {
  let abWindow = getAddressBookWindow();
  let booksList = abWindow.document.getElementById("books");
  let cardsList = abWindow.document.getElementById("cards");

  let destElement = abWindow.document.body;
  if (destIndex !== null) {
    destElement = booksList.getRowAtIndex(destIndex);
  }

  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    cardsList.getRowAtIndex(sourceIndex),
    destElement,
    null,
    null,
    abWindow,
    abWindow,
    modifiers
  );

  Assert.equal(dataTransfer.effectAllowed, "all");
  Assert.equal(dataTransfer.dropEffect, expectedEffect);

  return [result, dataTransfer];
}

function doDragToBooksList(sourceIndex, destIndex, modifiers, expectedEffect) {
  let abWindow = getAddressBookWindow();
  let booksList = abWindow.document.getElementById("books");

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  let [result, dataTransfer] = doDrag(
    sourceIndex,
    destIndex,
    modifiers,
    expectedEffect
  );

  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    booksList.getRowAtIndex(destIndex),
    abWindow,
    modifiers
  );

  dragService.endDragSession(true);
}

async function doDragToComposeWindow(sourceIndicies, expectedPills) {
  let params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  let composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");
  let composeDocument = composeWindow.document;
  let toAddrInput = composeDocument.getElementById("toAddrInput");
  let toAddrRow = composeDocument.getElementById("addressRowTo");

  let abWindow = getAddressBookWindow();
  let cardsList = abWindow.document.getElementById("cards");

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  cardsList.selectedIndicies = sourceIndicies;
  let [result, dataTransfer] = EventUtils.synthesizeDragOver(
    cardsList.getRowAtIndex(sourceIndicies[0]),
    toAddrInput,
    null,
    null,
    abWindow,
    composeWindow
  );
  EventUtils.synthesizeDropAfterDragOver(
    result,
    dataTransfer,
    toAddrInput,
    composeWindow
  );

  dragService.endDragSession(true);

  let pills = toAddrRow.querySelectorAll("mail-address-pill");
  Assert.equal(pills.length, expectedPills.length);
  for (let i = 0; i < expectedPills.length; i++) {
    Assert.equal(pills[i].label, expectedPills[i]);
  }

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  composeWindow.goDoCommand("cmd_close");
  await promptPromise;
}

function checkCardsInDirectory(directory, expectedCards = [], copiedCard) {
  let actualCards = directory.childCards.slice();

  for (let card of expectedCards) {
    let index = actualCards.findIndex(c => c.UID == card.UID);
    Assert.greaterOrEqual(index, 0);
    actualCards.splice(index, 1);
  }

  if (copiedCard) {
    Assert.equal(actualCards.length, 1);
    Assert.equal(actualCards[0].firstName, copiedCard.firstName);
    Assert.equal(actualCards[0].lastName, copiedCard.lastName);
    Assert.equal(actualCards[0].primaryEmail, copiedCard.primaryEmail);
    Assert.notEqual(actualCards[0].UID, copiedCard.UID);
  } else {
    Assert.equal(actualCards.length, 0);
  }
}

add_task(async function test_drag() {
  let sourceBook = createAddressBook("Source Book");

  let contact1 = sourceBook.addCard(createContact("contact", "1"));
  let contact2 = sourceBook.addCard(createContact("contact", "2"));
  let contact3 = sourceBook.addCard(createContact("contact", "3"));

  let abWindow = await openAddressBookWindow();
  let cardsList = abWindow.document.getElementById("cards");

  // Drag just contact1.

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  let [, dataTransfer] = doDrag(0, null, {}, "none");

  let transferCards = dataTransfer.mozGetDataAt("moz/abcard-array", 0);
  Assert.equal(transferCards.length, 1);
  Assert.ok(transferCards[0].equals(contact1));

  let transferUnicode = dataTransfer.getData("text/unicode");
  Assert.equal(transferUnicode, "contact 1 <contact.1@invalid>");

  let transferVCard = dataTransfer.getData("text/vcard");
  Assert.stringContains(transferVCard, `\r\nUID:${contact1.UID}\r\n`);

  dragService.endDragSession(true);

  // Drag all contacts.

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(2),
    { shiftKey: true },
    abWindow
  );
  [, dataTransfer] = doDrag(0, null, {}, "none");

  transferCards = dataTransfer.mozGetDataAt("moz/abcard-array", 0);
  Assert.equal(transferCards.length, 3);
  Assert.ok(transferCards[0].equals(contact1));
  Assert.ok(transferCards[1].equals(contact2));
  Assert.ok(transferCards[2].equals(contact3));

  transferUnicode = dataTransfer.getData("text/unicode");
  Assert.equal(
    transferUnicode,
    "contact 1 <contact.1@invalid>,contact 2 <contact.2@invalid>,contact 3 <contact.3@invalid>"
  );

  transferVCard = dataTransfer.getData("text/vcard");
  Assert.stringContains(transferVCard, `\r\nUID:${contact1.UID}\r\n`);

  dragService.endDragSession(true);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(sourceBook.URI);
});

add_task(async function test_drop_on_books_list() {
  let sourceBook = createAddressBook("Source Book");
  let sourceList = sourceBook.addMailList(createMailingList("Source List"));
  let destBook = createAddressBook("Destination Book");
  let destList = destBook.addMailList(createMailingList("Destination List"));

  let contact1 = sourceBook.addCard(createContact("contact", "1"));
  let contact2 = sourceBook.addCard(createContact("contact", "2"));
  let contact3 = sourceBook.addCard(createContact("contact", "3"));

  let abWindow = await openAddressBookWindow();
  let booksList = abWindow.document.getElementById("books");
  let cardsList = abWindow.document.getElementById("cards");

  checkCardsInDirectory(sourceBook, [contact1, contact2, contact3, sourceList]);
  checkCardsInDirectory(sourceList);
  checkCardsInDirectory(destBook, [destList]);
  checkCardsInDirectory(destList);

  Assert.equal(booksList.rowCount, 7);
  openDirectory(sourceBook);

  // Check drag effect set correctly for dragging a card.

  Assert.equal(cardsList.view.rowCount, 4);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  doDrag(0, 0, {}, "none"); // All Address Books
  doDrag(0, 0, { ctrlKey: true }, "none");

  doDrag(0, 1, {}, "move"); // Personal Address Book
  doDrag(0, 1, { ctrlKey: true }, "copy");

  doDrag(0, 2, {}, "move"); // Destination Book
  doDrag(0, 2, { ctrlKey: true }, "copy");

  doDrag(0, 3, {}, "none"); // Destination List
  doDrag(0, 3, { ctrlKey: true }, "none");

  doDrag(0, 4, {}, "none"); // Source Book
  doDrag(0, 4, { ctrlKey: true }, "none");

  doDrag(0, 5, {}, "link"); // Source List
  doDrag(0, 5, { ctrlKey: true }, "link");

  doDrag(0, 6, {}, "move"); // Collected Addresses
  doDrag(0, 6, { ctrlKey: true }, "copy");

  dragService.endDragSession(true);

  // Check drag effect set correctly for dragging a list.

  Assert.equal(cardsList.view.rowCount, 4);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(3), {}, abWindow);

  dragService.startDragSessionForTests(Ci.nsIDragService.DRAGDROP_ACTION_NONE);

  doDrag(0, 0, {}, "none"); // All Address Books
  doDrag(0, 0, { ctrlKey: true }, "none");

  doDrag(0, 1, {}, "none"); // Personal Address Book
  doDrag(0, 1, { ctrlKey: true }, "none");

  doDrag(0, 2, {}, "none"); // Destination Book
  doDrag(0, 2, { ctrlKey: true }, "none");

  doDrag(0, 3, {}, "none"); // Destination List
  doDrag(0, 3, { ctrlKey: true }, "none");

  doDrag(0, 4, {}, "none"); // Source Book
  doDrag(0, 4, { ctrlKey: true }, "none");

  doDrag(0, 5, {}, "none"); // Source List
  doDrag(0, 5, { ctrlKey: true }, "none");

  doDrag(0, 6, {}, "none"); // Collected Addresses
  doDrag(0, 6, { ctrlKey: true }, "none");

  dragService.endDragSession(true);

  // Drag contact1 into sourceList.

  Assert.equal(cardsList.view.rowCount, 4);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);

  doDragToBooksList(0, 5, {}, "link");
  checkCardsInDirectory(sourceBook, [contact1, contact2, contact3, sourceList]);
  checkCardsInDirectory(sourceList, [contact1]);

  // Drag contact1 into destList. Nothing should happen.

  doDragToBooksList(0, 3, {}, "none");
  checkCardsInDirectory(sourceBook, [contact1, contact2, contact3, sourceList]);
  checkCardsInDirectory(destBook, [destList]);
  checkCardsInDirectory(destList);

  // Drag contact1 into destBook. It should be moved into destBook.

  doDragToBooksList(0, 2, {}, "move");
  checkCardsInDirectory(sourceBook, [contact2, contact3, sourceList]);
  checkCardsInDirectory(sourceList);
  checkCardsInDirectory(destBook, [contact1, destList]);

  // Drag contact2 into destBook with Ctrl pressed.
  // It should be copied into destBook.

  Assert.equal(cardsList.view.rowCount, 3);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);

  doDragToBooksList(0, 2, { ctrlKey: true }, "copy");
  checkCardsInDirectory(sourceBook, [contact2, contact3, sourceList]);
  checkCardsInDirectory(destBook, [contact1, destList], contact2);
  checkCardsInDirectory(destList);

  // Delete the cards from destBook as it's confusing.

  destBook.deleteCards(destBook.childCards.filter(c => !c.isMailList));
  checkCardsInDirectory(destBook, [destList]);

  // Drag contact2 and contact3 to destBook.

  Assert.equal(cardsList.view.rowCount, 3);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(1),
    { shiftKey: true },
    abWindow
  );

  doDragToBooksList(0, 2, {}, "move");
  checkCardsInDirectory(sourceBook, [sourceList]);
  checkCardsInDirectory(destBook, [contact2, contact3, destList]);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(sourceBook.URI);
  await promiseDirectoryRemoved(destBook.URI);
});

add_task(async function test_drop_on_compose() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
  });

  let sourceBook = createAddressBook("Source Book");
  let sourceList = sourceBook.addMailList(createMailingList("Source List"));

  let contact1 = sourceBook.addCard(createContact("contact", "1"));
  let contact2 = sourceBook.addCard(createContact("contact", "2"));
  let contact3 = sourceBook.addCard(createContact("contact", "3"));
  sourceList.addCard(contact1);
  sourceList.addCard(contact2);
  sourceList.addCard(contact3);

  let abWindow = await openAddressBookWindow();
  let cardsList = abWindow.document.getElementById("cards");
  Assert.equal(cardsList.view.rowCount, 4);

  // One contact.

  await doDragToComposeWindow([0], ["contact 1 <contact.1@invalid>"]);

  // Multiple contacts.

  await doDragToComposeWindow(
    [0, 1, 2],
    [
      "contact 1 <contact.1@invalid>",
      "contact 2 <contact.2@invalid>",
      "contact 3 <contact.3@invalid>",
    ]
  );

  // A mailing list.

  await doDragToComposeWindow([3], [`Source List <"Source List">`]);

  // A mailing list and a contact.

  await doDragToComposeWindow(
    [3, 2],
    [`Source List <"Source List">`, "contact 3 <contact.3@invalid>"]
  );

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(sourceBook.URI);
});
