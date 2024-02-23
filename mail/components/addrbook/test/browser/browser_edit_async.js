/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { CardDAVDirectory } = ChromeUtils.importESModule(
  "resource:///modules/CardDAVDirectory.sys.mjs"
);
const { CardDAVServer } = ChromeUtils.import(
  "resource://testing-common/CardDAVServer.jsm"
);

let book;

async function inEditingMode() {
  const abWindow = getAddressBookWindow();
  await TestUtils.waitForCondition(
    () => abWindow.detailsPane.isEditing,
    "entering editing mode"
  );
}

async function notInEditingMode() {
  const abWindow = getAddressBookWindow();
  await TestUtils.waitForCondition(
    () => !abWindow.detailsPane.isEditing,
    "leaving editing mode"
  );
}

add_setup(async function () {
  CardDAVServer.open("alice", "alice");

  book = createAddressBook(
    "CardDAV Book",
    Ci.nsIAbManager.CARDDAV_DIRECTORY_TYPE
  );
  book.setIntValue("carddav.syncinterval", 0);
  book.setStringValue("carddav.url", CardDAVServer.url);
  book.setStringValue("carddav.username", "alice");

  const loginInfo = Cc["@mozilla.org/login-manager/loginInfo;1"].createInstance(
    Ci.nsILoginInfo
  );
  loginInfo.init(CardDAVServer.origin, null, "test", "alice", "alice", "", "");
  await Services.logins.addLoginAsync(loginInfo);
});

registerCleanupFunction(async function () {
  await promiseDirectoryRemoved(book.URI);
  CardDAVServer.close();
  CardDAVServer.reset();
  CardDAVServer.modifyCardOnPut = false;
});

/**
 * Test the UI as we create/modify/delete a card and wait for responses from
 * the server.
 */
add_task(async function testCreateCard() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  const bookRow = abWindow.booksList.getRowForUID(book.UID);
  const searchInput = abDocument.getElementById("searchInput");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");
  const deleteButton = abDocument.getElementById("detailsDeleteButton");

  openDirectory(book);

  // First, create a new contact.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  abWindow.detailsPane.vCardEdit.displayName.value = "new contact";

  // Saving the contact will get an immediate notification.
  // Delay the server response so we can test the state of the UI.
  const promise1 = TestUtils.topicObserved("addrbook-contact-created");
  CardDAVServer.responseDelay = Promise.withResolvers();
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await promise1;
  await notInEditingMode();
  Assert.ok(bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Now allow the server to respond and check the UI state again.
  const promise2 = TestUtils.topicObserved("addrbook-contact-updated");
  CardDAVServer.responseDelay.resolve();
  await promise2;
  Assert.ok(!bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Edit the contact.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  abWindow.detailsPane.vCardEdit.displayName.value = "edited contact";

  // Saving the contact will get an immediate notification.
  // Delay the server response so we can test the state of the UI.
  const promise3 = TestUtils.topicObserved("addrbook-contact-updated");
  CardDAVServer.responseDelay = Promise.withResolvers();
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await promise3;
  await notInEditingMode();
  Assert.ok(bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Now allow the server to respond and check the UI state again.
  const promise4 = TestUtils.topicObserved("addrbook-contact-updated");
  CardDAVServer.responseDelay.resolve();
  await promise4;
  Assert.ok(!bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Delete the contact.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Saving the contact will get an immediate notification.
  // Delay the server response so we can test the state of the UI.
  const promise5 = TestUtils.topicObserved("addrbook-contact-deleted");
  CardDAVServer.responseDelay = Promise.withResolvers();
  BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, abWindow);
  await promise5;
  await notInEditingMode();
  Assert.ok(bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, searchInput);
  Assert.ok(BrowserTestUtils.isHidden(editButton));

  // Now allow the server to respond and check the UI state again.
  CardDAVServer.responseDelay.resolve();
  await TestUtils.waitForCondition(
    () => !bookRow.classList.contains("requesting")
  );

  await closeAddressBookWindow();
});

/**
 * Test the UI as we create a card and wait for responses from the server.
 * In this test the server will assign the card a new UID, which means the
 * client code has to do things differently, but the UI should behave as it
 * did in the previous test.
 */
add_task(async function testCreateCardWithUIDChange() {
  CardDAVServer.modifyCardOnPut = true;

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  const bookRow = abWindow.booksList.getRowForUID(book.UID);
  const searchInput = abDocument.getElementById("searchInput");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");
  const deleteButton = abDocument.getElementById("detailsDeleteButton");

  openDirectory(book);

  // First, create a new contact.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  abWindow.detailsPane.vCardEdit.displayName.value = "new contact";

  // Saving the contact will get an immediate notification.
  // Delay the server response so we can test the state of the UI.
  const promise1 = TestUtils.topicObserved("addrbook-contact-created");
  CardDAVServer.responseDelay = Promise.withResolvers();
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await promise1;
  await notInEditingMode();
  Assert.ok(bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  const initialCard = abWindow.detailsPane.currentCard;
  Assert.equal(initialCard.getProperty("_href", "RIGHT"), "RIGHT");

  // Now allow the server to respond and check the UI state again.
  const promise2 = TestUtils.topicObserved("addrbook-contact-created");
  const promise3 = TestUtils.topicObserved("addrbook-contact-deleted");
  CardDAVServer.responseDelay.resolve();
  const [changedCard] = await promise2;
  const [deletedCard] = await promise3;
  Assert.ok(!bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, editButton);
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  Assert.equal(changedCard.UID, [...initialCard.UID].reverse().join(""));
  Assert.equal(
    changedCard.getProperty("_originalUID", "WRONG"),
    initialCard.UID
  );
  Assert.equal(deletedCard.UID, initialCard.UID);

  const displayedCard = abWindow.detailsPane.currentCard;
  Assert.equal(displayedCard.directoryUID, book.UID);
  Assert.notEqual(displayedCard.getProperty("_href", "WRONG"), "WRONG");
  Assert.equal(displayedCard.UID, [...initialCard.UID].reverse().join(""));

  // Delete the contact. This would fail if the UI hadn't been updated.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Saving the contact will get an immediate notification.
  // Delay the server response so we can test the state of the UI.
  const promise4 = TestUtils.topicObserved("addrbook-contact-deleted");
  CardDAVServer.responseDelay = Promise.withResolvers();
  BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, abWindow);
  await promise4;
  await notInEditingMode();
  Assert.ok(bookRow.classList.contains("requesting"));
  Assert.equal(abDocument.activeElement, searchInput);
  Assert.ok(BrowserTestUtils.isHidden(editButton));

  // Now allow the server to respond and check the UI state again.
  CardDAVServer.responseDelay.resolve();
  await TestUtils.waitForCondition(
    () => !bookRow.classList.contains("requesting")
  );

  await closeAddressBookWindow();
  CardDAVServer.modifyCardOnPut = false;
});

/**
 * Test that a modification to the card being edited causes a prompt to appear
 * when saving the card.
 */
add_task(async function testModificationUpdatesUI() {
  let card = personalBook.addCard(createContact("a", "person"));

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const contactName = abDocument.getElementById("viewContactName");
  const editButton = abDocument.getElementById("editButton");
  const emailAddressesSection = abDocument.getElementById("emailAddresses");
  const saveEditButton = abDocument.getElementById("saveEditButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");

  openDirectory(personalBook);
  Assert.equal(cardsList.view.rowCount, 1);

  // Display a card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  Assert.equal(contactName.textContent, "a person");
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
  let items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(items[0].querySelector("a").textContent, "a.person@invalid");

  // Modify the card and check the display is updated.

  const updatePromise = BrowserTestUtils.waitForMutationCondition(
    detailsPane,
    { childList: true, subtree: true },
    () => true
  );
  card.vCardProperties.addValue("email", "person.a@lastfirst.invalid");
  personalBook.modifyCard(card);

  await updatePromise;
  Assert.equal(contactName.textContent, "a person");
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
  items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 2);
  Assert.equal(items[0].querySelector("a").textContent, "a.person@invalid");
  Assert.equal(
    items[1].querySelector("a").textContent,
    "person.a@lastfirst.invalid"
  );

  // Enter edit mode. Clear one of the email addresses.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();
  Assert.equal(abWindow.detailsPane.vCardEdit.displayName.value, "a person");
  abDocument.querySelector(`#vcard-email tr input[type="email"]`).value = "";

  // Modify the card. Nothing should happen at this point.

  card.displayName = "a different person";
  personalBook.modifyCard(card);

  // Click to save.

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  [card] = personalBook.childCards;
  Assert.equal(
    card.displayName,
    "a person",
    "programmatic changes were overwritten"
  );
  Assert.deepEqual(
    card.emailAddresses,
    ["person.a@lastfirst.invalid"],
    "UI changes were saved"
  );

  Assert.equal(contactName.textContent, "a person");
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
  items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].querySelector("a").textContent,
    "person.a@lastfirst.invalid"
  );

  // Enter edit mode again. Change the display name.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();
  abWindow.detailsPane.vCardEdit.displayName.value = "a changed person";

  // Modify the card. Nothing should happen at this point.

  card.displayName = "a different person";
  card.vCardProperties.addValue("email", "a.person@invalid");
  personalBook.modifyCard(card);

  // Click to cancel. The modified card should be shown.

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode();

  Assert.equal(contactName.textContent, "a different person");
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
  items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 2);
  Assert.equal(
    items[0].querySelector("a").textContent,
    "person.a@lastfirst.invalid"
  );
  Assert.equal(items[1].querySelector("a").textContent, "a.person@invalid");

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});
