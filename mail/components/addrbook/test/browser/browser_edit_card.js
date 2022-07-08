/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// TODO: Fix the UI so that we don't have to do this.
window.maximize();

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
  checkToolbarState(false);
}

/**
 * Wait until we are no longer in editing mode.
 *
 * @param {Element} expectedFocus - The element that is expected to have focus
 *   after leaving editing.
 */
async function notInEditingMode(expectedFocus) {
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
  checkToolbarState(true);
  Assert.equal(
    expectedFocus,
    abDocument.activeElement,
    `Focus should be on the ${expectedFocus.id}`
  );
}

function getInput(entryName, addIfNeeded = false) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  switch (entryName) {
    case "DisplayName":
      return abDocument.querySelector("vcard-fn #vCardDisplayName");
    case "PreferDisplayName":
      return abDocument.querySelector("vcard-fn #vCardPreferDisplayName");
    case "NickName":
      return abDocument.querySelector("vcard-nickname #vCardNickName");
    case "Prefix":
      let prefixInput = abDocument.querySelector("vcard-n #vcard-n-prefix");
      if (addIfNeeded && BrowserTestUtils.is_hidden(prefixInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector("vcard-n #n-list-component-prefix button"),
          {},
          abWindow
        );
      }
      return prefixInput;
    case "FirstName":
      return abDocument.querySelector("vcard-n #vcard-n-firstname");
    case "MiddleName":
      let middleNameInput = abDocument.querySelector(
        "vcard-n #vcard-n-middlename"
      );
      if (addIfNeeded && BrowserTestUtils.is_hidden(middleNameInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector(
            "vcard-n #n-list-component-middlename button"
          ),
          {},
          abWindow
        );
      }
      return middleNameInput;
    case "LastName":
      return abDocument.querySelector("vcard-n #vcard-n-lastname");
    case "Suffix":
      let suffixInput = abDocument.querySelector("vcard-n #vcard-n-suffix");
      if (addIfNeeded && BrowserTestUtils.is_hidden(suffixInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector("vcard-n #n-list-component-suffix button"),
          {},
          abWindow
        );
      }
      return suffixInput;
    case "PrimaryEmail":
      if (
        addIfNeeded &&
        abDocument.getElementById("vcard-email").children.length < 1
      ) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.getElementById("vcard-add-email"),
          {},
          abWindow
        );
      }
      return abDocument.querySelector(
        `#vcard-email tr:nth-child(1) input[type="email"]`
      );
    case "PrimaryEmailCheckbox":
      return getInput("PrimaryEmail")
        .closest(`tr`)
        .querySelector(`input[type="checkbox"]`);
    case "SecondEmail":
      if (
        addIfNeeded &&
        abDocument.getElementById("vcard-email").children.length < 2
      ) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.getElementById("vcard-add-email"),
          {},
          abWindow
        );
      }
      return abDocument.querySelector(
        `#vcard-email tr:nth-child(2) input[type="email"]`
      );
    case "SecondEmailCheckbox":
      return getInput("SecondEmail")
        .closest(`tr`)
        .querySelector(`input[type="checkbox"]`);
  }

  return null;
}

function getFields(entryName, addIfNeeded = false, count) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let fieldsSelector;
  let addButtonId;
  let expectFocusSelector;
  switch (entryName) {
    case "email":
      fieldsSelector = `#vcard-email tr`;
      addButtonId = "vcard-add-email";
      expectFocusSelector = "tr:last-of-type .vcard-type-selection";
      break;
    case "impp":
      fieldsSelector = "vcard-impp";
      addButtonId = "vcard-add-impp";
      expectFocusSelector = "vcard-impp:last-of-type input";
      break;
    case "url":
      fieldsSelector = "vcard-url";
      addButtonId = "vcard-add-url";
      expectFocusSelector = "vcard-url:last-of-type .vcard-type-selection";
      break;
    case "tel":
      fieldsSelector = "vcard-tel";
      addButtonId = "vcard-add-tel";
      expectFocusSelector = "vcard-tel:last-of-type .vcard-type-selection";
      break;
    case "note":
      fieldsSelector = "vcard-note";
      addButtonId = "vcard-add-note";
      expectFocusSelector = "vcard-note:last-of-type textarea";
      break;
    default:
      throw new Error("entryName not found");
  }
  let fields = abDocument.querySelectorAll(fieldsSelector).length;
  if (addIfNeeded && fields < count) {
    let addButton = abDocument.getElementById(addButtonId);
    for (let clickTimes = fields; clickTimes < count; clickTimes++) {
      addButton.focus();
      EventUtils.synthesizeKey("KEY_Enter", {}, abWindow);
      let expectFocus = abDocument.querySelector(expectFocusSelector);
      Assert.ok(
        expectFocus,
        `Expected focus element should now exist for ${entryName}`
      );
      Assert.ok(
        BrowserTestUtils.is_visible(expectFocus),
        `Expected focus element for ${entryName} should be visible`
      );
      Assert.equal(
        expectFocus,
        abDocument.activeElement,
        `Expected focus element for ${entryName} should be active`
      );
    }
  }
  return abDocument.querySelectorAll(fieldsSelector);
}

function checkToolbarState(shouldBeEnabled) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  for (let id of [
    "toolbarCreateBook",
    "toolbarCreateContact",
    "toolbarCreateList",
    "toolbarImport",
  ]) {
    Assert.equal(
      abDocument.getElementById(id).disabled,
      !shouldBeEnabled,
      id + (!shouldBeEnabled ? " should not" : " should") + " be disabled"
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
  for (let [key, value] of Object.entries(expected)) {
    let input = getInput(key, !!value);
    if (!input) {
      Assert.ok(!value, `${key} input exists to put a value in`);
      continue;
    }

    Assert.ok(BrowserTestUtils.is_visible(input));
    if (input.type == "checkbox") {
      Assert.equal(input.checked, value, `${key} checked`);
    } else {
      Assert.equal(input.value, value, `${key} value`);
    }
  }
}

function checkVCardInputValues(expected) {
  for (let [key, expectedEntries] of Object.entries(expected)) {
    let fields = getFields(key, false, expectedEntries.length);

    Assert.equal(
      fields.length,
      expectedEntries.length,
      `${key} occurred ${fields.length} time(s) and ${expectedEntries.length} time(s) is expected.`
    );

    for (let [index, field] of fields.entries()) {
      let expectedEntry = expectedEntries[index];
      let valueField;
      let typeField;
      switch (key) {
        case "email":
          valueField = field.emailEl;
          typeField = field.selectEl;
          break;
        case "impp":
          valueField = field.imppEl;
          break;
        case "url":
          valueField = field.urlEl;
          typeField = field.selectEl;
          break;
        case "tel":
          valueField = field.inputElement;
          typeField = field.selectEl;
          break;
        case "note":
          valueField = field.textAreaEl;
          break;
      }

      // Check the input value of the field.
      Assert.equal(
        expectedEntry.value,
        valueField.value,
        `Value of ${key} at position ${index}`
      );

      // Check the type of the field.
      if (expectedEntry.type || typeField) {
        Assert.equal(
          expectedEntry.type || "",
          typeField.value,
          `Type of ${key} at position ${index}`
        );
      }
    }
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

function checkVCardValues(card, expected) {
  for (let [key, expectedEntries] of Object.entries(expected)) {
    let cardValues = card.vCardProperties.getAllEntries(key);

    Assert.equal(
      expectedEntries.length,
      cardValues.length,
      `${key} is expected to occur ${expectedEntries.length} time(s) and ${cardValues.length} time(s) is found.`
    );

    for (let [index, entry] of cardValues.entries()) {
      let expectedEntry = expectedEntries[index];

      Assert.deepEqual(
        expectedEntry.value,
        entry.value,
        `Value of ${key} at position ${index}`
      );

      if (entry.params.type || expectedEntry.type) {
        Assert.equal(
          expectedEntry.type,
          entry.params.type,
          `Type of ${key} at position ${index}`
        );
      }

      if (entry.params.pref || expectedEntry.pref) {
        Assert.equal(
          expectedEntry.pref,
          entry.params.pref,
          `Pref of ${key} at position ${index}`
        );
      }
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

    if (input.type == "checkbox") {
      EventUtils.synthesizeMouseAtCenter(input, {}, abWindow);
      Assert.equal(
        input.checked,
        value,
        `${key} ${value ? "checked" : "unchecked"}`
      );
    } else {
      input.select();
      if (value) {
        EventUtils.sendString(value);
      } else {
        EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
      }
    }
  }
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
}

function setVCardInputValues(changes) {
  let abWindow = getAddressBookWindow();

  for (let [key, entries] of Object.entries(changes)) {
    let fields = getFields(key, true, entries.length);
    for (let [index, field] of fields.entries()) {
      let changeEntry = entries[index];
      let valueField;
      let typeField;
      switch (key) {
        case "email":
          valueField = field.emailEl;
          typeField = field.selectEl;

          if (
            (field.checkboxEl.checked && changeEntry && !changeEntry.pref) ||
            (!field.checkboxEl.checked &&
              changeEntry &&
              changeEntry.pref == "1")
          ) {
            EventUtils.synthesizeMouseAtCenter(field.checkboxEl, {}, abWindow);
          }
          break;
        case "impp":
          valueField = field.imppEl;
          break;
        case "url":
          valueField = field.urlEl;
          typeField = field.selectEl;
          break;
        case "tel":
          valueField = field.inputElement;
          typeField = field.selectEl;
          break;
        case "note":
          valueField = field.textAreaEl;
          break;
      }

      valueField.select();
      if (changeEntry && changeEntry.value) {
        EventUtils.sendString(changeEntry.value);
      } else {
        EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
      }

      if (typeField && changeEntry && changeEntry.type) {
        field.selectEl.value = changeEntry.type;
      } else if (typeField) {
        field.selectEl.value = "";
      }
    }
  }
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
}

/**
 * Open the contact at the given index in the #cards element.
 *
 * @param {number} index - The index of the contact to edit.
 * @param {Object} options - Options for how the contact is selected for
 *   editing.
 * @param {boolean} options.useMouse - Whether to use mouse events to select the
 *   contact. Otherwise uses keyboard events.
 * @param {boolean} options.useActivate - Whether to activate the contact for
 *   editing directly from the #cards list using "Enter" or double click.
 *   Otherwise uses the "Edit" button in the contact display.
 */
async function editContactAtIndex(index, options) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");
  let editButton = abDocument.getElementById("editButton");

  if (!options.useMouse) {
    cardsList.focus();
    if (cardsList.currentIndex != index) {
      EventUtils.synthesizeKey("KEY_Home", { ctrlKey: true }, abWindow);
      for (let i = 0; i < index; i++) {
        EventUtils.synthesizeKey("KEY_ArrowDown", { ctrlKey: true }, abWindow);
      }
    }
  }

  if (options.useActivate) {
    if (options.useMouse) {
      EventUtils.synthesizeMouseAtCenter(
        cardsList.getRowAtIndex(index),
        { clickCount: 1 },
        abWindow
      );
      EventUtils.synthesizeMouseAtCenter(
        cardsList.getRowAtIndex(index),
        { clickCount: 2 },
        abWindow
      );
    } else {
      EventUtils.synthesizeKey("KEY_Enter", {}, abWindow);
    }
  } else {
    if (options.useMouse) {
      EventUtils.synthesizeMouseAtCenter(
        cardsList.getRowAtIndex(index),
        {},
        abWindow
      );
    } else {
      EventUtils.synthesizeKey(" ", {}, abWindow);
    }

    await TestUtils.waitForCondition(() =>
      BrowserTestUtils.is_visible(detailsPane)
    );

    if (options.useMouse) {
      EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
    } else {
      while (abDocument.activeElement != editButton) {
        EventUtils.synthesizeKey("KEY_Tab", {}, abWindow);
      }
      EventUtils.synthesizeKey(" ", {}, abWindow);
    }
  }

  await inEditingMode();
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
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  let viewContactName = abDocument.getElementById("viewContactName");
  let viewContactNickName = abDocument.getElementById("viewContactNickName");
  let viewContactEmail = abDocument.getElementById("viewPrimaryEmail");
  let editContactName = abDocument.getElementById("editContactHeadingName");
  let editContactNickName = abDocument.getElementById(
    "editContactHeadingNickName"
  );
  let editContactEmail = abDocument.getElementById("editContactHeadingEmail");

  /**
   * Assert that the heading has the expected text content and visibility.
   *
   * @param {Element} headingEl - The heading to test.
   * @param {string} expect - The expected text content. If this is "", the
   *   heading is expected to be hidden as well.
   */
  function assertHeading(headingEl, expect) {
    Assert.equal(
      headingEl.textContent,
      expect,
      `Heading ${headingEl.id} content should match`
    );
    if (expect) {
      Assert.ok(
        BrowserTestUtils.is_visible(headingEl),
        `Heading ${headingEl.id} should be visible`
      );
    } else {
      Assert.ok(
        BrowserTestUtils.is_hidden(headingEl),
        `Heading ${headingEl.id} should be visible`
      );
    }
  }

  /**
   * Assert the headings shown in the contact view page.
   *
   * @param {string} name - The expected name, or an empty string if none is
   *   expected.
   * @param {string} nickname - The expected nickname, or an empty string if
   *   none is expected.
   * @param {string} email - The expected email, or an empty string if none is
   *   expected.
   */
  function assertViewHeadings(name, nickname, email) {
    assertHeading(viewContactName, name);
    assertHeading(viewContactNickName, nickname);
    assertHeading(viewContactEmail, email);
  }

  /**
   * Assert the headings shown in the contact edit page.
   *
   * @param {string} name - The expected name, or an empty string if none is
   *   expected.
   * @param {string} nickname - The expected nickname, or an empty string if
   *   none is expected.
   * @param {string} email - The expected email, or an empty string if none is
   *   expected.
   */
  function assertEditHeadings(name, nickname, email) {
    assertHeading(editContactName, name);
    assertHeading(editContactNickName, nickname);
    assertHeading(editContactEmail, email);
  }

  Assert.ok(detailsPane.hidden);
  Assert.ok(!document.querySelector("vcard-n"));
  Assert.ok(!abDocument.getElementById("vcard-email").children.length);

  // Select a card in the list. Check the display in view mode.

  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  assertViewHeadings("contact 1", "", "contact.1@invalid");

  Assert.ok(BrowserTestUtils.is_visible(editButton));
  Assert.ok(BrowserTestUtils.is_hidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.is_hidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Headings reflect initial values.
  assertEditHeadings("contact 1", "", "contact.1@invalid");

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
    abDocument
      .getElementById("editContactForm")
      .contains(abDocument.activeElement),
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
    NickName: "",
    PrimaryEmail: "contact.1@invalid",
    SecondEmail: null,
  });

  // Make sure the header values reflect the fields values.
  assertEditHeadings("contact 1", "", "contact.1@invalid");

  // Make some changes but cancel them.

  setInputValues({
    LastName: "one",
    DisplayName: "contact one",
    NickName: "contact nickname",
    PrimaryEmail: "contact.1.edited@invalid",
    SecondEmail: "i@roman.invalid",
  });

  // Headings reflect new values.
  assertEditHeadings(
    "contact one",
    "contact nickname",
    "contact.1.edited@invalid"
  );

  // Change the preferred email to the secondary.
  setInputValues({
    SecondEmailCheckbox: true,
  });
  // The new email value should be reflected in the heading.
  assertEditHeadings("contact one", "contact nickname", "i@roman.invalid");

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await notInEditingMode(editButton);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  // Heading reflects initial values.
  assertViewHeadings("contact 1", "", "contact.1@invalid");

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

  // Headings are restored.
  assertEditHeadings("contact 1", "", "contact.1@invalid");

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
    NickName: "contact nickname",
    SecondEmail: "i@roman.invalid",
  });

  assertEditHeadings("contact one", "contact nickname", "contact.1@invalid");

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

  // Headings show new values
  assertViewHeadings("contact one", "contact nickname", "contact.1@invalid");

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
  await notInEditingMode(editButton);

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
  await notInEditingMode(editButton);
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
  await notInEditingMode(editButton);
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
    NickName: "",
    SecondEmail: null,
  });

  getInput("SecondEmail").focus();
  EventUtils.synthesizeKey("VK_RETURN", {}, abWindow);
  await notInEditingMode(editButton);

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });
  checkCardValues(book.childCards[0], {
    FirstName: "contact",
    LastName: "1",
    DisplayName: "contact 1",
    NickName: "",
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
    PreferDisplayName: true,
  });

  // Try saving an empty contact.
  let promptPromise = BrowserTestUtils.promiseAlertDialog(
    "accept",
    "chrome://global/content/commonDialog.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await inEditingMode();

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

  // Clear the modified display name, it should still not be overwritten.
  setInputValues({ DisplayName: "" });
  setInputValues({ FirstName: "third" });
  checkInputValues({ DisplayName: "" });

  // Flip the order.
  Services.prefs.setStringPref(
    "mail.addr_book.displayName.lastnamefirst",
    "true"
  );
  setInputValues({ FirstName: "fourth" });
  checkInputValues({ DisplayName: "" });

  // Turn off generation.
  Services.prefs.setBoolPref(
    "mail.addr_book.displayName.autoGeneration",
    false
  );
  setInputValues({ FirstName: "fifth" });
  checkInputValues({ DisplayName: "" });

  setInputValues({ DisplayName: "last, fourth" });

  // Save the card and check the values.
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);
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

  // Clear all required values.
  setInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
  });

  // Try saving the empty contact.
  promptPromise = BrowserTestUtils.promiseAlertDialog(
    "accept",
    "chrome://global/content/commonDialog.xhtml"
  );
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await inEditingMode();

  // Close the edit without saving.
  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await notInEditingMode(editButton);

  // Enter edit mode again. The values shouldn't have changed.
  EventUtils.synthesizeKey("KEY_Enter", {}, abWindow);
  await inEditingMode();
  checkInputValues({
    FirstName: "fifth",
    LastName: "last",
    DisplayName: "last, fourth",
  });

  // Check the saved name isn't overwritten.
  setInputValues({ FirstName: "first" });
  checkInputValues({ DisplayName: "last, fourth" });

  promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await new Promise(resolve => abWindow.setTimeout(resolve));
  await notInEditingMode(editButton);

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
  let editButton = abDocument.getElementById("editButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  // Make a new card. Check the default value is true.
  // The display name shouldn't be affected by first and last name if the field
  // is not empty.
  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);

  checkInputValues({ DisplayName: "", PreferDisplayName: true });

  setInputValues({ DisplayName: "test" });
  setInputValues({ FirstName: "first" });

  checkInputValues({ DisplayName: "test" });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  Assert.equal(personalBook.childCardCount, 1);
  checkCardValues(personalBook.childCards[0], {
    DisplayName: "test",
    PreferDisplayName: "1",
  });

  // Edit the card. Check the UI matches the card value.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  checkInputValues({ DisplayName: "test" });
  checkInputValues({ FirstName: "first" });

  // Change the card value.

  let preferDisplayName = abDocument.querySelector(
    "vcard-fn #vCardPreferDisplayName"
  );
  EventUtils.synthesizeMouseAtCenter(preferDisplayName, {}, abWindow);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  Assert.equal(personalBook.childCardCount, 1);
  checkCardValues(personalBook.childCards[0], {
    DisplayName: "test",
    PreferDisplayName: "0",
  });

  // Edit the card. Check the UI matches the card value.

  preferDisplayName.checked = true; // Ensure it gets set.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Clear the display name. The first and last name shouldn't affect it.
  setInputValues({ DisplayName: "" });
  checkInputValues({ FirstName: "first" });

  setInputValues({ LastName: "last" });
  checkInputValues({ DisplayName: "" });

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
  checkToolbarState(true);

  // In other directories, all buttons should be enabled.

  await openDirectory(personalBook);
  checkToolbarState(true);

  // Back to All Address Books.

  await openAllAddressBooks();
  checkToolbarState(true);

  // Select a card, no change.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  checkToolbarState(true);

  // Edit a card, all buttons disabled.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Cancel editing, button states restored.

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  // Edit a card again, all buttons disabled.

  EventUtils.synthesizeKey(" ", {}, abWindow);
  await inEditingMode();

  // Cancel editing, button states restored.

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});

add_task(async function test_delete_button() {
  let abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let searchInput = abDocument.getElementById("searchInput");

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
  await notInEditingMode(editButton);

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
  await notInEditingMode(searchInput);

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
  await notInEditingMode(searchInput);

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

function checkNFieldState({ prefix, middlename, suffix }) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  Assert.equal(abDocument.querySelectorAll("vcard-n").length, 1);

  Assert.ok(
    BrowserTestUtils.is_visible(abDocument.getElementById("vcard-n-firstname")),
    "Firstname is always shown."
  );

  Assert.ok(
    BrowserTestUtils.is_visible(abDocument.getElementById("vcard-n-lastname")),
    "Lastname is always shown."
  );

  for (let [subValueName, inputId, buttonSelector, inputVisible] of [
    ["prefix", "vcard-n-prefix", "#n-list-component-prefix button", prefix],
    [
      "middlename",
      "vcard-n-middlename",
      "#n-list-component-middlename button",
      middlename,
    ],
    ["suffix", "vcard-n-suffix", "#n-list-component-suffix button", suffix],
  ]) {
    let inputEl = abDocument.getElementById(inputId);
    Assert.ok(inputEl);
    let buttonEl = abDocument.querySelector(buttonSelector);
    Assert.ok(buttonEl);

    if (inputVisible) {
      Assert.ok(
        BrowserTestUtils.is_visible(inputEl),
        `${subValueName} input is shown with an initial value or a click on the button.`
      );
      Assert.ok(
        BrowserTestUtils.is_hidden(buttonEl),
        `${subValueName} button is hidden when the input is shown.`
      );
    } else {
      Assert.ok(
        BrowserTestUtils.is_hidden(inputEl),
        `${subValueName} input is not shown initially.`
      );
      Assert.ok(
        BrowserTestUtils.is_visible(buttonEl),
        `${subValueName} button is shown when the input is hidden.`
      );
    }
  }
}

/**
 * Save repeatedly names of two contacts and ensure that no fields are leaking
 * to another card.
 */
add_task(async function test_name_fields() {
  let book = createAddressBook("Test Book N Field");
  book.addCard(createContact("contact1", "lastname1"));
  book.addCard(createContact("contact2", "lastname2"));

  let abWindow = await openAddressBookWindow();
  openDirectory(book);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let editButton = abDocument.getElementById("editButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");

  // Edit contact1.
  await editContactAtIndex(0, {});

  // Check for the original values of contact1.
  checkInputValues({ FirstName: "contact1", LastName: "lastname1" });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    n: [{ value: ["lastname1", "contact1", "", "", ""] }],
  });

  // Edit contact1 set all n values.
  await editContactAtIndex(0, { useMouse: true });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  setInputValues({
    Prefix: "prefix 1",
    FirstName: "contact1 changed",
    MiddleName: "middle name 1",
    LastName: "lastname1 changed",
    Suffix: "suffix 1",
  });

  checkNFieldState({ prefix: true, middlename: true, suffix: true });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    n: [
      {
        value: [
          "lastname1 changed",
          "contact1 changed",
          "middle name 1",
          "prefix 1",
          "suffix 1",
        ],
      },
    ],
  });

  // Edit contact2.
  await editContactAtIndex(1, {});

  // Check for the original values of contact2 after saving contact1.
  checkInputValues({ FirstName: "contact2", LastName: "lastname2" });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  // Ensure that both vCardValues of contact1 and contact2 are correct.
  checkVCardValues(book.childCards[0], {
    n: [
      {
        value: [
          "lastname1 changed",
          "contact1 changed",
          "middle name 1",
          "prefix 1",
          "suffix 1",
        ],
      },
    ],
  });

  checkVCardValues(book.childCards[1], {
    n: [{ value: ["lastname2", "contact2", "", "", ""] }],
  });

  // Edit contact1 and change the values to only firstname and lastname values
  // to see that the button/input handling of the field is correct.
  await editContactAtIndex(0, {});

  checkInputValues({
    Prefix: "prefix 1",
    FirstName: "contact1 changed",
    MiddleName: "middle name 1",
    LastName: "lastname1 changed",
    Suffix: "suffix 1",
  });

  checkNFieldState({ prefix: true, middlename: true, suffix: true });

  setInputValues({
    Prefix: "",
    FirstName: "contact1 changed",
    MiddleName: "",
    LastName: "lastname1 changed",
    Suffix: "",
  });

  // Fields are still visible until the contact is saved and edited again.
  checkNFieldState({ prefix: true, middlename: true, suffix: true });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    n: [{ value: ["lastname1 changed", "contact1 changed", "", "", ""] }],
  });

  checkVCardValues(book.childCards[1], {
    n: [{ value: ["lastname2", "contact2", "", "", ""] }],
  });

  // Check in contact1 that prefix, middlename and suffix inputs are hidden
  // again. Then remove the N last values and save.
  await editContactAtIndex(0, { useMouse: true, useActivate: true });

  checkInputValues({
    FirstName: "contact1 changed",
    LastName: "lastname1 changed",
  });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  // Let firstname and lastname empty for contact1.
  setInputValues({
    FirstName: "",
    LastName: "",
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  // If useActivate is called, expect the focus to return to the cards list.
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    n: [],
  });

  checkVCardValues(book.childCards[1], {
    n: [{ value: ["lastname2", "contact2", "", "", ""] }],
  });

  // Edit contact2.
  await editContactAtIndex(1, { useActivate: true });

  checkInputValues({ FirstName: "contact2", LastName: "lastname2" });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  setInputValues({
    FirstName: "contact2 changed",
    LastName: "lastname2 changed",
    Suffix: "suffix 2",
  });

  checkNFieldState({ prefix: false, middlename: false, suffix: true });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    n: [],
  });

  checkVCardValues(book.childCards[1], {
    n: [
      { value: ["lastname2 changed", "contact2 changed", "", "", "suffix 2"] },
    ],
  });

  // Edit contact1.
  await editContactAtIndex(0, { useMouse: true, useActivate: true });

  checkInputValues({ FirstName: "", LastName: "" });

  checkNFieldState({ prefix: false, middlename: false, suffix: false });

  setInputValues({
    FirstName: "contact1",
    MiddleName: "middle name 1",
    LastName: "lastname1",
  });

  checkNFieldState({ prefix: false, middlename: true, suffix: false });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    n: [{ value: ["lastname1", "contact1", "middle name 1", "", ""] }],
  });

  checkVCardValues(book.childCards[1], {
    n: [
      { value: ["lastname2 changed", "contact2 changed", "", "", "suffix 2"] },
    ],
  });

  // Now check when cancelling that no data is leaked between edits.
  // Edit contact2 for this first.
  await editContactAtIndex(1, { useActivate: true });

  checkInputValues({
    FirstName: "contact2 changed",
    LastName: "lastname2 changed",
    Suffix: "suffix 2",
  });

  checkNFieldState({ prefix: false, middlename: false, suffix: true });

  setInputValues({
    Prefix: "prefix 2",
    FirstName: "contact2",
    MiddleName: "middle name",
    LastName: "lastname2",
    Suffix: "suffix 2",
  });

  checkNFieldState({ prefix: true, middlename: true, suffix: true });

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    n: [{ value: ["lastname1", "contact1", "middle name 1", "", ""] }],
  });

  checkVCardValues(book.childCards[1], {
    n: [
      { value: ["lastname2 changed", "contact2 changed", "", "", "suffix 2"] },
    ],
  });

  // Ensure that prefix, middlename and lastname are correctly shown after
  // cancelling contact2. Then cancel contact2 again and look at contact1.
  await editContactAtIndex(1, {});

  checkInputValues({
    FirstName: "contact2 changed",
    LastName: "lastname2 changed",
    Suffix: "suffix 2",
  });

  checkNFieldState({ prefix: false, middlename: false, suffix: true });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    n: [{ value: ["lastname1", "contact1", "middle name 1", "", ""] }],
  });

  checkVCardValues(book.childCards[1], {
    n: [
      { value: ["lastname2 changed", "contact2 changed", "", "", "suffix 2"] },
    ],
  });

  // Ensure that a cancel from contact2 doesn't leak to contact1.
  await editContactAtIndex(0, {});

  checkNFieldState({ prefix: false, middlename: true, suffix: false });

  checkInputValues({
    FirstName: "contact1",
    MiddleName: "middle name 1",
    LastName: "lastname1",
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

/**
 * Checks if the default choice is visible or hidden.
 * If the default choice is expected checks that at maximum one
 * default email is ticked.
 *
 * @param {boolean} expectedDefaultChoiceVisible
 * @param {number} expectedDefaultIndex
 */
async function checkDefaultEmailChoice(
  expectedDefaultChoiceVisible,
  expectedDefaultIndex
) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let emailFields = abDocument.querySelectorAll(`#vcard-email tr`);

  for (let [index, emailField] of emailFields.entries()) {
    if (expectedDefaultChoiceVisible) {
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.is_visible(emailField.checkboxEl),
        `Email at index ${index} has a visible default email choice.`
      );
    } else {
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.is_hidden(emailField.checkboxEl),
        `Email at index ${index} has a hidden default email choice.`
      );
    }

    // Default email checking of the field.
    Assert.equal(
      expectedDefaultIndex === index,
      emailField.checkboxEl.checked,
      `Pref of email at position ${index}`
    );
  }

  // Check that at max one checkbox is ticked.
  if (expectedDefaultChoiceVisible) {
    let checked = Array.from(emailFields).filter(
      emailField => emailField.checkboxEl.checked
    );
    Assert.ok(
      checked.length <= 1,
      "At maximum one email is ticked for the default email."
    );
  }
}

add_task(async function test_email_fields() {
  let book = createAddressBook("Test Book Email Field");
  book.addCard(createContact("contact1", "lastname1"));
  book.addCard(createContact("contact2", "lastname2"));

  let abWindow = await openAddressBookWindow();
  openDirectory(book);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let editButton = abDocument.getElementById("editButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");

  // Edit contact1.
  await editContactAtIndex(0, { useActivate: true });

  // Check for the original values of contact1.
  checkVCardInputValues({
    email: [{ value: "contact1.lastname1@invalid" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  // Focus moves to cards list if we activate the edit directly from the list.
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "contact1.lastname1@invalid", pref: "1" }],
  });

  // Edit contact1 set type.
  await editContactAtIndex(0, { useMouse: true, useActivate: true });

  setVCardInputValues({
    email: [{ value: "contact1.lastname1@invalid", type: "work" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "contact1.lastname1@invalid", type: "work", pref: "1" }],
  });

  // Check for the original values of contact2.
  await editContactAtIndex(1, {});

  checkVCardInputValues({
    email: [{ value: "contact2.lastname2@invalid" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  // Ensure that both vCardValues of contact1 and contact2 are correct.
  checkVCardValues(book.childCards[0], {
    email: [{ value: "contact1.lastname1@invalid", type: "work", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "contact2.lastname2@invalid", pref: "1" }],
  });

  // Edit contact1 and add another email to see that the default email
  // choosing is visible.
  await editContactAtIndex(0, { useMouse: true });

  checkVCardInputValues({
    email: [{ value: "contact1.lastname1@invalid", type: "work" }],
  });

  await checkDefaultEmailChoice(false, 0);

  setVCardInputValues({
    email: [
      { value: "contact1.lastname1@invalid", pref: "1", type: "work" },
      { value: "another.contact1@invalid", type: "home" },
    ],
  });

  await checkDefaultEmailChoice(true, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [
      { value: "contact1.lastname1@invalid", pref: "1", type: "work" },
      { value: "another.contact1@invalid", type: "home" },
    ],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "contact2.lastname2@invalid", pref: "1" }],
  });

  // Choose another default email in contact1.
  await editContactAtIndex(0, { useMouse: true });

  checkVCardInputValues({
    email: [
      { value: "contact1.lastname1@invalid", type: "work" },
      { value: "another.contact1@invalid", type: "home" },
    ],
  });

  await checkDefaultEmailChoice(true, 0);

  setVCardInputValues({
    email: [
      { value: "contact1.lastname1@invalid", type: "work" },
      { value: "another.contact1@invalid", type: "home", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [
      { value: "contact1.lastname1@invalid", type: "work" },
      { value: "another.contact1@invalid", type: "home", pref: "1" },
    ],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "contact2.lastname2@invalid", pref: "1" }],
  });

  // Remove the first email from contact1.
  await editContactAtIndex(0, {});

  checkVCardInputValues({
    email: [
      { value: "contact1.lastname1@invalid", type: "work" },
      { value: "another.contact1@invalid", type: "home" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  setVCardInputValues({
    email: [{}, { value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  // The default email choosing is still visible until the contact is saved.
  await checkDefaultEmailChoice(true, 1);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "contact2.lastname2@invalid", pref: "1" }],
  });

  // Add multiple emails to contact2 and click each as the default email.
  // The last default clicked email should be set as default email and
  // only one should be selected.
  await editContactAtIndex(1, {});

  checkVCardInputValues({
    email: [{ value: "contact2.lastname2@invalid" }],
  });

  await checkDefaultEmailChoice(false, 0);

  setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
      { value: "some.contact2@invalid" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
      { value: "some.contact2@invalid", pref: "1" },
      { value: "default.email.contact2@invalid", type: "home", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 3);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [
      { value: "home.contact2@invalid", type: "home" },
      { value: "work.contact2@invalid", type: "work" },
      { value: "some.contact2@invalid" },
      { value: "default.email.contact2@invalid", type: "home", pref: "1" },
    ],
  });

  // Remove 3 emails from contact2.
  await editContactAtIndex(1, { useActivate: true, useMouse: true });

  checkVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home" },
      { value: "work.contact2@invalid", type: "work" },
      { value: "some.contact2@invalid" },
      { value: "default.email.contact2@invalid", type: "home" },
    ],
  });

  await checkDefaultEmailChoice(true, 3);

  setVCardInputValues({
    email: [{ value: "home.contact2@invalid", type: "home" }],
  });

  // The default email choosing is still visible until the contact is saved.
  // For this case the default email is left on an empty field which will be
  // removed.
  await checkDefaultEmailChoice(true, 3);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "home.contact2@invalid", type: "home", pref: "1" }],
  });

  // Now check when cancelling that no data is leaked between edits.
  // Edit contact2 for this first.
  await editContactAtIndex(1, { useActivate: true });

  checkVCardInputValues({
    email: [{ value: "home.contact2@invalid", type: "home" }],
  });

  await checkDefaultEmailChoice(false, 0);

  setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
      { value: "some.contact2@invalid", pref: "1" },
      { value: "default.email.contact2@invalid", type: "home", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 3);

  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "home.contact2@invalid", type: "home", pref: "1" }],
  });

  // Ensure that the default email choosing is not shown after
  // cancelling contact2. Then cancel contact2 again and look at contact1.
  await editContactAtIndex(1, { useMouse: true });

  checkVCardInputValues({
    email: [{ value: "home.contact2@invalid", type: "home" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "another.contact1@invalid", type: "home", pref: "1" }],
  });

  checkVCardValues(book.childCards[1], {
    email: [{ value: "home.contact2@invalid", type: "home", pref: "1" }],
  });

  // Ensure that a cancel from contact2 doesn't leak to contact1.
  await editContactAtIndex(0, {});

  checkVCardInputValues({
    email: [{ value: "another.contact1@invalid", type: "home" }],
  });

  await checkDefaultEmailChoice(false, 0);

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_vCard_fields() {
  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let book = createAddressBook("Test Book VCard Fields");

  let contact1 = createContact("contact1", "lastname");
  book.addCard(contact1);
  let contact2 = createContact("contact2", "lastname");
  book.addCard(contact2);

  openDirectory(book);

  let cardsList = abDocument.getElementById("cards");
  let searchInput = abDocument.getElementById("searchInput");
  let editButton = abDocument.getElementById("editButton");
  let cancelEditButton = abDocument.getElementById("cancelEditButton");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  // Check that no field is initially shown with a new contact.
  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  for (let [selector, label] of [
    ["vcard-impp", "Chat accounts"],
    ["vcard-url", "Websites"],
    ["vcard-tel", "Phone numbers"],
    ["vcard-note", "Notes"],
  ]) {
    Assert.equal(
      abDocument.querySelectorAll(selector).length,
      0,
      `${label} are not initially shown.`
    );
  }

  // Cancel the new contact creation.
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(searchInput);

  // Set values for contact1 with one entry for each field.
  await editContactAtIndex(0, { useMouse: true, useActivate: true });

  setVCardInputValues({
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "http://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "http://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [],
    url: [],
    tel: [],
    note: [],
  });

  // Edit the same contact and set multiple fields.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  checkVCardInputValues({
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "http://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
  });

  setVCardInputValues({
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc:irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "http://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc:irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "http://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [],
    url: [],
    tel: [],
    note: [],
  });

  // Switch from contact1 to contact2 and set some entries.
  // Ensure that no fields from contact1 are leaked.
  await editContactAtIndex(1, { useMouse: true });

  checkVCardInputValues({ impp: [], url: [], tel: [], note: [] });

  setVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc:irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "http://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  // Ensure that no fields from contact2 are leaked to contact1.
  // Check and remove all values from contact1.
  await editContactAtIndex(0, {});

  checkVCardInputValues({
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc:irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "http://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
  });

  setVCardInputValues({
    impp: [{ value: "" }, { value: "" }, { value: "" }],
    url: [{ value: "" }, { value: "" }, { value: "" }],
    tel: [{ value: "" }, { value: "" }, { value: "" }],
    note: [{ value: "" }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  // Check contact2 make changes and cancel.
  await editContactAtIndex(1, { useActivate: true });

  checkVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  setVCardInputValues({
    impp: [{ value: "" }],
    url: [
      { value: "http://www.thunderbird.net" },
      { value: "www.another.url", type: "work" },
    ],
    tel: [{ value: "650-903-0800" }, { value: "+123 456 789", type: "home" }],
    note: [],
  });

  // Cancel the changes.
  let promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  // Check that the cancel for contact2 worked cancel afterwards.
  await editContactAtIndex(1, {});

  checkVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "http://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
  });

  // Check that no values from contact2 are leaked to contact1 when cancelling.
  await editContactAtIndex(0, {});

  checkVCardInputValues({ impp: [], url: [], tel: [], note: [] });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_special_date_field() {
  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  let createContactButton = abDocument.getElementById("toolbarCreateContact");
  let saveEditButton = abDocument.getElementById("saveEditButton");

  openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
    PreferDisplayName: true,
  });

  // Add data to the default values to allow saving.
  setInputValues({
    FirstName: "contact",
    PrimaryEmail: "contact.1.edited@invalid",
  });

  let addSpecialDate = abDocument.getElementById("vcard-add-bday-anniversary");
  addSpecialDate.scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(addSpecialDate, {}, abWindow);

  Assert.ok(
    BrowserTestUtils.is_visible(abDocument.querySelector("vcard-special-date")),
    "The special date field is visible."
  );

  let firstYear = abDocument.querySelector(
    `vcard-special-date input[type="number"]`
  );
  Assert.ok(!firstYear.value, "year empty");
  let firstMonth = abDocument.querySelector(
    `vcard-special-date .vcard-month-select`
  );
  Assert.ok(firstMonth.value === "0", "month on placeholder");
  let firstDay = abDocument.querySelector(
    `vcard-special-date .vcard-day-select`
  );
  Assert.ok(firstDay.value === "0", "day on placeholder");
  Assert.ok(firstDay.childNodes.length == 1, "day options empty");

  // Try saving, we should remain in edit mode with year focused.
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await inEditingMode();
  Assert.equal(abDocument.activeElement, firstYear, "year field is focused");

  // Set date to a leap year.
  firstYear.value = 2004;

  let openMonthSelect = async function() {
    firstMonth.focus();

    let menulist = document.getElementById("ContentSelectDropdown");
    Assert.ok(menulist, "select menulist exists");

    // Click on the select control to open the popup.
    let shownPromise = BrowserTestUtils.waitForEvent(menulist, "popupshown");
    EventUtils.synthesizeMouseAtCenter(firstMonth, {}, abWindow);
    await shownPromise;
  };

  await openMonthSelect();
  EventUtils.sendKey("down", abWindow);
  EventUtils.sendKey("down", abWindow);
  EventUtils.sendKey("return", abWindow);

  await BrowserTestUtils.waitForCondition(
    () => firstDay.childNodes.length == 30, // 29 days + empty option 0.
    "day options filled with leap year"
  );

  // No leap year.
  firstYear.select();
  EventUtils.sendString("2003");
  await BrowserTestUtils.waitForCondition(
    () => firstDay.childNodes.length == 29, // 28 days + empty option 0.
    "day options filled without leap year"
  );

  // Remove the field.
  EventUtils.synthesizeMouseAtCenter(
    abDocument.querySelector(`vcard-special-date .remove-property-button`),
    {},
    abWindow
  );

  Assert.ok(
    !abDocument.querySelector("vcard-special-date"),
    "The special date field was removed."
  );
});
