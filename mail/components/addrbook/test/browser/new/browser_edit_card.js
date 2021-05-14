/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

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
    Assert.equal(abWindow.document.getElementById(key).value, value);
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
    abWindow.document.getElementById(key).value = value;
  }
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

  // Select a card in the list. Check the display in view mode.

  Assert.equal(cardsList.view.rowCount, 1);
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));

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

  // Make some changes but cancel them.

  setInputValues({
    LastName: "one",
    DisplayName: "contact one",
    SecondEmail: "i@roman.invalid",
  });

  EventUtils.synthesizeMouseAtCenter(cancelEditButton, {}, abWindow);
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
