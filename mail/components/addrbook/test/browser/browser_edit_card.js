/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: Fix the UI so that we don't have to do this.
window.maximize();

let toolbarButtonIDs = [
  "toolbarCreateBook",
  "toolbarCreateContact",
  "toolbarCreateList",
  "toolbarImport",
];

async function inEditingMode() {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  await TestUtils.waitForCondition(
    () => abWindow.detailsPane.isEditing,
    "entering editing mode"
  );

  Assert.ok(
    BrowserTestUtils.is_visible(
      abDocument.getElementById("detailsPaneBackdrop")
    ),
    "backdrop should be visible"
  );
  checkToolbarState([]);
}

async function notInEditingMode(enabledToolbarIDs = toolbarButtonIDs) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  await TestUtils.waitForCondition(
    () => !abWindow.detailsPane.isEditing,
    "leaving editing mode"
  );

  Assert.ok(
    BrowserTestUtils.is_hidden(
      abDocument.getElementById("detailsPaneBackdrop")
    ),
    "backdrop should be hidden"
  );
  checkToolbarState(enabledToolbarIDs);
}

function getInput(entryName, addIfNeeded = false) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;
  let vCardEdit = abDocument.querySelector("vcard-edit");

  switch (entryName) {
    case "DisplayName":
      return abDocument.getElementById("displayName");
    case "FirstName":
      return abDocument.querySelector("vcard-n #vcard-n-firstname");
    case "LastName":
      return abDocument.querySelector("vcard-n #vcard-n-lastname");
    case "PrimaryEmail":
      if (
        addIfNeeded &&
        abDocument.querySelectorAll(`tr[slot="v-email"]`).length < 1
      ) {
        EventUtils.synthesizeMouseAtCenter(
          vCardEdit.shadowRoot.getElementById("vcard-add-email"),
          {},
          abWindow
        );
      }
      return abDocument.querySelector(
        `tr[slot="v-email"]:nth-of-type(1) input[type="email"]`
      );
    case "SecondEmail":
      if (
        addIfNeeded &&
        abDocument.querySelectorAll(`tr[slot="v-email"]`).length < 2
      ) {
        EventUtils.synthesizeMouseAtCenter(
          vCardEdit.shadowRoot.getElementById("vcard-add-email"),
          {},
          abWindow
        );
      }
      return abDocument.querySelector(
        `tr[slot="v-email"]:nth-of-type(2) input[type="email"]`
      );
  }

  return null;
}

function checkToolbarState(enabledToolbarIDs) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  for (let id of toolbarButtonIDs) {
    let shouldBeDisabled = !enabledToolbarIDs.includes(id);
    Assert.equal(
      abDocument.getElementById(id).disabled,
      shouldBeDisabled,
      id + (shouldBeDisabled ? " should" : " should not") + " be disabled"
    );
  }
}

function checkDisplayValues(expected) {
  let abWindow = getAddressBookWindow();

  for (let [key, values] of Object.entries(expected)) {
    let section = abWindow.document.getElementById(key);
    let items = Array.from(
      section.querySelectorAll("li .entry-value"),
      li => li.textContent
    );
    Assert.deepEqual(items, values);
  }
}

function checkInputValues(expected) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  if ("DisplayName" in expected) {
    Assert.ok(BrowserTestUtils.is_hidden(abDocument.querySelector("h1")));
  }

  for (let [key, value] of Object.entries(expected)) {
    let input = getInput(key, !!value);
    if (!input) {
      Assert.ok(!value, `${key} input exists to put a value in`);
      continue;
    }

    Assert.ok(BrowserTestUtils.is_visible(input));
    Assert.equal(input.value, value, `${key} value`);
  }
}

function checkCardValues(card, expected) {
  for (let [key, value] of Object.entries(expected)) {
    if (value) {
      Assert.equal(
        card.getProperty(key, "WRONG!"),
        value,
        `${key} has the right value`
      );
    } else {
      Assert.equal(
        card.getProperty(key, "RIGHT!"),
        "RIGHT!",
        `${key} has no value`
      );
    }
  }
}

function setInputValues(changes) {
  let abWindow = getAddressBookWindow();

  for (let [key, value] of Object.entries(changes)) {
    let input = getInput(key, !!value);
    if (!input) {
      Assert.ok(!value, `${key} input exists to put a value in`);
      continue;
    }

    input.select();
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
  let booksList = abDocument.getElementById("books");
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let h1 = abDocument.querySelector("h1");
  let displayName = abDocument.getElementById("displayName");
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  Assert.ok(detailsPane.hidden);

  // Set some values in the input fields, just to prove they are cleared.

  setInputValues({
    DisplayName: "BAD VALUE!",
  });
  Assert.ok(!document.querySelector("vcard-n"));
  Assert.ok(!document.querySelector(`tr[slot="v-email"]`));

  // Select a card in the list. Check the display in view mode.

  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");
  Assert.ok(BrowserTestUtils.is_hidden(displayName));

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_hidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Check that pressing Tab can't get us stuck on an element that shouldn't
  // have focus.

  abDocument.documentElement.focus();
  Assert.equal(
    abDocument.activeElement,
    abDocument.documentElement,
    "focus should be on the root element"
  );
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
  Assert.ok(
    abDocument.activeElement.matches("#detailsInner *"),
    "focus should be on the editing form"
  );
  EventUtils.synthesizeKey("VK_TAB", { shiftKey: true }, abWindow);
  Assert.equal(
    abDocument.activeElement,
    abDocument.documentElement,
    "focus should be on the root element again"
  );

  // Check that clicking outside the form doesn't steal focus.

  EventUtils.synthesizeMouseAtCenter(booksList, {}, abWindow);
  Assert.equal(
    abDocument.activeElement,
    abDocument.body,
    "focus should be on the body element"
  );
  EventUtils.synthesizeMouseAtCenter(cardsList, {}, abWindow);
  Assert.equal(
    abDocument.activeElement,
    abDocument.body,
    "focus should be on the body element still"
  );

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  checkInputValues({
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: null,
  });

  // Make some changes but cancel them.

  setInputValues({
    LastName: "one",
    DisplayName: "contact one",
    SecondEmail: "i@roman.invalid",
  });

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await notInEditingMode();
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  Assert.ok(BrowserTestUtils.is_visible(h1));
  Assert.equal(h1.textContent, "contact 1");
  Assert.ok(BrowserTestUtils.is_hidden(displayName));

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

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  checkInputValues({
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: null,
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
  Assert.ok(BrowserTestUtils.is_hidden(displayName));

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

  // Cancel the edit by pressing the Escape key.

  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await notInEditingMode();

  // Click to edit again. This time make some changes.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  setInputValues({
    FirstName: "person",
    DisplayName: "person one",
  });

  // Cancel the edit by pressing the Escape key and cancel the prompt.

  promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  Assert.ok(
    abWindow.detailsPane.isEditing,
    "still editing after cancelling prompt"
  );

  // Cancel the edit by pressing the Escape key and accept the prompt.

  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await promptPromise;
  await notInEditingMode();
  await new Promise(resolve => abWindow.setTimeout(resolve));

  checkCardValues(book.childCards[0], {
    FirstName: "person",
    DisplayName: "person one",
  });

  // Click to edit again.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  setInputValues({
    LastName: "11",
    DisplayName: "person 11",
    SecondEmail: "xi@roman.invalid",
  });

  // Cancel the edit by pressing the Escape key and discard the changes.

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeKey("VK_ESCAPE", {}, abWindow);
  await promptPromise;
  await notInEditingMode();
  await new Promise(resolve => abWindow.setTimeout(resolve));

  checkCardValues(book.childCards[0], {
    FirstName: "person",
    DisplayName: "person one",
  });

  // Click to edit again.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Make some changes again, and this time save them by pressing Enter.

  setInputValues({
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    SecondEmail: null,
  });

  getInput("SecondEmail").focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, abWindow);
  await notInEditingMode();

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });
  checkCardValues(book.childCards[0], {
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: null,
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
}).skip(); // Phonetic fields not implemented.

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
  let cardsList = abDocument.getElementById("cards");
  let displayName = abDocument.getElementById("displayName");
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
  await TestUtils.waitForCondition(() => displayName.value != "last");
  checkInputValues({ DisplayName: "first last" });

  // Modify the display name, it should not be overwritten.
  setInputValues({ DisplayName: "don't touch me" });
  setInputValues({ FirstName: "second" });
  checkInputValues({ DisplayName: "don't touch me" });

  // Clear the modified display name, it can be overwritten again.
  setInputValues({ DisplayName: "" });
  setInputValues({ FirstName: "third" });
  await TestUtils.waitForCondition(() => displayName.value != "");
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
  Assert.ok(!abWindow.detailsPane.isDirty, "dirty flag is cleared");

  // Reset the order and turn generation back on.
  Services.prefs.setBoolPref("mail.addr_book.displayName.autoGeneration", true);
  Services.prefs.setStringPref(
    "mail.addr_book.displayName.lastnamefirst",
    "false"
  );

  // Reload the card and check the values.
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

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await notInEditingMode();

  await closeAddressBookWindow();
  Services.prefs.clearUserPref("mail.addr_book.displayName.autoGeneration");
  Services.prefs.clearUserPref("mail.addr_book.displayName.lastnamefirst");
  personalBook.deleteCards(personalBook.childCards);
});

/**
 * Test that the "prefer display name" checkbox is visible when it should be
 * (in edit mode and only if there is a display name).
 */
add_task(async function test_prefer_display_name() {
  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let displayName = abDocument.getElementById("displayName");
  let preferDisplayName = abDocument.getElementById("preferDisplayName");
  let editButton = abDocument.getElementById("editButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  // Make a new card. Check the default value is true.
  // The checkbox should not appear until there is a display name.

  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);

  Assert.equal(displayName.value, "");
  Assert.ok(
    preferDisplayName.parentNode.classList.contains("disabled"),
    "label disabled"
  );
  Assert.ok(preferDisplayName.disabled, "checkbox disabled");

  setInputValues({ DisplayName: "test" });
  Assert.ok(
    !preferDisplayName.parentNode.classList.contains("disabled"),
    "label enabled"
  );
  Assert.ok(!preferDisplayName.disabled, "checkbox enabled");
  Assert.ok(preferDisplayName.checked, "checkbox is checked for a new card");

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  Assert.equal(personalBook.childCardCount, 1);
  checkCardValues(personalBook.childCards[0], {
    DisplayName: "test",
    PreferDisplayName: "1",
  });

  // Edit the card. Check the UI matches the card value.

  preferDisplayName.checked = false; // Ensure it gets set.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(!preferDisplayName.disabled, "checkbox enabled");
  Assert.ok(preferDisplayName.checked, "checkbox state matches the card");

  // Change the card value.

  EventUtils.synthesizeMouseAtCenter(preferDisplayName, {}, abWindow);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  Assert.equal(personalBook.childCardCount, 1);
  checkCardValues(personalBook.childCards[0], {
    DisplayName: "test",
    PreferDisplayName: "0",
  });

  // Edit the card. Check the UI matches the card value.

  preferDisplayName.checked = true; // Ensure it gets set.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(!preferDisplayName.disabled, "checkbox enabled");
  Assert.ok(!preferDisplayName.checked, "checkbox state matches the card");

  // Clear the display name. The checkbox should disappear.

  setInputValues({ DisplayName: "" });
  Assert.ok(preferDisplayName.disabled, "checkbox disabled");

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});

/**
 * Checks the state of the toolbar buttons is restored after editing.
 */
add_task(async function test_toolbar_state() {
  personalBook.addCard(createContact("contact", "2"));
  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  let cardsList = abDocument.getElementById("cards");
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  // In All Address Books, the "create card" and "create list" buttons should
  // be disabled.

  await openAllAddressBooks();
  checkToolbarState([
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarImport",
  ]);

  // In other directories, all buttons should be enabled.

  await openDirectory(personalBook);
  checkToolbarState(toolbarButtonIDs);

  // Back to All Address Books.

  await openAllAddressBooks();
  checkToolbarState([
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarImport",
  ]);

  // Select a card, no change.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  checkToolbarState([
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarImport",
  ]);

  // Edit a card, all buttons disabled.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Cancel editing, button states restored.

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode([
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarImport",
  ]);

  // Edit a card again, all buttons disabled.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Cancel editing, button states restored.

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode([
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarImport",
  ]);

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});

add_task(async function test_delete_button() {
  let abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let editButton = abDocument.getElementById("editButton");
  let deleteButton = abDocument.getElementById("detailsDeleteButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  Assert.ok(BrowserTestUtils.is_hidden(detailsPane), "details pane is hidden");

  // Create a new card. The delete button shouldn't be visible at this point.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(deleteButton));
  Assert.ok(BrowserTestUtils.is_visible(saveEditButton));

  setInputValues({
    FirstName: "delete",
    LastName: "me",
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode();

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(deleteButton));

  Assert.equal(personalBook.childCardCount, 1, "contact was not deleted");
  let contact = personalBook.childCards[0];

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(deleteButton));

  // Click to delete, cancel the deletion.

  let promptPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));

  Assert.ok(abWindow.detailsPane.isEditing, "still in editing mode");
  Assert.equal(personalBook.childCardCount, 1, "contact was not deleted");

  // Click to delete, accept the deletion.

  let deletionPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode();

  let [subject, data] = await deletionPromise;
  Assert.equal(subject.UID, contact.UID, "correct card was deleted");
  Assert.equal(data, personalBook.UID, "card was deleted from correct place");
  Assert.equal(personalBook.childCardCount, 0, "contact was deleted");
  Assert.equal(
    cardsList.view.directory.UID,
    personalBook.UID,
    "view didn't change"
  );
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_hidden(detailsPane)
  );

  // Now let's delete a contact while viewing a list.

  let listContact = createContact("delete", "me too");
  let list = personalBook.addMailList(createMailingList("a list"));
  list.addCard(listContact);
  await new Promise(resolve => setTimeout(resolve));

  openDirectory(list);
  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(deleteButton));

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.is_hidden(editButton));
  Assert.ok(BrowserTestUtils.is_visible(deleteButton));

  // Click to delete, accept the deletion.

  deletionPromise = TestUtils.topicObserved("addrbook-contact-deleted");
  promptPromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeMouseAtCenter(deleteButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode();

  [subject, data] = await deletionPromise;
  Assert.equal(subject.UID, listContact.UID, "correct card was deleted");
  Assert.equal(data, personalBook.UID, "card was deleted from correct place");
  Assert.equal(personalBook.childCardCount, 0, "contact was deleted");
  Assert.equal(cardsList.view.directory.UID, list.UID, "view didn't change");
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_hidden(detailsPane)
  );

  personalBook.deleteDirectory(list);
  await closeAddressBookWindow();
});
