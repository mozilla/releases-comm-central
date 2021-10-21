/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: Fix the UI so that we don't have to do this.
window.maximize();

let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");

async function inEditingMode() {
  let abWindow = getAddressBookWindow();
  let detailsPane = abWindow.document.getElementById("detailsPane");
  await TestUtils.waitForCondition(
    () => detailsPane.classList.contains("is-editing"),
    "entering editing mode"
  );
}

async function notInEditingMode() {
  let abWindow = getAddressBookWindow();
  let detailsPane = abWindow.document.getElementById("detailsPane");
  await TestUtils.waitForCondition(
    () => !detailsPane.classList.contains("is-editing"),
    "leaving editing mode"
  );
}

function checkDisplayValues(expected) {
  let abWindow = getAddressBookWindow();

  for (let [key, values] of Object.entries(expected)) {
    let list = abWindow.document.getElementById(key);
    Assert.equal(list.childElementCount, values.length);
    let items = [...list.children].map(li => li.textContent);
    Assert.deepEqual(items, values);
  }
}

function checkInputValues(expected) {
  let abWindow = getAddressBookWindow();

  for (let [key, value] of Object.entries(expected)) {
    Assert.equal(abWindow.document.getElementById(key).value, value, key);
  }
}

function checkCardValues(card, expected) {
  for (let [key, value] of Object.entries(expected)) {
    Assert.equal(card.getProperty(key, "WRONG!"), value);
  }
}

function setInputValues(changes) {
  let abWindow = getAddressBookWindow();

  for (let [key, value] of Object.entries(changes)) {
    abWindow.document.getElementById(key).select();
    if (value) {
      EventUtils.sendString(value);
    } else {
      EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
    }
  }
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
}

add_task(async function test_basic_edit() {
  let book = createAddressBook("Test Book");
  book.addCard(createContact("contact", "1"));

  let abWindow = await openAddressBookWindow();
  openDirectory(book);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let h1 = abDocument.querySelector("h1");
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  Assert.ok(detailsPane.hidden);

  // Set some values in the input fields, just to prove they are cleared.

  setInputValues({
    FirstName: "BAD VALUE!",
    LastName: "BAD VALUE!",
    PhoneticFirstName: "BAD VALUE!",
    PhoneticLastName: "BAD VALUE!",
    DisplayName: "BAD VALUE!",
    PrimaryEmail: "BAD VALUE!",
    SecondEmail: "BAD VALUE!",
  });

  // Select a card in the list. Check the display in view mode.

  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");
  // TODO change name format, check h1 changes

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_hidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  checkInputValues({
    FirstName: "contact",
    LastName: "1",
    PhoneticFirstName: "",
    PhoneticLastName: "",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: "",
  });

  // Make some changes but cancel them.

  setInputValues({
    LastName: "one",
    DisplayName: "contact one",
    SecondEmail: "i@roman.invalid",
  });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode();
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_hidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });
  checkCardValues(book.childCards[0], {
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
  });

  // Click to edit again. The changes should have been reversed.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  checkInputValues({
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: "",
  });

  // Make some changes again, and this time save them.

  setInputValues({
    LastName: "one",
    DisplayName: "contact one",
    SecondEmail: "i@roman.invalid",
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact one");

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_hidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid", "i@roman.invalid"],
  });
  checkCardValues(book.childCards[0], {
    FirstName: "contact",
    LastName: "one",
    DisplayName: "contact one",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: "i@roman.invalid",
  });

  // Click to edit again. The new values should be shown.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact one");

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  checkInputValues({
    FirstName: "contact",
    LastName: "one",
    DisplayName: "contact one",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: "i@roman.invalid",
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_special_fields() {
  Services.prefs.setStringPref("mail.addr_book.show_phonetic_fields", "true");

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let createContactButton = abDocument.getElementById("toolbarCreateContact");

  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // The order of the FirstName and LastName fields can be reversed by L10n.
  // This means they can be broken by L10n. Check that they're alright in the
  // default configuration. We need to find a more robust way of doing this,
  // but it is what it is for now.

  let firstName = abDocument.getElementById("FirstName");
  let lastName = abDocument.getElementById("LastName");
  Assert.equal(
    firstName.compareDocumentPosition(lastName),
    Node.DOCUMENT_POSITION_FOLLOWING,
    "LastName follows FirstName"
  );

  // The phonetic name fields should be visible, because the preference is set.
  // They can also be broken by L10n.

  let phoneticFirstName = abDocument.getElementById("PhoneticFirstName");
  let phoneticLastName = abDocument.getElementById("PhoneticLastName");
  Assert.ok(BrowserTestUtils.is_visible(phoneticFirstName));
  Assert.ok(BrowserTestUtils.is_visible(phoneticLastName));
  Assert.equal(
    phoneticFirstName.compareDocumentPosition(phoneticLastName),
    Node.DOCUMENT_POSITION_FOLLOWING,
    "PhoneticLastName follows PhoneticFirstName"
  );

  await closeAddressBookWindow();

  Services.prefs.setStringPref("mail.addr_book.show_phonetic_fields", "false");

  abWindow = await openAddressBookWindow();
  abDocument = abWindow.document;
  createContactButton = abDocument.getElementById("toolbarCreateContact");

  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // The phonetic name fields should be visible, because the preference is set.
  // They can also be broken by L10n.

  phoneticFirstName = abDocument.getElementById("PhoneticFirstName");
  phoneticLastName = abDocument.getElementById("PhoneticLastName");
  Assert.ok(BrowserTestUtils.is_hidden(phoneticFirstName));
  Assert.ok(BrowserTestUtils.is_hidden(phoneticLastName));

  await closeAddressBookWindow();

  Services.prefs.clearUserPref("mail.addr_book.show_phonetic_fields");
});

/**
 * Test that the display name field is populated when it should be, and not
 * when it shouldn't be.
 */
add_task(async function test_generate_display_name() {
  Services.prefs.setBoolPref("mail.addr_book.displayName.autoGeneration", true);
  Services.prefs.setStringPref(
    "mail.addr_book.displayName.lastnamefirst",
    "false"
  );

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let detailsPane = abDocument.getElementById("detailsPane");
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
  });

  // First name, no last name.
  setInputValues({ FirstName: "first" });
  checkInputValues({ DisplayName: "first" });

  // Last name, no first name.
  setInputValues({ FirstName: "", LastName: "last" });
  checkInputValues({ DisplayName: "last" });

  // Both names.
  setInputValues({ FirstName: "first" });
  checkInputValues({ DisplayName: "first last" });

  // Modify the display name, it should not be overwritten.
  setInputValues({ DisplayName: "don't touch me" });
  setInputValues({ FirstName: "second" });
  checkInputValues({ DisplayName: "don't touch me" });

  // Clear the modified display name, it can be overwritten again.
  setInputValues({ DisplayName: "" });
  setInputValues({ FirstName: "third" });
  checkInputValues({ DisplayName: "third last" });

  // Flip the order.
  Services.prefs.setStringPref(
    "mail.addr_book.displayName.lastnamefirst",
    "true"
  );
  setInputValues({ FirstName: "fourth" });
  checkInputValues({ DisplayName: "last, fourth" });

  // Turn off generation.
  Services.prefs.setBoolPref(
    "mail.addr_book.displayName.autoGeneration",
    false
  );
  setInputValues({ FirstName: "fifth" });
  checkInputValues({ DisplayName: "last, fourth" });

  // Save the card and check the values.
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();
  checkCardValues(personalBook.childCards[0], {
    FirstName: "fifth",
    LastName: "last",
    DisplayName: "last, fourth",
  });
  Assert.ok(
    !detailsPane.classList.contains("is-dirty"),
    "dirty flag is cleared"
  );

  // Reset the order and turn generation back on.
  Services.prefs.setBoolPref("mail.addr_book.displayName.autoGeneration", true);
  Services.prefs.setStringPref(
    "mail.addr_book.displayName.lastnamefirst",
    "false"
  );

  // Reload the card and check the values.
  let cardsList = abDocument.getElementById("cards");
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();
  checkInputValues({
    FirstName: "fifth",
    LastName: "last",
    DisplayName: "last, fourth",
  });

  // Check the saved name isn't overwritten.
  setInputValues({ FirstName: "first" });
  checkInputValues({ DisplayName: "last, fourth" });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode();

  await closeAddressBookWindow();
  Services.prefs.clearUserPref("mail.addr_book.displayName.autoGeneration");
  Services.prefs.clearUserPref("mail.addr_book.displayName.lastnamefirst");
  personalBook.deleteCards(personalBook.childCards);
});

/**
 * Checks that a prompt to save appears if clicking the new contact button in
 * the middle of editing.
 */
add_task(async function test_save_prompt() {
  let existingCard = personalBook.addCard(createContact("existing", "contact"));

  let abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let detailsPane = abDocument.getElementById("detailsPane");
  let editButton = abDocument.getElementById("editButton");

  Assert.ok(detailsPane.hidden);

  // Select a card in the list. Check the display in view mode.

  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(
    abWindow.detailsPane.currentCard.equals(existingCard),
    "current card is still the existing card"
  );
  checkInputValues({
    FirstName: "existing",
    LastName: "contact",
    DisplayName: "existing contact",
    PrimaryEmail: "existing.contact@invalid",
    SecondEmail: "",
  });

  // Click the new contact button. No changes have been made, so no prompt.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  Assert.equal(abWindow.detailsPane.currentCard, null, "current card is new");
  Assert.ok(detailsPane.classList.contains("is-editing"), "in editing mode");
  Assert.ok(!detailsPane.classList.contains("is-dirty"), "not marked as dirty");
  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
    PrimaryEmail: "",
    SecondEmail: "",
  });

  // Make a change.

  setInputValues({ FirstName: "unsaved" });
  Assert.ok(
    detailsPane.classList.contains("is-dirty"),
    "marked as dirty after editing one field"
  );
  setInputValues({ LastName: "contact" });

  // Click the new contact button. Cancel the prompt.

  let promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => setTimeout(resolve));

  Assert.equal(abWindow.detailsPane.currentCard, null, "current card is new");
  Assert.ok(
    detailsPane.classList.contains("is-editing"),
    "still in editing mode after cancelling a prompt"
  );
  Assert.ok(
    detailsPane.classList.contains("is-dirty"),
    "still marked as dirty after cancelling a prompt"
  );
  checkInputValues({
    FirstName: "unsaved",
    LastName: "contact",
    DisplayName: "unsaved contact",
    PrimaryEmail: "",
    SecondEmail: "",
  });
  Assert.equal(
    abDocument.activeElement.id,
    "DisplayName",
    "focus is still where it was"
  );

  // Click the new contact button. Choose "Don't Save". The fields should
  // clear and the focus return to the first field.

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await promptPromise;
  await TestUtils.waitForCondition(
    () => abDocument.activeElement.id == "FirstName",
    "focus is on the first field"
  );

  Assert.equal(abWindow.detailsPane.currentCard, null, "current card is new");
  Assert.ok(detailsPane.classList.contains("is-editing"), "in editing mode");
  Assert.ok(
    !detailsPane.classList.contains("is-dirty"),
    "dirty flag is cleared"
  );
  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
    PrimaryEmail: "",
    SecondEmail: "",
  });

  // Make a change.

  setInputValues({ FirstName: "saved" });
  Assert.ok(
    detailsPane.classList.contains("is-dirty"),
    "marked as dirty after editing one field"
  );
  setInputValues({ LastName: "contact" });

  // Click the new contact button. Accept the prompt.

  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => setTimeout(resolve));

  Assert.equal(abWindow.detailsPane.currentCard, null, "current card is new");
  Assert.ok(detailsPane.classList.contains("is-editing"), "in editing mode");
  Assert.ok(
    !detailsPane.classList.contains("is-dirty"),
    "dirty flag is cleared"
  );
  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
    PrimaryEmail: "",
    SecondEmail: "",
  });
  Assert.equal(
    abDocument.activeElement.id,
    "FirstName",
    "focus is on the first field"
  );

  // Check the card was actually saved.

  Assert.equal(personalBook.childCards.length, 2);
  Assert.equal(personalBook.childCards[1].displayName, "saved contact");

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});
