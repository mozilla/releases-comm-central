/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
let writableBook, writableCard, readOnlyBook, readOnlyCard;

add_setup(function () {
  writableBook = createAddressBook("writable book");
  writableCard = writableBook.addCard(createContact("writable", "card"));

  readOnlyBook = createAddressBook("read-only book");
  readOnlyCard = readOnlyBook.addCard(createContact("read-only", "card"));
  readOnlyBook.setBoolValue("readOnly", true);

  registerCleanupFunction(async function () {
    await promiseDirectoryRemoved(writableBook.URI);
    await promiseDirectoryRemoved(readOnlyBook.URI);
  });
});

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

/**
 * Tests than a `toAddressBook` call with no argument opens the Address Book.
 * Then call it again with the tab open and check that it doesn't reload.
 */
add_task(async function testNoAction() {
  const abWindow1 = await window.toAddressBook();
  Assert.equal(tabmail.tabInfo.length, 2);
  Assert.equal(tabmail.currentTabInfo.mode.name, "addressBookTab");
  await notInEditingMode();

  const abWindow2 = await window.toAddressBook();
  Assert.equal(tabmail.tabInfo.length, 2);
  Assert.equal(tabmail.currentTabInfo.mode.name, "addressBookTab");
  Assert.equal(
    abWindow2.browsingContext.currentWindowGlobal.innerWindowId,
    abWindow1.browsingContext.currentWindowGlobal.innerWindowId,
    "address book page did not reload"
  );
  await notInEditingMode();

  tabmail.selectTabByIndex(undefined, 1);
  const abWindow3 = await window.toAddressBook();
  Assert.equal(tabmail.tabInfo.length, 2);
  Assert.equal(tabmail.currentTabInfo.mode.name, "addressBookTab");
  Assert.equal(
    abWindow3.browsingContext.currentWindowGlobal.innerWindowId,
    abWindow1.browsingContext.currentWindowGlobal.innerWindowId,
    "address book page did not reload"
  );
  await notInEditingMode();

  await closeAddressBookWindow();
  Assert.equal(tabmail.tabInfo.length, 1);
});

/**
 * Tests than a call to toAddressBook with only a create action opens the
 * Address Book. A new blank card should open in edit mode.
 */
add_task(async function testCreateBlank() {
  await window.toAddressBook(["cmd_newCard"]);
  await inEditingMode();
  // TODO check blank
  await closeAddressBookWindow();
});

/**
 * Tests than a call to toAddressBook with a create action and an email
 * address opens the Address Book. A new card with the email address should
 * open in edit mode.
 */
add_task(async function testCreateWithAddress() {
  await window.toAddressBook(["cmd_newCard", "test@invalid"]);
  await inEditingMode();
  const abWindow = getAddressBookWindow();
  Assert.equal(
    abWindow.document.querySelector('input[type="email"]').value,
    "test@invalid",
    "Address put into editor"
  );
  await closeAddressBookWindow();
});

/**
 * Tests than a call to toAddressBook with a create action and a vCard opens
 * the Address Book. A new card should open in edit mode.
 */
add_task(async function testCreateWithVCard() {
  await window.toAddressBook([
    "cmd_newCard",
    undefined,
    "BEGIN:VCARD\r\nFN:a test person\r\nN:person;test;;a;\r\nEND:VCARD\r\n",
  ]);
  await inEditingMode();
  // TODO check card matches
  const abWindow = getAddressBookWindow();
  Assert.equal(
    abWindow.document.querySelector('input[type="email"]').value,
    "",
    "VCard provided no email address"
  );
  await closeAddressBookWindow();
});

add_task(async function testCreateWithEvent() {
  const event = new CustomEvent("dummyclick");
  await window.toAddressBook(["cmd_newCard", event]);
  await inEditingMode();
  const abWindow = getAddressBookWindow();
  Assert.equal(
    abWindow.document.querySelector('input[type="email"]').value,
    "",
    "Event not put in as address"
  );
  await closeAddressBookWindow();
});

/**
 * Tests than a call to toAddressBook with a display action opens the Address
 * Book. The card should be displayed.
 */
add_task(async function testDisplayCard() {
  await window.toAddressBook(["cmd_displayContact", writableCard]);
  checkDirectoryDisplayed(writableBook);
  await notInEditingMode();

  // let abWindow = getAddressBookWindow();
  // let h1 = abWindow.document.querySelector("h1");
  // Assert.equal(h1.textContent, "writable contact");

  await closeAddressBookWindow();
});

/**
 * Tests than a call to toAddressBook with an edit action and a writable card
 * opens the Address Book. The card should open in edit mode.
 */
add_task(async function testEditCardWritable() {
  await window.toAddressBook(["cmd_editContact", writableCard]);
  checkDirectoryDisplayed(writableBook);
  await inEditingMode();

  // let abWindow = getAddressBookWindow();
  // let h1 = abWindow.document.querySelector("h1");
  // Assert.equal(h1.textContent, "writable contact");

  await closeAddressBookWindow();
});

/**
 * Tests than a call to toAddressBook with an edit action and a read-only card
 * opens the Address Book. The card should open in display mode.
 */
add_task(async function testEditCardReadOnly() {
  await window.toAddressBook(["cmd_editContact", readOnlyCard]);
  checkDirectoryDisplayed(readOnlyBook);
  await notInEditingMode();

  // let abWindow = getAddressBookWindow();
  // let h1 = abWindow.document.querySelector("h1");
  // Assert.equal(h1.textContent, "read-only contact");

  await closeAddressBookWindow();
});
