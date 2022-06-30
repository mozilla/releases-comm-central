/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);

var { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_setup(async function() {
  let card1 = personalBook.addCard(createContact("victor", "test"));
  personalBook.addCard(createContact("romeo", "test", undefined, ""));
  let card3 = personalBook.addCard(createContact("oscar", "test"));
  personalBook.addCard(createContact("mike", "test", undefined, ""));
  let list1 = personalBook.addMailList(createMailingList("list 1"));
  list1.addCard(card1);
  list1.addCard(card3);
  let list2 = personalBook.addMailList(createMailingList("list 2"));
  list2.addCard(card3);

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());

  let calendar = CalendarTestUtils.createCalendar();

  registerCleanupFunction(async () => {
    personalBook.deleteDirectory(list1);
    personalBook.deleteDirectory(list2);
    personalBook.deleteCards(personalBook.childCards);
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function testDisplayMultiple() {
  let abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  // In order; list 1, list 2, mike, oscar, romeo, victor.
  Assert.equal(cardsList.view.rowCount, 6);
  Assert.ok(detailsPane.hidden);

  // Select list 1 and check the list display.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await checkHeader("list 1");
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
  await checkHeader();
  await checkActionButtons(["list 1 <list 1>", "list 2 <list 2>"]);
  await checkList(["list 1", "list 2"]);

  // list 1 and mike (no address).
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(2),
    { ctrlKey: true },
    abWindow
  );
  await checkHeader();
  await checkActionButtons(["list 1 <list 1>"]);
  await checkList(["list 1", "mike test"]);

  // list 1 and oscar.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(3),
    { ctrlKey: true },
    abWindow
  );
  await checkHeader();
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
  await checkHeader();
  await checkActionButtons([], ["oscar test <oscar.test@invalid>"]);
  await checkList(["mike test", "oscar test"]);

  // mike (no address), oscar, romeo (no address) and victor.
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(5),
    { shiftKey: true },
    abWindow
  );
  await checkHeader();
  await checkActionButtons(
    [],
    ["oscar test <oscar.test@invalid>", "victor test <victor.test@invalid>"]
  );
  await checkList(["mike test", "oscar test", "romeo test", "victor test"]);

  // mike and romeo (no addresses).
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(4),
    { ctrlKey: true },
    abWindow
  );
  await checkHeader();
  await checkActionButtons();
  await checkList(["mike test", "romeo test"]);

  // Everything.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(5),
    { shiftKey: true },
    abWindow
  );
  await checkHeader();
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

function checkHeader(name) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let contactPhoto = abDocument.getElementById("viewContactPhoto");
  let contactName = abDocument.getElementById("viewContactName");
  let listName = abDocument.getElementById("viewListName");

  Assert.ok(
    BrowserTestUtils.is_hidden(contactPhoto),
    "contact photo should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.is_hidden(contactName),
    "contact name should be hidden"
  );
  if (name) {
    Assert.ok(
      BrowserTestUtils.is_visible(listName),
      "list name should be visible"
    );
    Assert.equal(listName.textContent, name, "list name is correct");
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(listName),
      "list name should be hidden"
    );
  }
}

async function checkActionButtons(
  listAddresses = [],
  cardAddresses = [],
  eventAddresses = cardAddresses
) {
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let writeButton = abDocument.getElementById("detailsWriteButton");
  let eventButton = abDocument.getElementById("detailsEventButton");
  let searchButton = abDocument.getElementById("detailsSearchButton");
  let newListButton = abDocument.getElementById("detailsNewListButton");

  if (cardAddresses.length || listAddresses.length) {
    // Write.
    Assert.ok(
      BrowserTestUtils.is_visible(writeButton),
      "write button is visible"
    );

    let composeWindowPromise = BrowserTestUtils.domWindowOpened();
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
    let eventWindow = await eventWindowPromise;

    let iframe = eventWindow.document.getElementById(
      "calendar-item-panel-iframe"
    );
    let tabPanels = iframe.contentDocument.getElementById(
      "event-grid-tabpanels"
    );
    let attendeesTabPanel = iframe.contentDocument.getElementById(
      "event-grid-tabpanel-attendees"
    );
    Assert.equal(
      tabPanels.selectedPanel,
      attendeesTabPanel,
      "attendees are displayed"
    );
    let attendeeNames = attendeesTabPanel.querySelectorAll(
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
    let listWindowPromise = promiseLoadSubDialog(
      "chrome://messenger/content/addressbook/abMailListDialog.xhtml"
    );
    EventUtils.synthesizeMouseAtCenter(newListButton, {}, abWindow);
    let listWindow = await listWindowPromise;
    let memberNames = listWindow.document.querySelectorAll(
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
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let selectedCardsSection = abDocument.getElementById("selectedCards");
  let otherSections = abDocument.querySelectorAll(
    "#detailsBody > section:not(#detailsActions, #selectedCards)"
  );

  Assert.ok(BrowserTestUtils.is_visible(selectedCardsSection));
  for (let section of otherSections) {
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
