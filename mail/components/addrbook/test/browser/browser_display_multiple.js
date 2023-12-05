/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_setup(async function () {
  const card1 = personalBook.addCard(createContact("victor", "test"));
  personalBook.addCard(createContact("romeo", "test", undefined, ""));
  const card3 = personalBook.addCard(createContact("oscar", "test"));
  personalBook.addCard(createContact("mike", "test", undefined, ""));
  const list1 = personalBook.addMailList(createMailingList("list 1"));
  list1.addCard(card1);
  list1.addCard(card3);
  const list2 = personalBook.addMailList(createMailingList("list 2"));
  list2.addCard(card3);

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  const calendar = CalendarTestUtils.createCalendar();

  registerCleanupFunction(async () => {
    personalBook.deleteDirectory(list1);
    personalBook.deleteDirectory(list2);
    personalBook.deleteCards(personalBook.childCards);
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testDisplayMultiple() {
  const abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  // In order; list 1, list 2, mike, oscar, romeo, victor.
  Assert.equal(cardsList.view.rowCount, 6);
  Assert.ok(detailsPane.hidden);

  // Select list 1 and check the list display.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await checkHeader({ listName: "list 1" });
  await checkActionButtons(
    ["list 1 <list 1>"],
    [],
    ["victor test <victor.test@invalid>", "oscar test <oscar.test@invalid>"]
  );
  await checkList(["oscar test", "victor test"]);

  // list 1 and list 2.
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(1),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "lists" });
  await checkActionButtons(["list 1 <list 1>", "list 2 <list 2>"]);
  await checkList(["list 1", "list 2"]);

  // list 1 and mike (no address).
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(2),
    { accelKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "mixed" });
  await checkActionButtons(["list 1 <list 1>"]);
  await checkList(["list 1", "mike test"]);

  // list 1 and oscar.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(3),
    { accelKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "mixed" });
  await checkActionButtons(
    ["list 1 <list 1>"],
    ["oscar test <oscar.test@invalid>"]
  );
  await checkList(["list 1", "oscar test"]);

  // mike (no address) and oscar.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(3),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "contacts" });
  await checkActionButtons([], ["oscar test <oscar.test@invalid>"]);
  await checkList(["mike test", "oscar test"]);

  // mike (no address), oscar, romeo (no address) and victor.
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(5),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 4, selectionType: "contacts" });
  await checkActionButtons(
    [],
    ["oscar test <oscar.test@invalid>", "victor test <victor.test@invalid>"]
  );
  await checkList(["mike test", "oscar test", "romeo test", "victor test"]);

  // mike and romeo (no addresses).
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(4),
    { accelKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "contacts" });
  await checkActionButtons();
  await checkList(["mike test", "romeo test"]);

  // Everything.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(5),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 6, selectionType: "mixed" });
  await checkActionButtons(
    ["list 1 <list 1>", "list 2 <list 2>"],
    ["oscar test <oscar.test@invalid>", "victor test <victor.test@invalid>"]
  );
  await checkList([
    "list 1",
    "list 2",
    "mike test",
    "oscar test",
    "romeo test",
    "victor test",
  ]);

  await closeAddressBookWindow();
});

function checkHeader({ listName, selectionCount, selectionType } = {}) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const contactPhoto = abDocument.getElementById("viewContactPhoto");
  const contactName = abDocument.getElementById("viewContactName");
  const listHeader = abDocument.getElementById("viewListName");
  const selectionHeader = abDocument.getElementById("viewSelectionCount");

  Assert.ok(
    BrowserTestUtils.is_hidden(contactPhoto),
    "contact photo should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_hidden(contactName),
    "contact name should be hidden"
  );
  if (listName) {
    Assert.ok(
      BrowserTestUtils.is_visible(listHeader),
      "list header should be visible"
    );
    Assert.equal(
      listHeader.textContent,
      listName,
      "list header text is correct"
    );
    Assert.ok(
      BrowserTestUtils.is_hidden(selectionHeader),
      "selection header should be hidden"
    );
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(listHeader),
      "list header should be hidden"
    );
    Assert.ok(
      BrowserTestUtils.is_visible(selectionHeader),
      "selection header should be visible"
    );
    Assert.deepEqual(abDocument.l10n.getAttributes(selectionHeader), {
      id: `about-addressbook-selection-${selectionType}-header2`,
      args: {
        count: selectionCount,
      },
    });
  }
}

async function checkActionButtons(
  listAddresses = [],
  cardAddresses = [],
  eventAddresses = cardAddresses
) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const writeButton = abDocument.getElementById("detailsWriteButton");
  const eventButton = abDocument.getElementById("detailsEventButton");
  const searchButton = abDocument.getElementById("detailsSearchButton");
  const newListButton = abDocument.getElementById("detailsNewListButton");

  if (cardAddresses.length || listAddresses.length) {
    // Write.
    Assert.ok(
      BrowserTestUtils.is_visible(writeButton),
      "write button is visible"
    );

    const composeWindowPromise = BrowserTestUtils.domWindowOpened();
    EventUtils.synthesizeMouseAtCenter(writeButton, {}, abWindow);
    await checkComposeWindow(
      await composeWindowPromise,
      ...listAddresses,
      ...cardAddresses
    );
  }

  if (eventAddresses.length) {
    // Event.
    Assert.ok(
      BrowserTestUtils.is_visible(eventButton),
      "event button is visible"
    );

    let eventWindowPromise = CalendarTestUtils.waitForEventDialog("edit");
    EventUtils.synthesizeMouseAtCenter(eventButton, {}, abWindow);
    const eventWindow = await eventWindowPromise;

    const iframe = eventWindow.document.getElementById(
      "calendar-item-panel-iframe"
    );
    const tabPanels = iframe.contentDocument.getElementById(
      "event-grid-tabpanels"
    );
    const attendeesTabPanel = iframe.contentDocument.getElementById(
      "event-grid-tabpanel-attendees"
    );
    Assert.equal(
      tabPanels.selectedPanel,
      attendeesTabPanel,
      "attendees are displayed"
    );
    const attendeeNames = attendeesTabPanel.querySelectorAll(
      ".attendee-list .attendee-name"
    );
    Assert.deepEqual(
      Array.from(attendeeNames, a => a.textContent),
      eventAddresses,
      "attendees are correct"
    );

    eventWindowPromise = BrowserTestUtils.domWindowClosed(eventWindow);
    BrowserTestUtils.promiseAlertDialog("extra1");
    EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);
    await eventWindowPromise;
    await new Promise(resolve => abWindow.setTimeout(resolve));
    Assert.report(false, undefined, undefined, "Item dialog closed");
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(eventButton),
      "event button is hidden"
    );
  }

  if (cardAddresses.length) {
    // New List.
    Assert.ok(
      BrowserTestUtils.is_visible(newListButton),
      "new list button is visible"
    );
    const listWindowPromise = promiseLoadSubDialog(
      "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
    );
    EventUtils.synthesizeMouseAtCenter(newListButton, {}, abWindow);
    const listWindow = await listWindowPromise;
    const memberNames = listWindow.document.querySelectorAll(
      ".textbox-addressingWidget"
    );
    Assert.deepEqual(
      Array.from(memberNames, aw => aw.value),
      [...cardAddresses, ""],
      "list members are correct"
    );

    EventUtils.synthesizeKey("VK_ESCAPE", {}, listWindow);
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(newListButton),
      "new list button is hidden"
    );
  }

  Assert.ok(
    BrowserTestUtils.is_hidden(searchButton),
    "search button is hidden"
  );
}

function checkList(names) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const selectedCardsSection = abDocument.getElementById("selectedCards");
  const otherSections = abDocument.querySelectorAll(
    "#detailsBody > section:not(#detailsActions, #selectedCards)"
  );

  Assert.ok(BrowserTestUtils.is_visible(selectedCardsSection));
  for (const section of otherSections) {
    Assert.ok(BrowserTestUtils.is_hidden(section), `${section.id} is hidden`);
  }

  Assert.deepEqual(
    Array.from(
      selectedCardsSection.querySelectorAll("li .name"),
      li => li.textContent
    ),
    names
  );
}

/**
 * Tests that when the last contacts of an address book are deleted via a
 * multiple selection the display of the selected cards gets updated and do not
 * shows the deleted contacts.
 */
add_task(async function testLastContactsViaSelectionRemoved() {
  const book1 = createAddressBook("Book 1");
  book1.addCard(createContact("daniel", "test"));
  book1.addCard(createContact("jonathan", "test"));

  const abWindow = await openAddressBookWindow();
  openDirectory(book1);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  // Select all contacts.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(1),
    { shiftKey: true },
    abWindow
  );
  await checkList(["daniel test", "jonathan test"]);

  // Delete all selected contacts.
  const deletePromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await deletePromise;

  await TestUtils.topicObserved("addrbook-contact-deleted");
  // await TestUtils.topicObserved("addrbook-contact-deleted");
  Assert.ok(detailsPane.hidden, "The details pane is cleared.");

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book1.URI);
});
