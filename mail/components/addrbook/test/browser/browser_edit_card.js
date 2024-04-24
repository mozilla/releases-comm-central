/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { VCardUtils } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);
var { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);

requestLongerTimeout(3);

async function inEditingMode() {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  await TestUtils.waitForCondition(
    () => abWindow.detailsPane.isEditing,
    "Waiting on entering editing mode"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
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
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  await TestUtils.waitForCondition(
    () => !abWindow.detailsPane.isEditing,
    "leaving editing mode"
  );
  await new Promise(resolve => abWindow.setTimeout(resolve));

  Assert.ok(
    BrowserTestUtils.isHidden(abDocument.getElementById("detailsPaneBackdrop")),
    "backdrop should be hidden"
  );
  checkToolbarState(true);
  Assert.equal(
    abDocument.activeElement,
    expectedFocus,
    `Focus should be on #${expectedFocus.id}`
  );
}

function getInput(entryName, addIfNeeded = false) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  switch (entryName) {
    case "DisplayName":
      return abDocument.querySelector("vcard-fn #vCardDisplayName");
    case "PreferDisplayName":
      return abDocument.querySelector("vcard-fn #vCardPreferDisplayName");
    case "NickName":
      return abDocument.querySelector("vcard-nickname #vCardNickName");
    case "Prefix": {
      const prefixInput = abDocument.querySelector("vcard-n #vcard-n-prefix");
      if (addIfNeeded && BrowserTestUtils.isHidden(prefixInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector("vcard-n #n-list-component-prefix button"),
          {},
          abWindow
        );
      }
      return prefixInput;
    }
    case "FirstName":
      return abDocument.querySelector("vcard-n #vcard-n-firstname");
    case "MiddleName": {
      const middleNameInput = abDocument.querySelector(
        "vcard-n #vcard-n-middlename"
      );
      if (addIfNeeded && BrowserTestUtils.isHidden(middleNameInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector(
            "vcard-n #n-list-component-middlename button"
          ),
          {},
          abWindow
        );
      }
      return middleNameInput;
    }
    case "LastName":
      return abDocument.querySelector("vcard-n #vcard-n-lastname");
    case "Suffix": {
      const suffixInput = abDocument.querySelector("vcard-n #vcard-n-suffix");
      if (addIfNeeded && BrowserTestUtils.isHidden(suffixInput)) {
        EventUtils.synthesizeMouseAtCenter(
          abDocument.querySelector("vcard-n #n-list-component-suffix button"),
          {},
          abWindow
        );
      }
      return suffixInput;
    }
    case "PrimaryEmail": {
      if (
        addIfNeeded &&
        abDocument.getElementById("vcard-email").children.length < 1
      ) {
        const addButton = abDocument.getElementById("vcard-add-email");
        addButton.scrollIntoView({ block: "nearest" });
        EventUtils.synthesizeMouseAtCenter(addButton, {}, abWindow);
      }
      return abDocument.querySelector(
        `#vcard-email tr:nth-child(1) input[type="email"]`
      );
    }
    case "PrimaryEmailCheckbox":
      return getInput("PrimaryEmail")
        .closest(`tr`)
        .querySelector(`input[type="checkbox"]`);
    case "SecondEmail": {
      if (
        addIfNeeded &&
        abDocument.getElementById("vcard-email").children.length < 2
      ) {
        const addButton = abDocument.getElementById("vcard-add-email");
        addButton.scrollIntoView({ block: "nearest" });
        EventUtils.synthesizeMouseAtCenter(addButton, {}, abWindow);
      }
      return abDocument.querySelector(
        `#vcard-email tr:nth-child(2) input[type="email"]`
      );
    }
    case "SecondEmailCheckbox":
      return getInput("SecondEmail")
        .closest(`tr`)
        .querySelector(`input[type="checkbox"]`);
  }
  return null;
}

function getFields(entryName, addIfNeeded = false, count) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

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
      expectFocusSelector = "vcard-impp:last-of-type select";
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
    case "title":
      fieldsSelector = "vcard-title";
      addButtonId = "vcard-add-org";
      expectFocusSelector = "vcard-title:last-of-type input";
      break;
    case "custom":
      fieldsSelector = "vcard-custom";
      addButtonId = "vcard-add-custom";
      expectFocusSelector = "vcard-custom:last-of-type input";
      break;
    case "specialDate":
      fieldsSelector = "vcard-special-date";
      addButtonId = "vcard-add-bday-anniversary";
      expectFocusSelector =
        "vcard-special-date:last-of-type .vcard-type-selection";
      break;
    case "adr":
      fieldsSelector = "vcard-adr";
      addButtonId = "vcard-add-adr";
      expectFocusSelector = "vcard-adr:last-of-type .vcard-type-selection";
      break;
    case "tz":
      fieldsSelector = "vcard-tz";
      addButtonId = "vcard-add-tz";
      expectFocusSelector = "vcard-tz:last-of-type select";
      break;
    case "org":
      fieldsSelector = "vcard-org";
      addButtonId = "vcard-add-org";
      expectFocusSelector = "#addr-book-edit-org input";
      break;
    case "role":
      fieldsSelector = "vcard-role";
      addButtonId = "vcard-add-org";
      expectFocusSelector = "#addr-book-edit-org input";
      break;
    default:
      throw new Error("entryName not found: " + entryName);
  }
  const fields = abDocument.querySelectorAll(fieldsSelector).length;
  if (addIfNeeded && fields < count) {
    const addButton = abDocument.getElementById(addButtonId);
    for (let clickTimes = fields; clickTimes < count; clickTimes++) {
      addButton.focus();
      EventUtils.synthesizeKey("KEY_Enter", {}, abWindow);
      const expectFocus = abDocument.querySelector(expectFocusSelector);
      Assert.ok(
        expectFocus,
        `Expected focus element should now exist for ${entryName}`
      );
      Assert.ok(
        BrowserTestUtils.isVisible(expectFocus),
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
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  for (const id of [
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
  const abWindow = getAddressBookWindow();

  for (const [key, values] of Object.entries(expected)) {
    const section = abWindow.document.getElementById(key);
    const items = Array.from(
      section.querySelectorAll("li .entry-value"),
      li => li.textContent
    );
    Assert.deepEqual(items, values);
  }
}

function checkInputValues(expected) {
  for (const [key, value] of Object.entries(expected)) {
    const input = getInput(key, !!value);
    if (!input) {
      Assert.ok(!value, `${key} input exists to put a value in`);
      continue;
    }

    Assert.ok(BrowserTestUtils.isVisible(input));
    if (input.type == "checkbox") {
      Assert.equal(input.checked, value, `${key} checked`);
    } else {
      Assert.equal(input.value, value, `${key} value`);
    }
  }
}

function checkVCardInputValues(expected) {
  for (const [key, expectedEntries] of Object.entries(expected)) {
    const fields = getFields(key, false, expectedEntries.length);

    Assert.equal(
      fields.length,
      expectedEntries.length,
      `${key} occurred ${fields.length} time(s) and ${expectedEntries.length} time(s) is expected.`
    );

    for (const [index, field] of fields.entries()) {
      const expectedEntry = expectedEntries[index];
      let valueField;
      let typeField;
      switch (key) {
        case "email":
          valueField = field.emailEl;
          typeField = field.vCardType.selectEl;
          break;
        case "impp":
          valueField = field.imppEl;
          break;
        case "url":
          valueField = field.urlEl;
          typeField = field.vCardType.selectEl;
          break;
        case "tel":
          valueField = field.inputElement;
          typeField = field.vCardType.selectEl;
          break;
        case "note":
          valueField = field.textAreaEl;
          break;
        case "title":
          valueField = field.titleEl;
          break;
        case "specialDate": {
          Assert.equal(
            expectedEntry.value[0],
            field.year.value,
            `Year value of ${key} at position ${index}`
          );
          Assert.equal(
            expectedEntry.value[1],
            field.month.value,
            `Month value of ${key} at position ${index}`
          );
          Assert.equal(
            expectedEntry.value[2],
            field.day.value,
            `Day value of ${key} at position ${index}`
          );
          break;
        }
        case "adr": {
          typeField = field.vCardType.selectEl;
          const addressValue = [
            field.streetEl.value,
            field.localityEl.value,
            field.regionEl.value,
            field.codeEl.value,
            field.countryEl.value,
          ];

          Assert.deepEqual(
            expectedEntry.value,
            addressValue,
            `Value of ${key} at position ${index}`
          );
          break;
        }
        case "tz":
          valueField = field.selectEl;
          break;
        case "org": {
          const orgValue = [field.orgEl.value];
          if (field.unitEl.value) {
            orgValue.push(field.unitEl.value);
          }
          Assert.deepEqual(
            expectedEntry.value,
            orgValue,
            `Value of ${key} at position ${index}`
          );
          break;
        }
        case "role":
          valueField = field.roleEl;
          break;
      }

      // Check the input value of the field.
      if (valueField) {
        Assert.equal(
          expectedEntry.value,
          valueField.value,
          `Value of ${key} at position ${index}`
        );
      }

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
  for (const [key, value] of Object.entries(expected)) {
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
  for (const [key, expectedEntries] of Object.entries(expected)) {
    const cardValues = card.vCardProperties.getAllEntries(key);

    Assert.equal(
      expectedEntries.length,
      cardValues.length,
      `${key} is expected to occur ${expectedEntries.length} time(s) and ${cardValues.length} time(s) is found.`
    );

    for (const [index, entry] of cardValues.entries()) {
      const expectedEntry = expectedEntries[index];

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
  const abWindow = getAddressBookWindow();

  for (const [key, value] of Object.entries(changes)) {
    const input = getInput(key, !!value);
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

/**
 * Uses EventUtils.synthesizeMouseAtCenter and XULPopup.activateItem to
 * activate optionValue from the select element typeField.
 *
 * @param {HTMLSelectElement} typeField Select element.
 * @param {string} optionValue The value attribute of the option element from
 * typeField.
 */
async function activateTypeSelect(typeField, optionValue) {
  const abWindow = getAddressBookWindow();
  // Ensure that the select field is inside the viewport.
  typeField.scrollIntoView({ block: "nearest" });
  const shownPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  EventUtils.synthesizeMouseAtCenter(typeField, {}, abWindow);
  const selectPopup = await shownPromise;

  // Get the index of the optionValue from typeField
  const index = Array.from(typeField.children).findIndex(
    child => child.value === optionValue
  );
  Assert.ok(index >= 0, "Type in select field found");

  // No change event is fired if the same option is activated.
  if (index === typeField.selectedIndex) {
    const popupHidden = BrowserTestUtils.waitForEvent(
      selectPopup,
      "popuphidden"
    );
    selectPopup.hidePopup();
    await popupHidden;
    return;
  }

  // The change event saves the vCard value.
  const changeEvent = BrowserTestUtils.waitForEvent(typeField, "change");
  selectPopup.activateItem(selectPopup.children[index]);
  await changeEvent;
}

async function setVCardInputValues(changes) {
  const abWindow = getAddressBookWindow();

  for (const [key, entries] of Object.entries(changes)) {
    const fields = getFields(key, true, entries.length);
    // Somehow prevents an error on macOS when using <select> widgets that
    // have just been added.
    await new Promise(resolve => abWindow.setTimeout(resolve, 250));

    for (const [index, field] of fields.entries()) {
      const changeEntry = entries[index];
      let valueField;
      let typeField;
      switch (key) {
        case "email":
          valueField = field.emailEl;
          typeField = field.vCardType.selectEl;

          if (
            (field.checkboxEl.checked && changeEntry && !changeEntry.pref) ||
            (!field.checkboxEl.checked &&
              changeEntry &&
              changeEntry.pref == "1")
          ) {
            field.checkboxEl.scrollIntoView({ block: "nearest" });
            EventUtils.synthesizeMouseAtCenter(field.checkboxEl, {}, abWindow);
          }
          break;
        case "impp":
          valueField = field.imppEl;
          break;
        case "url":
          valueField = field.urlEl;
          typeField = field.vCardType.selectEl;
          break;
        case "tel":
          valueField = field.inputElement;
          typeField = field.vCardType.selectEl;
          break;
        case "note":
          valueField = field.textAreaEl;
          break;
        case "specialDate":
          if (changeEntry && changeEntry.value) {
            field.month.value = changeEntry.value[1];
            field.day.value = changeEntry.value[2];
            field.year.value = changeEntry.value[0];
          } else {
            field.month.value = "";
            field.day.value = "";
            field.year.value = "";
          }

          if (changeEntry && changeEntry.key === "bday") {
            field.selectEl.value = "bday";
          } else {
            field.selectEl.value = "anniversary";
          }
          break;
        case "adr":
          typeField = field.vCardType.selectEl;

          for (const [index, input] of [
            field.streetEl,
            field.localityEl,
            field.regionEl,
            field.codeEl,
            field.countryEl,
          ].entries()) {
            input.select();
            if (
              changeEntry &&
              Array.isArray(changeEntry.value) &&
              changeEntry.value[index]
            ) {
              EventUtils.sendString(changeEntry.value[index]);
            } else {
              EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
            }
          }
          break;
        case "tz":
          if (changeEntry && changeEntry.value) {
            field.selectEl.value = changeEntry.value;
          } else {
            field.selectEl.value = "";
          }
          break;
        case "title":
          valueField = field.titleEl;
          break;
        case "org":
          for (const [index, input] of [field.orgEl, field.unitEl].entries()) {
            input.select();
            if (
              changeEntry &&
              Array.isArray(changeEntry.value) &&
              changeEntry.value[index]
            ) {
              EventUtils.sendString(changeEntry.value[index]);
            } else {
              EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
            }
          }
          break;
        case "role":
          valueField = field.roleEl;
          break;
        case "custom":
          valueField = field.querySelector("vcard-custom:last-of-type input");
          break;
      }

      if (valueField) {
        valueField.select();
        if (changeEntry && changeEntry.value) {
          EventUtils.sendString(changeEntry.value);
        } else {
          EventUtils.synthesizeKey("VK_BACK_SPACE", {}, abWindow);
        }
      }

      if (typeField && changeEntry && changeEntry.type) {
        await activateTypeSelect(typeField, changeEntry.type);
      } else if (typeField) {
        await activateTypeSelect(typeField, "");
      }
    }
  }
  EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
}

/**
 * Open the contact at the given index in the #cards element.
 *
 * @param {number} index - The index of the contact to edit.
 * @param {object} options - Options for how the contact is selected for
 *   editing.
 * @param {boolean} options.useMouse - Whether to use mouse events to select the
 *   contact. Otherwise uses keyboard events.
 * @param {boolean} options.useActivate - Whether to activate the contact for
 *   editing directly from the #cards list using "Enter" or double click.
 *   Otherwise uses the "Edit" button in the contact display.
 */
async function editContactAtIndex(index, options) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const editButton = abDocument.getElementById("editButton");

  const selectHandler = {
    seenEvent: null,
    selectedAtEvent: null,

    reset() {
      this.seenEvent = null;
      this.selectedAtEvent = null;
    },
    handleEvent(event) {
      this.seenEvent = event;
      this.selectedAtEvent = cardsList.selectedIndex;
    },
  };

  if (!options.useMouse) {
    cardsList.table.body.focus();
    if (cardsList.currentIndex != index) {
      selectHandler.reset();
      cardsList.addEventListener("select", selectHandler, { once: true });
      EventUtils.synthesizeKey("KEY_Home", {}, abWindow);
      for (let i = 0; i < index; i++) {
        EventUtils.synthesizeKey("KEY_ArrowDown", {}, abWindow);
      }
      await TestUtils.waitForCondition(
        () => selectHandler.seenEvent,
        `'select' event should get fired`
      );
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
    }

    await TestUtils.waitForCondition(() =>
      BrowserTestUtils.isVisible(detailsPane)
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
  const book = createAddressBook("Test Book");
  book.addCard(createContact("contact", "1"));

  const abWindow = await openAddressBookWindow();
  await openDirectory(book);

  const abDocument = abWindow.document;
  const booksList = abDocument.getElementById("books");
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const editButton = abDocument.getElementById("editButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  const viewContactName = abDocument.getElementById("viewContactName");
  const viewContactNickName = abDocument.getElementById("viewContactNickName");
  const viewContactEmail = abDocument.getElementById("viewPrimaryEmail");
  const editContactName = abDocument.getElementById("editContactHeadingName");
  const editContactNickName = abDocument.getElementById(
    "editContactHeadingNickName"
  );
  const editContactEmail = abDocument.getElementById("editContactHeadingEmail");

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
        BrowserTestUtils.isVisible(headingEl),
        `Heading ${headingEl.id} should be visible`
      );
    } else {
      Assert.ok(
        BrowserTestUtils.isHidden(headingEl),
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
    BrowserTestUtils.isVisible(detailsPane)
  );

  assertViewHeadings("contact 1", "", "contact.1@invalid");

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isHidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.isHidden(saveEditButton));

  checkDisplayValues({
    emailAddresses: ["contact.1@invalid"],
  });

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  // Try to trigger the creation of a new contact while in edit mode.
  EventUtils.synthesizeKey("n", { ctrlKey: true }, abWindow);

  // Headings reflect initial values and shouldn't have changed.
  assertEditHeadings("contact 1", "", "contact.1@invalid");

  // Check that pressing Tab can't get us stuck on an element that shouldn't
  // have focus.

  const firstNameField = abDocument.getElementById("vcard-n-firstname");
  Assert.equal(
    document.activeElement,
    abWindow.browsingContext.topFrameElement,
    "address book frame should have focus"
  );
  Assert.equal(
    abDocument.activeElement,
    firstNameField,
    "first name field should be focused"
  );

  for (let loops = 0; loops < 100; loops++) {
    EventUtils.synthesizeKey("VK_TAB", {}, abWindow);
    if (
      !abDocument.activeElement.closest("#detailsPane") &&
      (Services.prefs.getBoolPref(
        "dom.disable_tab_focus_to_root_element",
        true
      ) ||
        abDocument.activeElement != abDocument.documentElement)
    ) {
      Assert.report(
        true,
        undefined,
        undefined,
        "focus escaped the details pane!"
      );
      break;
    }
    if (abDocument.activeElement == firstNameField) {
      break;
    }
  }
  if (abDocument.activeElement != firstNameField) {
    Assert.report(
      true,
      undefined,
      undefined,
      "focus cycle never returned to the first name field"
    );
  }

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

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isVisible(cancelEditButton));
  Assert.ok(BrowserTestUtils.isVisible(saveEditButton));

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
  Assert.ok(BrowserTestUtils.isVisible(detailsPane));

  // Heading reflects initial values.
  assertViewHeadings("contact 1", "", "contact.1@invalid");

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isHidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.isHidden(saveEditButton));

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

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isVisible(cancelEditButton));
  Assert.ok(BrowserTestUtils.isVisible(saveEditButton));

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
  Assert.ok(BrowserTestUtils.isVisible(detailsPane));

  // Headings show new values
  assertViewHeadings("contact one", "contact nickname", "contact.1@invalid");

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isHidden(cancelEditButton));
  Assert.ok(BrowserTestUtils.isHidden(saveEditButton));

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

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isVisible(cancelEditButton));
  Assert.ok(BrowserTestUtils.isVisible(saveEditButton));

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

  await openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // The order of the FirstName and LastName fields can be reversed by L10n.
  // This means they can be broken by L10n. Check that they're alright in the
  // default configuration. We need to find a more robust way of doing this,
  // but it is what it is for now.

  const firstName = abDocument.getElementById("FirstName");
  const lastName = abDocument.getElementById("LastName");
  Assert.equal(
    firstName.compareDocumentPosition(lastName),
    Node.DOCUMENT_POSITION_FOLLOWING,
    "LastName follows FirstName"
  );

  // The phonetic name fields should be visible, because the preference is set.
  // They can also be broken by L10n.

  let phoneticFirstName = abDocument.getElementById("PhoneticFirstName");
  let phoneticLastName = abDocument.getElementById("PhoneticLastName");
  Assert.ok(BrowserTestUtils.isVisible(phoneticFirstName));
  Assert.ok(BrowserTestUtils.isVisible(phoneticLastName));
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

  await openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  // The phonetic name fields should be visible, because the preference is set.
  // They can also be broken by L10n.

  phoneticFirstName = abDocument.getElementById("PhoneticFirstName");
  phoneticLastName = abDocument.getElementById("PhoneticLastName");
  Assert.ok(BrowserTestUtils.isHidden(phoneticFirstName));
  Assert.ok(BrowserTestUtils.isHidden(phoneticLastName));

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

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  const cardsList = abDocument.getElementById("cards");
  const editButton = abDocument.getElementById("editButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  await openDirectory(personalBook);
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
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  // Make a new card. Check the default value is true.
  // The display name shouldn't be affected by first and last name if the field
  // is not empty.
  await openDirectory(personalBook);
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

  const preferDisplayName = abDocument.querySelector(
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
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const cardsList = abDocument.getElementById("cards");
  const editButton = abDocument.getElementById("editButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

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
  const abWindow = await openAddressBookWindow();
  await openDirectory(personalBook);

  const abDocument = abWindow.document;
  const searchInput = abDocument.getElementById("searchInput");
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  const editButton = abDocument.getElementById("editButton");
  const deleteButton = abDocument.getElementById("detailsDeleteButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  Assert.ok(BrowserTestUtils.isHidden(detailsPane), "details pane is hidden");

  // Create a new card. The delete button shouldn't be visible at this point.

  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isHidden(deleteButton));
  Assert.ok(BrowserTestUtils.isVisible(saveEditButton));

  setInputValues({
    FirstName: "delete",
    LastName: "me",
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isHidden(deleteButton));

  Assert.equal(personalBook.childCardCount, 1, "contact was not deleted");
  const contact = personalBook.childCards[0];

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isVisible(deleteButton));

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
    BrowserTestUtils.isHidden(detailsPane)
  );

  // Now let's delete a contact while viewing a list.

  const listContact = createContact("delete", "me too");
  const list = personalBook.addMailList(createMailingList("a list"));
  list.addCard(listContact);
  await new Promise(resolve => abWindow.setTimeout(resolve));

  await openDirectory(list);
  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  Assert.ok(BrowserTestUtils.isVisible(editButton));
  Assert.ok(BrowserTestUtils.isHidden(deleteButton));

  // Click to edit.

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  Assert.ok(BrowserTestUtils.isHidden(editButton));
  Assert.ok(BrowserTestUtils.isVisible(deleteButton));

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
    BrowserTestUtils.isHidden(detailsPane)
  );

  personalBook.deleteDirectory(list);
  await closeAddressBookWindow();
});

function checkNFieldState({ prefix, middlename, suffix }) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  Assert.equal(abDocument.querySelectorAll("vcard-n").length, 1);

  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.getElementById("vcard-n-firstname")),
    "Firstname is always shown."
  );

  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.getElementById("vcard-n-lastname")),
    "Lastname is always shown."
  );

  for (const [subValueName, inputId, buttonSelector, inputVisible] of [
    ["prefix", "vcard-n-prefix", "#n-list-component-prefix button", prefix],
    [
      "middlename",
      "vcard-n-middlename",
      "#n-list-component-middlename button",
      middlename,
    ],
    ["suffix", "vcard-n-suffix", "#n-list-component-suffix button", suffix],
  ]) {
    const inputEl = abDocument.getElementById(inputId);
    Assert.ok(inputEl);
    const buttonEl = abDocument.querySelector(buttonSelector);
    Assert.ok(buttonEl);

    if (inputVisible) {
      Assert.ok(
        BrowserTestUtils.isVisible(inputEl),
        `${subValueName} input is shown with an initial value or a click on the button.`
      );
      Assert.ok(
        BrowserTestUtils.isHidden(buttonEl),
        `${subValueName} button is hidden when the input is shown.`
      );
    } else {
      Assert.ok(
        BrowserTestUtils.isHidden(inputEl),
        `${subValueName} input is not shown initially.`
      );
      Assert.ok(
        BrowserTestUtils.isVisible(buttonEl),
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
  const book = createAddressBook("Test Book N Field");
  book.addCard(createContact("contact1", "lastname1"));
  book.addCard(createContact("contact2", "lastname2"));

  const abWindow = await openAddressBookWindow();
  await openDirectory(book);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");

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
  await notInEditingMode(cardsList.table.body);

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
  await notInEditingMode(cardsList.table.body);

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
  await notInEditingMode(cardsList.table.body);

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

  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList.table.body);

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
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const emailFields = abDocument.querySelectorAll(`#vcard-email tr`);

  for (const [index, emailField] of emailFields.entries()) {
    if (expectedDefaultChoiceVisible) {
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isVisible(emailField.checkboxEl),
        `Email at index ${index} has a visible default email choice.`
      );
    } else {
      await TestUtils.waitForCondition(
        () => BrowserTestUtils.isHidden(emailField.checkboxEl),
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
    const checked = Array.from(emailFields).filter(
      emailField => emailField.checkboxEl.checked
    );
    Assert.ok(
      checked.length <= 1,
      "At maximum one email is ticked for the default email."
    );
  }
}

add_task(async function test_email_fields() {
  const book = createAddressBook("Test Book Email Field");
  book.addCard(createContact("contact1", "lastname1"));
  book.addCard(createContact("contact2", "lastname2"));

  const abWindow = await openAddressBookWindow();
  await openDirectory(book);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");

  // Edit contact1.
  await editContactAtIndex(0, { useActivate: true });

  // Check for the original values of contact1.
  checkVCardInputValues({
    email: [{ value: "contact1.lastname1@invalid" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  // Focus moves to cards list if we activate the edit directly from the list.
  await notInEditingMode(cardsList.table.body);

  checkVCardValues(book.childCards[0], {
    email: [{ value: "contact1.lastname1@invalid", pref: "1" }],
  });

  // Edit contact1 set type.
  await editContactAtIndex(0, { useMouse: true, useActivate: true });

  await setVCardInputValues({
    email: [{ value: "contact1.lastname1@invalid", type: "work" }],
  });

  await checkDefaultEmailChoice(false, 0);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList.table.body);

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

  await setVCardInputValues({
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

  await setVCardInputValues({
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

  await setVCardInputValues({
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

  await setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  await setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
      { value: "some.contact2@invalid" },
    ],
  });

  await checkDefaultEmailChoice(true, 1);

  await setVCardInputValues({
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

  await setVCardInputValues({
    email: [{ value: "home.contact2@invalid", type: "home" }],
  });

  // The default email choosing is still visible until the contact is saved.
  // For this case the default email is left on an empty field which will be
  // removed.
  await checkDefaultEmailChoice(true, 3);

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList.table.body);

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

  await setVCardInputValues({
    email: [
      { value: "home.contact2@invalid", type: "home", pref: "1" },
      { value: "work.contact2@invalid", type: "work", pref: "1" },
      { value: "some.contact2@invalid", pref: "1" },
      { value: "default.email.contact2@invalid", type: "home", pref: "1" },
    ],
  });

  await checkDefaultEmailChoice(true, 3);

  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList.table.body);

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
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const book = createAddressBook("Test Book VCard Fields");

  const contact1 = createContact("contact1", "lastname");
  book.addCard(contact1);
  const contact2 = createContact("contact2", "lastname");
  book.addCard(contact2);

  await openDirectory(book);

  const cardsList = abDocument.getElementById("cards");
  const searchInput = abDocument.getElementById("searchInput");
  const editButton = abDocument.getElementById("editButton");
  const cancelEditButton = abDocument.getElementById("cancelEditButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  // Check that no field is initially shown with a new contact.
  const createContactButton = abDocument.getElementById("toolbarCreateContact");
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  for (const [selector, label] of [
    ["vcard-impp", "Chat accounts"],
    ["vcard-url", "Websites"],
    ["vcard-tel", "Phone numbers"],
    ["vcard-note", "Notes"],
    ["vcard-special-dates", "Special dates"],
    ["vcard-adr", "Addresses"],
    ["vcard-tz", "Time Zone"],
    ["vcard-role", "Organizational properties"],
    ["vcard-title", "Organizational properties"],
    ["vcard-org", "Organizational properties"],
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

  await setVCardInputValues({
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "https://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
    specialDate: [
      { value: [2000, 3, 31], key: "bday" },
      { value: [1980, 12, 15], key: "anniversary" },
    ],
    adr: [
      {
        value: ["123 Main Street", "Any Town", "CA", "91921-1234", "U.S.A"],
      },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Inc.", "European Division"] }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(cardsList.table.body);

  checkVCardValues(book.childCards[0], {
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "https://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
    bday: [{ value: "2000-03-31" }],
    anniversary: [{ value: "1980-12-15" }],
    adr: [
      {
        value: [
          "",
          "",
          "123 Main Street",
          "Any Town",
          "CA",
          "91921-1234",
          "U.S.A",
        ],
      },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Inc.", "European Division"] }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [],
    url: [],
    tel: [],
    note: [],
    bday: [],
    anniversary: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  // Edit the same contact and set multiple fields.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  checkVCardInputValues({
    impp: [{ value: "matrix:u/contact1:example.com" }],
    url: [{ value: "https://www.example.com" }],
    tel: [{ value: "+123456 789" }],
    note: [{ value: "A note to this contact" }],
    specialDate: [
      { value: [2000, 3, 31], key: "bday" },
      { value: [1980, 12, 15], key: "anniversary" },
    ],
    adr: [
      {
        value: ["123 Main Street", "Any Town", "CA", "91921-1234", "U.S.A"],
      },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Inc.", "European Division"] }],
  });

  await setVCardInputValues({
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc://irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "https://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
    specialDate: [
      { value: [2000, 3, 31], key: "bday" },
      { value: [1980, 12, 15], key: "anniversary" },
      { value: [1960, 9, 17], key: "anniversary" },
      { value: [2010, 7, 1], key: "anniversary" },
    ],
    adr: [
      { value: ["123 Main Street", "", "", "", ""] },
      { value: ["456 Side Street", "", "", "", ""], type: "home" },
      { value: ["789 Side Street", "", "", "", ""], type: "work" },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Co.", "South American Division"] }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc://irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "https://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
    bday: [{ value: "2000-03-31" }],
    anniversary: [
      { value: "1980-12-15" },
      { value: "1960-09-17" },
      { value: "2010-07-01" },
    ],
    adr: [
      { value: ["", "", "123 Main Street", "", "", "", ""] },
      { value: ["", "", "456 Side Street", "", "", "", ""], type: "home" },
      { value: ["", "", "789 Side Street", "", "", "", ""], type: "work" },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Co.", "South American Division"] }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [],
    url: [],
    tel: [],
    note: [],
    bday: [],
    anniversary: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  // Switch from contact1 to contact2 and set some entries.
  // Ensure that no fields from contact1 are leaked.
  await editContactAtIndex(1, { useMouse: true });

  checkVCardInputValues({
    impp: [],
    url: [],
    tel: [],
    note: [],
    specialDate: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  await setVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    specialDate: [
      { value: [1966, 12, 15], key: "bday" },
      { value: [1954, 9, 17], key: "anniversary" },
    ],
    adr: [{ value: ["123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: ["Organization contact 2"] }],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc://irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "https://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
    bday: [{ value: "2000-03-31" }],
    anniversary: [
      { value: "1980-12-15" },
      { value: "1960-09-17" },
      { value: "2010-07-01" },
    ],
    adr: [
      { value: ["", "", "123 Main Street", "", "", "", ""] },
      { value: ["", "", "456 Side Street", "", "", "", ""], type: "home" },
      { value: ["", "", "789 Side Street", "", "", "", ""], type: "work" },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Co.", "South American Division"] }],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    bday: [{ value: "1966-12-15" }],
    anniversary: [{ value: "1954-09-17" }],
    adr: [{ value: ["", "", "123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  // Ensure that no fields from contact2 are leaked to contact1.
  // Check and remove all values from contact1.
  await editContactAtIndex(0, {});

  checkVCardInputValues({
    impp: [
      { value: "matrix:u/contact1:example.com" },
      { value: "irc://irc.example.com/contact1,isuser" },
      { value: "xmpp:test@example.com" },
    ],
    url: [
      { value: "https://example.com" },
      { value: "https://hello", type: "home" },
      { value: "https://www.example.invalid", type: "work" },
    ],
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 77 666 8" },
      { value: "+1113456789", type: "work" },
    ],
    note: [{ value: "Another note contact1\n\n\n" }],
    specialDate: [
      { value: [2000, 3, 31], key: "bday" },
      { value: [1980, 12, 15], key: "anniversary" },
      { value: [1960, 9, 17], key: "anniversary" },
      { value: [2010, 7, 1], key: "anniversary" },
    ],
    adr: [
      { value: ["123 Main Street", "", "", "", ""] },
      { value: ["456 Side Street", "", "", "", ""], type: "home" },
      { value: ["789 Side Street", "", "", "", ""], type: "work" },
    ],
    tz: [{ value: "Africa/Abidjan" }],
    role: [{ value: "Role" }],
    title: [{ value: "Title" }],
    org: [{ value: ["Example Co.", "South American Division"] }],
  });

  await setVCardInputValues({
    impp: [{}, {}, {}],
    url: [{}, {}, {}],
    tel: [{}, {}, {}],
    note: [{}],
    specialDate: [{}, {}, {}, {}],
    adr: [{}, {}, {}],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
    bday: [],
    anniversary: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    bday: [{ value: "1966-12-15" }],
    anniversary: [{ value: "1954-09-17" }],
    adr: [{ value: ["", "", "123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  // Check contact2 make changes and cancel.
  await editContactAtIndex(1, { useActivate: true });

  checkVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    specialDate: [
      { value: [1966, 12, 15], key: "bday" },
      { value: [1954, 9, 17], key: "anniversary" },
    ],
    adr: [{ value: ["123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  await setVCardInputValues({
    impp: [{ value: "" }],
    url: [
      { value: "https://www.thunderbird.net" },
      { value: "www.another.url", type: "work" },
    ],
    tel: [{ value: "650-903-0800" }, { value: "+123 456 789", type: "home" }],
    note: [],
    specialDate: [{}, { value: [1980, 12, 15], key: "anniversary" }],
    adr: [],
    tz: [],
    role: [{ value: "Some Role contact 2" }],
    title: [],
    org: [{ value: "Some Organization" }],
  });

  // Cancel the changes.
  const promptPromise = BrowserTestUtils.promiseAlertDialog("extra1");
  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await promptPromise;
  await notInEditingMode(cardsList.table.body);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
    bday: [],
    anniversary: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    bday: [{ value: "1966-12-15" }],
    anniversary: [{ value: "1954-09-17" }],
    adr: [{ value: ["", "", "123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  // Check that the cancel for contact2 worked cancel afterwards.
  await editContactAtIndex(1, {});

  checkVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    specialDate: [
      { value: [1966, 12, 15], key: "bday" },
      { value: [1954, 9, 17], key: "anniversary" },
    ],
    adr: [{ value: ["123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    impp: [],
    url: [],
    tel: [],
    note: [],
    bday: [],
    anniversary: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  checkVCardValues(book.childCards[1], {
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    bday: [{ value: "1966-12-15" }],
    anniversary: [{ value: "1954-09-17" }],
    adr: [{ value: ["", "", "123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
  });

  // Check that no values from contact2 are leaked to contact1 when cancelling.
  await editContactAtIndex(0, {});

  checkVCardInputValues({
    impp: [],
    url: [],
    tel: [],
    note: [],
    specialDate: [],
    adr: [],
    tz: [],
    role: [],
    title: [],
    org: [],
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_vCard_minimal() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");

  await openDirectory(personalBook);
  EventUtils.synthesizeMouseAtCenter(createContactButton, {}, abWindow);
  await inEditingMode();

  checkInputValues({
    FirstName: "",
    LastName: "",
    DisplayName: "",
    PreferDisplayName: true,
  });

  const addOrgButton = abDocument.getElementById("vcard-add-org");
  addOrgButton.scrollIntoView({ block: "nearest" });
  EventUtils.synthesizeMouseAtCenter(addOrgButton, {}, abWindow);

  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.querySelector("vcard-title")),
    "Title should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.querySelector("vcard-role")),
    "Role should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.querySelector("vcard-org")),
    "Organization should be visible"
  );

  abDocument.querySelector("vcard-org input").value = "FBI";

  const saveEditButton = abDocument.getElementById("saveEditButton");
  const editButton = abDocument.getElementById("editButton");

  // Should allow to save with only Organization filled.
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(personalBook.childCards[0], {
    org: [{ value: "FBI" }],
  });

  await closeAddressBookWindow();
  personalBook.deleteCards(personalBook.childCards);
});

/**
 * Switches to different types to verify that all works accordingly.
 */
add_task(async function test_type_selection() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const book = createAddressBook("Test Book Type Selection");

  const contact1 = createContact("contact1", "lastname");
  book.addCard(contact1);

  await openDirectory(book);

  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  await editContactAtIndex(0, {});

  await setVCardInputValues({
    email: [
      { value: "contact1@invalid" },
      { value: "home.contact1@invalid", type: "home" },
      { value: "work.contact1@invalid", type: "work" },
    ],
    url: [
      { value: "https://none.example.com" },
      { value: "https://home.example.com", type: "home" },
      { value: "https://work.example.com", type: "work" },
    ],
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "home" },
      { value: "+111 WORK 3456789", type: "work" },
      { value: "+123 CELL 456 789", type: "cell" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "pager" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [
      { value: "contact1@invalid", pref: "1" },
      { value: "home.contact1@invalid", type: "home" },
      { value: "work.contact1@invalid", type: "work" },
    ],
    url: [
      { value: "https://none.example.com" },
      { value: "https://home.example.com", type: "home" },
      { value: "https://work.example.com", type: "work" },
    ],
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "home" },
      { value: "+111 WORK 3456789", type: "work" },
      { value: "+123 CELL 456 789", type: "cell" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "pager" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  checkVCardInputValues({
    email: [
      { value: "contact1@invalid", pref: "1" },
      { value: "home.contact1@invalid", type: "home" },
      { value: "work.contact1@invalid", type: "work" },
    ],
    url: [
      { value: "https://none.example.com" },
      { value: "https://home.example.com", type: "home" },
      { value: "https://work.example.com", type: "work" },
    ],
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "home" },
      { value: "+111 WORK 3456789", type: "work" },
      { value: "+123 CELL 456 789", type: "cell" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "pager" },
    ],
  });

  await setVCardInputValues({
    email: [
      { value: "contact1@invalid", type: "work" },
      { value: "home.contact1@invalid" },
      { value: "work.contact1@invalid", type: "home" },
    ],
    url: [
      { value: "https://none.example.com", type: "work" },
      { value: "https://home.example.com" },
      { value: "https://work.example.com", type: "home" },
    ],
    tel: [
      { value: "+123456 789", type: "pager" },
      { value: "809 HOME 77 666 8" },
      { value: "+111 WORK 3456789", type: "home" },
      { value: "+123 CELL 456 789" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "cell" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  checkVCardValues(book.childCards[0], {
    email: [
      { value: "contact1@invalid", type: "work", pref: "1" },
      { value: "home.contact1@invalid" },
      { value: "work.contact1@invalid", type: "home" },
    ],
    url: [
      { value: "https://none.example.com", type: "work" },
      { value: "https://home.example.com" },
      { value: "https://work.example.com", type: "home" },
    ],
    tel: [
      { value: "+123456 789", type: "pager" },
      { value: "809 HOME 77 666 8" },
      { value: "+111 WORK 3456789", type: "home" },
      { value: "+123 CELL 456 789" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "cell" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

/**
 * Other vCard contacts are using uppercase types for the predefined spec
 * labels. This tests our support for them for the edit of a contact.
 */
add_task(async function test_support_types_uppercase() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const book = createAddressBook("Test Book Uppercase Type Support");

  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  // Add a card with uppercase types.
  book.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
  BEGIN:VCARD
  FN:contact 1
  TEL:+123456 789
  TEL;TYPE=HOME:809 HOME 77 666 8
  TEL;TYPE=WORK:+111 WORK 3456789
  TEL;TYPE=CELL:+123 CELL 456 789
  TEL;TYPE=FAX:809 FAX 77 666 8
  TEL;TYPE=PAGER:+111 PAGER 3456789
  END:VCARD
`)
  );

  await openDirectory(book);

  // First open the edit and check that the values are shown.
  // Do not change anything.
  await editContactAtIndex(0, {});

  // The UI uses lowercase types but only changes them when the type is
  // touched.
  checkVCardInputValues({
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "home" },
      { value: "+111 WORK 3456789", type: "work" },
      { value: "+123 CELL 456 789", type: "cell" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "pager" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  // We haven't touched these values so they are not changed to lower case.
  checkVCardValues(book.childCards[0], {
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "HOME" },
      { value: "+111 WORK 3456789", type: "WORK" },
      { value: "+123 CELL 456 789", type: "CELL" },
      { value: "809 FAX 77 666 8", type: "FAX" },
      { value: "+111 PAGER 3456789", type: "PAGER" },
    ],
  });

  // Now make changes to the types.
  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  checkVCardInputValues({
    tel: [
      { value: "+123456 789" },
      { value: "809 HOME 77 666 8", type: "home" },
      { value: "+111 WORK 3456789", type: "work" },
      { value: "+123 CELL 456 789", type: "cell" },
      { value: "809 FAX 77 666 8", type: "fax" },
      { value: "+111 PAGER 3456789", type: "pager" },
    ],
  });

  await setVCardInputValues({
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 HOME 77 666 8", type: "cell" },
      { value: "+111 WORK 3456789", type: "pager" },
      { value: "+123 CELL 456 789", type: "fax" },
      { value: "809 FAX 77 666 8", type: "" },
      { value: "+111 PAGER 3456789", type: "work" },
    ],
  });

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  // As we touched the type values they are now saved in lowercase.
  // At this point it is up to the other vCard implementation to handle this.
  checkVCardValues(book.childCards[0], {
    tel: [
      { value: "+123456 789", type: "home" },
      { value: "809 HOME 77 666 8", type: "cell" },
      { value: "+111 WORK 3456789", type: "pager" },
      { value: "+123 CELL 456 789", type: "fax" },
      { value: "809 FAX 77 666 8", type: "" },
      { value: "+111 PAGER 3456789", type: "work" },
    ],
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_special_date_field() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const createContactButton = abDocument.getElementById("toolbarCreateContact");

  await openDirectory(personalBook);
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

  const addSpecialDate = abDocument.getElementById(
    "vcard-add-bday-anniversary"
  );
  addSpecialDate.scrollIntoView({ block: "nearest" });
  EventUtils.synthesizeMouseAtCenter(addSpecialDate, {}, abWindow);

  Assert.ok(
    BrowserTestUtils.isVisible(abDocument.querySelector("vcard-special-date")),
    "The special date field is visible."
  );
  // Somehow prevents an error on macOS when using <select> widgets that have
  // just been added.
  await new Promise(resolve => abWindow.setTimeout(resolve, 250));

  const firstYear = abDocument.querySelector(
    `vcard-special-date input[type="number"]`
  );
  Assert.ok(!firstYear.value, "year empty");
  const firstMonth = abDocument.querySelector(
    `vcard-special-date .vcard-month-select`
  );
  Assert.equal(firstMonth.value, "", "month should be on placeholder");
  const firstDay = abDocument.querySelector(
    `vcard-special-date .vcard-day-select`
  );
  Assert.equal(firstDay.value, "", "day should be on placeholder");
  Assert.equal(firstDay.childNodes.length, 32, "all days should be possible");

  // Set date to a leap year.
  firstYear.value = 2004;

  const shownPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  firstMonth.scrollIntoView({ block: "nearest" });
  EventUtils.synthesizeMouseAtCenter(firstMonth, {}, abWindow);
  const selectPopup = await shownPromise;

  const changePromise = BrowserTestUtils.waitForEvent(firstMonth, "change");
  selectPopup.activateItem(selectPopup.children[2]);
  await changePromise;

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

  await closeAddressBookWindow();
});

/**
 * Tests that custom properties (Custom1 etc.) are editable.
 */
add_task(async function testCustomProperties() {
  let card = new AddrBookCard();
  card._properties = new Map([
    ["PopularityIndex", 0],
    ["Custom2", "custom two"],
    ["Custom4", "custom four"],
    [
      "_vCard",
      formatVCard`
      BEGIN:VCARD
      FN:custom person
      X-CUSTOM3:x-custom three
      X-CUSTOM4:x-custom four
      END:VCARD
      `,
    ],
  ]);
  card = personalBook.addCard(card);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const editButton = abDocument.getElementById("editButton");
  const saveEditButton = abDocument.getElementById("saveEditButton");

  const index = cardsList.view.getIndexForUID(card.UID);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(index),
    {},
    abWindow
  );
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  EventUtils.synthesizeMouseAtCenter(editButton, {}, abWindow);
  await inEditingMode();

  const customField = getFields("custom")[0];
  const inputs = customField.querySelectorAll("input");
  Assert.equal(inputs.length, 4);
  Assert.equal(inputs[0].value, "");
  Assert.equal(inputs[1].value, "custom two");
  Assert.equal(inputs[2].value, "x-custom three");
  Assert.equal(inputs[3].value, "x-custom four");

  inputs[0].value = "x-custom one";
  inputs[1].value = "x-custom two";
  inputs[3].value = "";

  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  card = personalBook.childCards.find(c => c.UID == card.UID);
  checkCardValues(card, {
    Custom2: null,
    Custom4: null,
  });
  checkVCardValues(card, {
    "x-custom1": [{ value: "x-custom one" }],
    "x-custom2": [{ value: "x-custom two" }],
    "x-custom3": [{ value: "x-custom three" }],
    "x-custom4": [],
  });

  await closeAddressBookWindow();
  personalBook.deleteCards([card]);
});

/**
 * Tests that we correctly fix Google's bad escaping of colons in values, and
 * other characters in URI values.
 */
add_task(async function testGoogleEscaping() {
  const googleBook = createAddressBook("Google Book");
  googleBook.wrappedJSObject._isGoogleCardDAV = true;
  googleBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      VERSION:3.0
      N:test;en\\\\c\\:oding;;;
      FN:en\\\\c\\:oding test
      TITLE:title\\:title\\;title\\,title\\\\title\\\\\\:title\\\\\\;title\\\\\\,title\\\\\\\\
      TEL:tel\\:0123\\\\4567
      EMAIL:test\\\\test@invalid
      NOTE:notes\\:\\nnotes\\;\\nnotes\\,\\nnotes\\\\
      URL:https\\://host/url\\:url\\;url\\,url\\\\url
      END:VCARD
    `)
  );

  const abWindow = await openAddressBookWindow();

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  await openDirectory(googleBook);
  Assert.equal(cardsList.view.rowCount, 1);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));
  await editContactAtIndex(0, {});

  checkInputValues({
    FirstName: "en\\c:oding",
    LastName: "test",
    DisplayName: "en\\c:oding test",
  });

  checkVCardInputValues({
    title: [
      { value: "title:title;title,title\\title\\:title\\;title\\,title\\\\" },
    ],
    tel: [{ value: "tel:01234567" }],
    email: [{ value: "test\\test@invalid" }],
    note: [{ value: "notes:\nnotes;\nnotes,\nnotes\\" }],
    url: [{ value: "https://host/url:url;url,url\\url" }],
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(googleBook.URI);
});

/**
 * Tests that contacts with nickname can be edited.
 */
add_task(async function testNickname() {
  const book = createAddressBook("Nick");
  book.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      VERSION:4.0
      EMAIL;PREF=1:jsmith@example.org
      NICKNAME:Johnny
      N:SMITH;JOHN;;;
      END:VCARD
    `)
  );

  const abWindow = await openAddressBookWindow();

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  await openDirectory(book);
  Assert.equal(cardsList.view.rowCount, 1);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));
  await editContactAtIndex(0, {});

  checkInputValues({
    FirstName: "JOHN",
    LastName: "SMITH",
    NickName: "Johnny",
    PrimaryEmail: "jsmith@example.org",
  });

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

add_task(async function test_remove_button() {
  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const book = createAddressBook("Test Book VCard Fields");
  const contact1 = createContact("contact1", "lastname");
  book.addCard(contact1);

  await openDirectory(book);

  await editContactAtIndex(0, {});
  const detailsPane = abDocument.getElementById("detailsPane");

  const removeButtons = detailsPane.querySelectorAll(".remove-property-button");
  Assert.equal(
    removeButtons.length,
    2,
    "Email and Organization Properties remove button is present."
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      abDocument
        .getElementById("addr-book-edit-email")
        .querySelector(".remove-property-button")
    ),
    "Email is present and remove button is visible."
  );

  Assert.ok(
    BrowserTestUtils.isHidden(
      abDocument
        .getElementById("addr-book-edit-org")
        .querySelector(".remove-property-button")
    ),
    "Organization Properties are not filled and the remove button is not visible."
  );

  // Set a value for each field.
  await setVCardInputValues({
    impp: [{ value: "invalid:example.com" }],
    url: [{ value: "https://www.thunderbird.net" }],
    tel: [{ value: "650-903-0800" }],
    note: [{ value: "Another note\nfor contact 2" }],
    specialDate: [{ value: [1966, 12, 15], key: "bday" }],
    adr: [{ value: ["123 Work Street", "", "", "", ""], type: "work" }],
    tz: [{ value: "Africa/Accra" }],
    role: [{ value: "Role contact 2" }],
    title: [{ value: "Title contact 2" }],
    org: [{ value: "Organization contact 2" }],
    custom: [{ value: "foo" }],
  });

  const vCardEdit = detailsPane.querySelector("vcard-edit");

  // Click the remove buttons and check that the properties are removed.

  for (const [propertyName, fieldsetId, propertySelector, addButton] of [
    ["adr", "addr-book-edit-address", "vcard-adr"],
    ["impp", "addr-book-edit-impp", "vcard-impp"],
    ["tel", "addr-book-edit-tel", "vcard-tel"],
    ["url", "addr-book-edit-url", "vcard-url"],
    ["email", "addr-book-edit-email", "#vcard-email tr"],
    ["bday", "addr-book-edit-bday-anniversary", "vcard-special-date"],
    ["tz", "addr-book-edit-tz", "vcard-tz", "vcard-add-tz"],
    ["note", "addr-book-edit-note", "vcard-note", "vcard-add-note"],
    ["org", "addr-book-edit-org", "vcard-org", "vcard-add-org"],
    ["x-custom1", "addr-book-edit-custom", "vcard-custom", "vcard-add-custom"],
  ]) {
    Assert.ok(
      vCardEdit.vCardProperties.getFirstEntry(propertyName),
      `${propertyName} is present.`
    );
    const removeButton = abDocument
      .getElementById(fieldsetId)
      .querySelector(".remove-property-button");

    removeButton.scrollIntoView({ block: "nearest" });
    const removeEvent = BrowserTestUtils.waitForEvent(
      vCardEdit,
      "vcard-remove-property"
    );
    EventUtils.synthesizeMouseAtCenter(removeButton, {}, abWindow);
    await removeEvent;

    await Assert.ok(
      !vCardEdit.vCardProperties.getFirstEntry(propertyName),
      `${propertyName} is removed.`
    );
    Assert.equal(
      vCardEdit.querySelectorAll(propertySelector).length,
      0,
      `All elements representing ${propertyName} are removed.`
    );

    // For single entries the add button have to be visible again.
    // Time Zone, Notes, Organizational Properties, Custom Properties
    if (addButton) {
      Assert.ok(
        BrowserTestUtils.isVisible(abDocument.getElementById(addButton)),
        `Add button for ${propertyName} is visible after remove.`
      );
      Assert.equal(
        abDocument.activeElement.id,
        addButton,
        `The focus for ${propertyName} was moved to the add button.`
      );
    }
  }

  const saveEditButton = abDocument.getElementById("saveEditButton");
  const editButton = abDocument.getElementById("editButton");
  EventUtils.synthesizeMouseAtCenter(saveEditButton, {}, abWindow);
  await notInEditingMode(editButton);

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});
