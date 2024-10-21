/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);

var { VCardUtils } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);

add_setup(async function () {
  const card1 = personalBook.addCard(createContact("victor", "test"));
  personalBook.addCard(createContact("romeo", "test", undefined, ""));
  const card3 = personalBook.addCard(createContact("oscar", "test"));
  personalBook.addCard(createContact("mike", "test", undefined, ""));
  const card5 = personalBook.addCard(createContact("xray", "test"));
  const card6 = personalBook.addCard(createContact("yankee", "test"));
  const card7 = personalBook.addCard(createContact("zulu", "test"));
  const list1 = personalBook.addMailList(createMailingList("list 1"));
  list1.addCard(card1);
  list1.addCard(card3);
  list1.addCard(card5);
  list1.addCard(card6);
  list1.addCard(card7);
  const list2 = personalBook.addMailList(createMailingList("list 2"));
  list2.addCard(card3);

  // We'll try composing, so need an account.
  const account = MailServices.accounts.createAccount();
  const identity = MailServices.accounts.createIdentity();
  identity.email = "mochitest@localhost";
  account.addIdentity(identity);
  account.incomingServer = MailServices.accounts.createIncomingServer(
    "user",
    "test",
    "pop3"
  );
  MailServices.accounts.defaultAccount = account;

  const calendar = CalendarTestUtils.createCalendar();

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testSelectMultiple() {
  const abWindow = await openAddressBookWindow();
  await openDirectory(personalBook);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  // In order; list 1, list 2, mike, oscar, romeo, victor, xray, yankee, zulu.
  Assert.equal(cardsList.view.rowCount, 9);
  Assert.ok(detailsPane.hidden);

  // Select list 1 and check the list display.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await checkHeader({ listName: "list 1" });
  await checkActionButtons(
    ["list 1 <list 1>"],
    [],
    [
      "victor test <victor.test@invalid>",
      "oscar test <oscar.test@invalid>",
      "xray test <xray.test@invalid>",
      "yankee test <yankee.test@invalid>",
      "zulu test <zulu.test@invalid>",
    ]
  );
  await checkList([
    "oscar test",
    "victor test",
    "xray test",
    "yankee test",
    "zulu test",
  ]);

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

add_task(async function testDeleteMultiple() {
  const abWindow = await openAddressBookWindow();
  const booksList = abWindow.booksList;

  // Open mailing list list1.
  booksList.getRowAtIndex(2).click();

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  // In order; oscar, victor, xray, yankee, zulu.
  Assert.equal(cardsList.view.rowCount, 5);
  Assert.ok(detailsPane.hidden);

  // Select victor and yankee.
  await TestUtils.waitForTick();
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(3),
    { accelKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "contacts" });
  await checkList(["victor test", "yankee test"]);

  // Delete victor and yankee.
  let deletePromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await deletePromise;
  await TestUtils.topicObserved("addrbook-list-member-removed");
  Assert.equal(cardsList.view.rowCount, 3);
  Assert.ok(
    detailsPane.hidden,
    "The details pane should be cleared after removing two mailing list members."
  );

  // Select all contacts.
  await TestUtils.waitForTick();
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(2),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 3, selectionType: "contacts" });
  await checkList(["oscar test", "xray test", "zulu test"]);

  // Delete all contacts.
  deletePromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await deletePromise;
  await TestUtils.topicObserved("addrbook-list-member-removed");
  Assert.equal(cardsList.view.rowCount, 0);
  Assert.ok(
    detailsPane.hidden,
    "The details pane should be cleared after removing all mailing list members."
  );

  // Open address book personalBook.
  booksList.getRowAtIndex(1).click();

  // In order; list 1, list 2, mike, oscar, romeo, victor, xray, yankee, zulu.
  Assert.equal(cardsList.view.rowCount, 9);
  Assert.ok(detailsPane.hidden);

  // Select list 2 and victor.
  await TestUtils.waitForTick();
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(5),
    { accelKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 2, selectionType: "mixed" });
  await checkList(["list 2", "victor test"]);

  // Delete list 2 and victor.
  deletePromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await deletePromise;
  await TestUtils.topicObserved("addrbook-contact-deleted");
  Assert.equal(cardsList.view.rowCount, 7);
  Assert.ok(
    detailsPane.hidden,
    "The details pane should be cleared after deleting one list and one contact."
  );

  // Select all contacts.
  await TestUtils.waitForTick();
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(6),
    { shiftKey: true },
    abWindow
  );
  await checkHeader({ selectionCount: 7, selectionType: "mixed" });
  await checkList([
    "list 1",
    "mike test",
    "oscar test",
    "romeo test",
    "xray test",
    "yankee test",
    "zulu test",
  ]);

  // Delete all contacts.
  deletePromise = BrowserTestUtils.promiseAlertDialog("accept");
  EventUtils.synthesizeKey("VK_DELETE", {}, window);
  await deletePromise;
  await TestUtils.topicObserved("addrbook-contact-deleted");
  Assert.equal(cardsList.view.rowCount, 0);
  Assert.ok(
    detailsPane.hidden,
    "The details pane should be cleared after removing all contacts."
  );
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
    BrowserTestUtils.isHidden(contactPhoto),
    "contact photo should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(contactName),
    "contact name should be hidden"
  );
  if (listName) {
    Assert.ok(
      BrowserTestUtils.isVisible(listHeader),
      "list header should be visible"
    );
    Assert.equal(
      listHeader.textContent,
      listName,
      "list header text is correct"
    );
    Assert.ok(
      BrowserTestUtils.isHidden(selectionHeader),
      "selection header should be hidden"
    );
  } else {
    Assert.ok(
      BrowserTestUtils.isHidden(listHeader),
      "list header should be hidden"
    );
    Assert.ok(
      BrowserTestUtils.isVisible(selectionHeader),
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
      BrowserTestUtils.isVisible(writeButton),
      "write button is visible"
    );

    const composeWindowPromise = BrowserTestUtils.domWindowOpened();
    EventUtils.synthesizeMouseAtCenter(writeButton, {}, abWindow);
    await checkComposeWindow(await composeWindowPromise, [
      ...listAddresses,
      ...cardAddresses,
    ]);
  }

  if (eventAddresses.length) {
    // Event.
    Assert.ok(
      BrowserTestUtils.isVisible(eventButton),
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
    Assert.ok(BrowserTestUtils.isHidden(eventButton), "event button is hidden");
  }

  if (cardAddresses.length) {
    // New List.
    Assert.ok(
      BrowserTestUtils.isVisible(newListButton),
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
      BrowserTestUtils.isHidden(newListButton),
      "new list button is hidden"
    );
  }

  Assert.ok(BrowserTestUtils.isHidden(searchButton), "search button is hidden");
}

function checkList(names) {
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const selectedCardsSection = abDocument.getElementById("selectedCards");
  const otherSections = abDocument.querySelectorAll(
    "#detailsBody > section:not(#detailsActions, #selectedCards)"
  );

  Assert.ok(BrowserTestUtils.isVisible(selectedCardsSection));
  for (const section of otherSections) {
    Assert.ok(BrowserTestUtils.isHidden(section), `${section.id} is hidden`);
  }

  Assert.deepEqual(
    Array.from(
      selectedCardsSection.querySelectorAll("li .name"),
      li => li.textContent
    ),
    names
  );
}
