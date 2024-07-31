/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const dragService = Cc["@mozilla.org/widget/dragservice;1"].getService(
  Ci.nsIDragService
);

function doDrag(sourceIndex, destIndex, modifiers, expectedEffect) {
  const abWindow = getAddressBookWindow();
  const booksList = abWindow.document.getElementById("books");
  const cardsList = abWindow.document.getElementById("cards");

  let destElement = abWindow.document.body;
  if (destIndex !== null) {
    destElement = booksList.getRowAtIndex(destIndex);
  }

  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    cardsList.getRowAtIndex(sourceIndex),
    destElement,
    null,
    expectedEffect,
    abWindow,
    abWindow,
    modifiers
  );

  Assert.equal(dataTransfer.effectAllowed, "all");
  Assert.equal(dataTransfer.dropEffect, expectedEffect);

  return [result, dataTransfer];
}

function doDragToBooksList(sourceIndex, destIndex, modifiers, expectedEffect) {
  const abWindow = getAddressBookWindow();
  const booksList = abWindow.document.getElementById("books");

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );

  const [result, dataTransfer] = doDrag(
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

  dragService.getCurrentSession().endDragSession(true);
}

async function doDragToComposeWindow(sourceIndices, expectedPills) {
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  params.composeFields = Cc[
    "@mozilla.org/messengercompose/composefields;1"
  ].createInstance(Ci.nsIMsgCompFields);

  const composeWindowPromise = BrowserTestUtils.domWindowOpened();
  MailServices.compose.OpenComposeWindowWithParams(null, params);
  const composeWindow = await composeWindowPromise;
  await BrowserTestUtils.waitForEvent(composeWindow, "load");
  const composeDocument = composeWindow.document;
  const toAddrInput = composeDocument.getElementById("toAddrInput");
  const toAddrRow = composeDocument.getElementById("addressRowTo");

  const abWindow = getAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );

  cardsList.selectedIndices = sourceIndices;
  const [result, dataTransfer] = EventUtils.synthesizeDragOver(
    cardsList.getRowAtIndex(sourceIndices[0]),
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

  dragService.getCurrentSession().endDragSession(true);

  const pills = toAddrRow.querySelectorAll("mail-address-pill");
  Assert.equal(pills.length, expectedPills.length);
  for (let i = 0; i < expectedPills.length; i++) {
    Assert.equal(pills[i].label, expectedPills[i]);
  }

  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  composeWindow.goDoCommand("cmd_close");
  await promptPromise;
}

function checkCardsInDirectory(directory, expectedCards = [], copiedCard) {
  const actualCards = directory.childCards.slice();

  for (const card of expectedCards) {
    const index = actualCards.findIndex(c => c.UID == card.UID);
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
  const sourceBook = createAddressBook("Source Book");

  const contact1 = sourceBook.addCard(createContact("contact", "1"));
  const contact2 = sourceBook.addCard(createContact("contact", "2"));
  const contact3 = sourceBook.addCard(createContact("contact", "3"));

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");

  async function check(cards) {
    const transferCards = dataTransfer.mozGetDataAt("moz/abcard-array", 0);
    Assert.equal(transferCards.length, cards.length);
    for (const [index, card] of Object.entries(cards)) {
      Assert.ok(transferCards[index].equals(card));
    }

    const transferPlain = dataTransfer.mozGetDataAt("text/plain", 0);
    Assert.equal(
      transferPlain,
      cards.map(card => `${card.displayName} <${card.primaryEmail}>`).join(",")
    );

    for (const [index, card] of Object.entries(cards)) {
      const transferVCard = dataTransfer.mozGetDataAt("text/vcard", index);
      Assert.stringContains(transferVCard, `\r\nUID:${card.UID}\r\n`);

      const transferURL = dataTransfer.mozGetDataAt(
        "application/x-moz-file-promise-url",
        index
      );
      Assert.ok(transferURL.startsWith("data:text/vcard,BEGIN%3AVCARD%0D%0A"));

      const transferFilename = dataTransfer.mozGetDataAt(
        "application/x-moz-file-promise-dest-filename",
        index
      );
      Assert.equal(transferFilename, `${card.displayName}.vcf`);

      const flavorDataProvider = dataTransfer.mozGetDataAt(
        "application/x-moz-file-promise",
        index
      );
      Assert.ok(flavorDataProvider.QueryInterface(Ci.nsIFlavorDataProvider));

      // Create a fake nsITransferable, mimicking what happens when a dragged
      // message is dropped in a filesystem window.

      const transferable = Cc[
        "@mozilla.org/widget/transferable;1"
      ].createInstance(Ci.nsITransferable);
      transferable.init(window.docShell);

      const supportsVCard = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      supportsVCard.data = transferVCard;
      transferable.setTransferData("text/vcard", supportsVCard);

      const supportsURI = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      supportsURI.data = transferURL;
      transferable.setTransferData("text/plain", supportsURI);

      const tempFile = Services.dirsvc.get("TmpD", Ci.nsIFile);
      tempFile.append(transferFilename);
      if (tempFile.exists()) {
        tempFile.remove(false);
      }
      Assert.ok(!tempFile.exists());

      const supportsLeafName = Cc[
        "@mozilla.org/supports-string;1"
      ].createInstance(Ci.nsISupportsString);
      supportsLeafName.data = tempFile.leafName;
      transferable.setTransferData(
        "application/x-moz-file-promise-dest-filename",
        supportsLeafName
      );
      transferable.setTransferData(
        "application/x-moz-file-promise-dir",
        tempFile.parent
      );

      flavorDataProvider.getFlavorData(
        transferable,
        "application/x-moz-file-promise",
        {}
      );
      Assert.ok(tempFile.exists());

      const fileContent = await IOUtils.readUTF8(tempFile.path);
      Assert.stringContains(fileContent, `\r\nFN:${card.displayName}\r\n`);
      Assert.stringContains(fileContent, `\r\nUID:${card.UID}\r\n`);
    }
  }

  // Drag just contact1.

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  let [, dataTransfer] = doDrag(0, null, {}, "none");
  await check([contact1]);
  dragService.getCurrentSession().endDragSession(true);

  // Drag contact2 without selecting it.

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );
  [, dataTransfer] = doDrag(1, null, {}, "none");
  await check([contact2]);
  dragService.getCurrentSession().endDragSession(true);

  // Drag all contacts.

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(2),
    { shiftKey: true },
    abWindow
  );
  [, dataTransfer] = doDrag(0, null, {}, "none");
  await check([contact1, contact2, contact3]);
  dragService.getCurrentSession().endDragSession(true);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(sourceBook.URI);
});

add_task(async function test_drop_on_books_list() {
  const sourceBook = createAddressBook("Source Book");
  const sourceList = sourceBook.addMailList(createMailingList("Source List"));
  const destBook = createAddressBook("Destination Book");
  const destList = destBook.addMailList(createMailingList("Destination List"));

  const contact1 = sourceBook.addCard(createContact("contact", "1"));
  const contact2 = sourceBook.addCard(createContact("contact", "2"));
  const contact3 = sourceBook.addCard(createContact("contact", "3"));

  const abWindow = await openAddressBookWindow();
  const booksList = abWindow.document.getElementById("books");
  const cardsList = abWindow.document.getElementById("cards");

  checkCardsInDirectory(sourceBook, [contact1, contact2, contact3, sourceList]);
  checkCardsInDirectory(sourceList);
  checkCardsInDirectory(destBook, [destList]);
  checkCardsInDirectory(destList);

  Assert.equal(booksList.rowCount, 7);
  await openDirectory(sourceBook);

  // Check drag effect set correctly for dragging a card.

  Assert.equal(cardsList.view.rowCount, 4);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );

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

  dragService.getCurrentSession().endDragSession(true);

  // Check drag effect set correctly for dragging a list.

  Assert.equal(cardsList.view.rowCount, 4);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(3), {}, abWindow);

  dragService.startDragSessionForTests(
    abWindow,
    Ci.nsIDragService.DRAGDROP_ACTION_NONE
  );

  doDrag(3, 0, {}, "none"); // All Address Books
  doDrag(3, 0, { ctrlKey: true }, "none");

  doDrag(3, 1, {}, "none"); // Personal Address Book
  doDrag(3, 1, { ctrlKey: true }, "none");

  doDrag(3, 2, {}, "none"); // Destination Book
  doDrag(3, 2, { ctrlKey: true }, "none");

  doDrag(3, 3, {}, "none"); // Destination List
  doDrag(3, 3, { ctrlKey: true }, "none");

  doDrag(3, 4, {}, "none"); // Source Book
  doDrag(3, 4, { ctrlKey: true }, "none");

  doDrag(3, 5, {}, "none"); // Source List
  doDrag(3, 5, { ctrlKey: true }, "none");

  doDrag(3, 6, {}, "none"); // Collected Addresses
  doDrag(3, 6, { ctrlKey: true }, "none");

  dragService.getCurrentSession().endDragSession(true);

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

  // Drag contact2 to the book it's already in. Nothing should happen.
  // This test doesn't actually catch the bug it was written for, but maybe
  // one day it will catch something.

  await openDirectory(destBook);
  Assert.equal(cardsList.view.rowCount, 3);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  doDragToBooksList(0, 2, {}, "none");
  checkCardsInDirectory(destBook, [contact2, contact3, destList]);

  // Drag destList to the book it's already in. Nothing should happen.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  doDragToBooksList(2, 2, {}, "none");
  checkCardsInDirectory(destBook, [contact2, contact3, destList]);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(sourceBook.URI);
  await promiseDirectoryRemoved(destBook.URI);
});

add_task(async function test_drop_on_compose() {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
  });

  const sourceBook = createAddressBook("Source Book");
  const sourceList = sourceBook.addMailList(createMailingList("Source List"));

  const contact1 = sourceBook.addCard(createContact("contact", "1"));
  const contact2 = sourceBook.addCard(createContact("contact", "2"));
  const contact3 = sourceBook.addCard(createContact("contact", "3"));
  sourceList.addCard(contact1);
  sourceList.addCard(contact2);
  sourceList.addCard(contact3);

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.document.getElementById("cards");
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
    ["contact 3 <contact.3@invalid>", `Source List <"Source List">`]
  );

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(sourceBook.URI);
});
