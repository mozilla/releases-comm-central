/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);
// TODO: Fix the UI so that we don't have to do this.
window.maximize();

var { CalendarTestUtils } = ChromeUtils.import(
  "resource://testing-common/calendar/CalendarTestUtils.jsm"
);
var { VCardUtils } = ChromeUtils.import("resource:///modules/VCardUtils.jsm");

add_setup(async function() {
  personalBook.addCard(
    VCardUtils.vCardToAbCard("BEGIN:VCARD\r\nEND:VCARD\r\n")
  );
  personalBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      FN:basic person
      EMAIL:basic@invalid
      END:VCARD
    `)
  );
  personalBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      FN:complex person
      EMAIL:secondary@invalid
      EMAIL;PREF=1:primary@invalid
      EMAIL;TYPE=WORK:tertiary@invalid
      TEL;VALUE=URI:tel:000-0000
      TEL;TYPE=WORK,VOICE:111-1111
      TEL;TYPE=VOICE,WORK:222-2222
      TEL;TYPE=HOME;TYPE=VIDEO:tel:333-3333
      ADR:;;street,suburb;city;state;zip;country
      ANNIVERSARY:2018-06-11
      BDAY;VALUE=DATE:--0403
      NOTE:mary had a little lamb\\nits fleece was white as snow\\nand everywhere t
       hat mary went\\nthe lamb was sure to go
      ORG:thunderbird;engineering
      ROLE:sheriff
      TITLE:senior engineering lead
      TZ;VALUE=TEXT:Pacific/Auckland
      URL;TYPE=work:https://www.thunderbird.net/
      END:VCARD
    `)
  );

  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());

  let calendar = CalendarTestUtils.createCalendar();

  registerCleanupFunction(async () => {
    personalBook.deleteCards(personalBook.childCards);
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
  });
});

add_task(async function test_display() {
  let abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let h1 = abDocument.querySelector("#detailsHeader h1");
  let h2 = abDocument.querySelector("#detailsHeader h2");
  let editButton = abDocument.getElementById("editButton");

  let emailAddressesSection = abDocument.getElementById("emailAddresses");
  let phoneNumbersSection = abDocument.getElementById("phoneNumbers");
  let addressesSection = abDocument.getElementById("addresses");
  let notesSection = abDocument.getElementById("notes");
  let otherInfoSection = abDocument.getElementById("otherInfo");

  Assert.equal(cardsList.view.rowCount, 3);
  Assert.ok(detailsPane.hidden);

  // Card 0: an empty card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  // Header.
  Assert.equal(h1.textContent, "");
  Assert.equal(h2.textContent, "");

  // Action buttons.
  await checkActionButtons();
  Assert.ok(BrowserTestUtils.is_visible(editButton));

  Assert.ok(BrowserTestUtils.is_hidden(emailAddressesSection));
  Assert.ok(BrowserTestUtils.is_hidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.is_hidden(addressesSection));
  Assert.ok(BrowserTestUtils.is_hidden(notesSection));
  Assert.ok(BrowserTestUtils.is_hidden(otherInfoSection));

  // Card 1: an basic card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  // Header.
  Assert.equal(h1.textContent, "basic person");
  Assert.equal(h2.textContent, "basic@invalid");

  // Action buttons.
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.is_visible(editButton));

  // Email section.
  Assert.ok(BrowserTestUtils.is_visible(emailAddressesSection));
  let items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(
    items[0].querySelector("a").href,
    `mailto:basic%20person%20%3Cbasic%40invalid%3E`
  );
  Assert.equal(items[0].querySelector("a").textContent, "basic@invalid");

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();
  EventUtils.synthesizeMouseAtCenter(items[0].querySelector("a"), {}, abWindow);
  await checkComposeWindow(
    await composeWindowPromise,
    "basic person <basic@invalid>"
  );

  // Other sections.
  Assert.ok(BrowserTestUtils.is_hidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.is_hidden(addressesSection));
  Assert.ok(BrowserTestUtils.is_hidden(notesSection));
  Assert.ok(BrowserTestUtils.is_hidden(otherInfoSection));

  // Card 2: an complex card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  // Header.
  Assert.equal(h1.textContent, "complex person");
  Assert.equal(h2.textContent, "primary@invalid");

  // Action buttons.
  await checkActionButtons(
    "primary@invalid",
    "complex person",
    "primary@invalid secondary@invalid tertiary@invalid"
  );
  Assert.ok(BrowserTestUtils.is_visible(editButton));

  // Email section.
  Assert.ok(BrowserTestUtils.is_visible(emailAddressesSection));
  items = emailAddressesSection.querySelectorAll("li");
  Assert.equal(items.length, 3);

  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(
    items[0].querySelector("a").href,
    `mailto:complex%20person%20%3Csecondary%40invalid%3E`
  );
  Assert.equal(items[0].querySelector("a").textContent, "secondary@invalid");

  Assert.equal(items[1].querySelector(".entry-type").textContent, "");
  Assert.equal(
    items[1].querySelector("a").href,
    `mailto:complex%20person%20%3Cprimary%40invalid%3E`
  );
  Assert.equal(items[1].querySelector("a").textContent, "primary@invalid");

  Assert.equal(
    items[2].querySelector(".entry-type").dataset.l10nId,
    "about-addressbook-entry-type-work"
  );
  Assert.equal(
    items[2].querySelector("a").href,
    `mailto:complex%20person%20%3Ctertiary%40invalid%3E`
  );
  Assert.equal(items[2].querySelector("a").textContent, "tertiary@invalid");

  composeWindowPromise = BrowserTestUtils.domWindowOpened();
  EventUtils.synthesizeMouseAtCenter(items[2].querySelector("a"), {}, abWindow);
  await checkComposeWindow(
    await composeWindowPromise,
    "complex person <tertiary@invalid>"
  );

  // Phone numbers section.
  Assert.ok(BrowserTestUtils.is_visible(phoneNumbersSection));
  items = phoneNumbersSection.querySelectorAll("li");
  Assert.equal(items.length, 4);

  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(items[0].querySelector(".entry-value").textContent, "000-0000");

  Assert.equal(
    items[1].querySelector(".entry-type").dataset.l10nId,
    "about-addressbook-entry-type-work"
  );
  Assert.equal(items[1].querySelector(".entry-value").textContent, "111-1111");

  Assert.equal(
    items[2].querySelector(".entry-type").dataset.l10nId,
    "about-addressbook-entry-type-work"
  );
  Assert.equal(items[2].querySelector(".entry-value").textContent, "222-2222");

  Assert.equal(
    items[3].querySelector(".entry-type").dataset.l10nId,
    "about-addressbook-entry-type-home"
  );
  Assert.equal(items[3].querySelector(".entry-value").textContent, "333-3333");

  // Addresses section.
  Assert.ok(BrowserTestUtils.is_visible(addressesSection));
  items = addressesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);

  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(items[0].querySelector(".entry-value").childNodes.length, 11);
  Assert.deepEqual(
    Array.from(
      items[0].querySelector(".entry-value").childNodes,
      n => n.textContent
    ),
    ["street", "", "suburb", "", "city", "", "state", "", "zip", "", "country"]
  );

  // Notes section.
  Assert.ok(BrowserTestUtils.is_visible(notesSection));
  Assert.equal(
    notesSection.querySelector("div").textContent,
    "mary had a little lamb\nits fleece was white as snow\nand everywhere that mary went\nthe lamb was sure to go"
  );

  // Other sections.
  Assert.ok(BrowserTestUtils.is_visible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 8);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-birthday"
  );
  Assert.equal(items[0].children[1].textContent, "April 3");
  Assert.equal(
    items[1].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[1].children[1].textContent, "June 11, 2018");
  Assert.equal(
    items[2].children[0].dataset.l10nId,
    "about-addressbook-entry-name-title"
  );
  Assert.equal(items[2].children[1].textContent, "senior engineering lead");
  Assert.equal(
    items[3].children[0].dataset.l10nId,
    "about-addressbook-entry-name-role"
  );
  Assert.equal(items[3].children[1].textContent, "sheriff");
  Assert.equal(
    items[4].children[0].dataset.l10nId,
    "about-addressbook-entry-name-department"
  );
  Assert.equal(items[4].children[1].textContent, "engineering");
  Assert.equal(
    items[5].children[0].dataset.l10nId,
    "about-addressbook-entry-name-organization"
  );
  Assert.equal(items[5].children[1].textContent, "thunderbird");
  Assert.equal(
    items[6].children[0].dataset.l10nId,
    "about-addressbook-entry-name-website"
  );
  Assert.equal(
    items[6].children[1].querySelector("a").href,
    "https://www.thunderbird.net/"
  );
  Assert.equal(
    items[6].children[1].querySelector("a").textContent,
    "www.thunderbird.net"
  );
  Assert.equal(
    items[7].children[0].dataset.l10nId,
    "about-addressbook-entry-name-time-zone"
  );
  Assert.equal(items[7].children[1].firstChild.nodeValue, "Pacific/Auckland");
  Assert.equal(
    items[7].children[1].lastChild.getAttribute("is"),
    "active-time"
  );
  Assert.equal(
    items[7].children[1].lastChild.getAttribute("tz"),
    "Pacific/Auckland"
  );

  // Card 0, again, just to prove that everything was cleared properly.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.is_visible(detailsPane)
  );

  // Header.
  Assert.equal(h1.textContent, "");
  Assert.equal(h2.textContent, "");

  // Action buttons.
  await checkActionButtons();
  Assert.ok(BrowserTestUtils.is_visible(editButton));

  Assert.ok(BrowserTestUtils.is_hidden(emailAddressesSection));
  Assert.ok(BrowserTestUtils.is_hidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.is_hidden(addressesSection));
  Assert.ok(BrowserTestUtils.is_hidden(notesSection));
  Assert.ok(BrowserTestUtils.is_hidden(otherInfoSection));
});

/**
 * Checks that the edit button is hidden for read-only contacts.
 */
add_task(async function testReadOnlyActions() {
  let readOnlyBook = createAddressBook("Read-Only Book");
  let readOnlyList = readOnlyBook.addMailList(
    createMailingList("Read-Only List")
  );
  readOnlyBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      FN:read-only person
      END:VCARD
    `)
  );
  readOnlyList.addCard(
    readOnlyBook.addCard(
      VCardUtils.vCardToAbCard(formatVCard`
        BEGIN:VCARD
        FN:read-only person with email
        EMAIL:read.only@invalid
        END:VCARD
      `)
    )
  );
  readOnlyBook.setBoolValue("readOnly", true);

  let abWindow = await openAddressBookWindow();

  let abDocument = abWindow.document;
  let cardsList = abDocument.getElementById("cards");
  let detailsPane = abDocument.getElementById("detailsPane");

  let actions = abDocument.getElementById("detailsActions");
  let editButton = abDocument.getElementById("editButton");

  // Check contacts with the book displayed.

  openDirectory(readOnlyBook);
  Assert.equal(cardsList.view.rowCount, 3);
  Assert.ok(detailsPane.hidden);

  // Without email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  Assert.ok(BrowserTestUtils.is_hidden(actions), "actions section is hidden");

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.is_hidden(editButton), "editButton is hidden");

  // Check contacts with the list displayed.

  openDirectory(readOnlyList);
  Assert.equal(cardsList.view.rowCount, 1);
  Assert.ok(detailsPane.hidden);

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  Assert.ok(BrowserTestUtils.is_visible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.is_hidden(editButton), "editButton is hidden");

  // Check contacts with All Address Books displayed.

  openAllAddressBooks();
  Assert.equal(cardsList.view.rowCount, 6);
  Assert.ok(detailsPane.hidden);

  // Basic person from Personal Address Books.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  Assert.ok(BrowserTestUtils.is_visible(actions), "actions section is shown");
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.is_visible(editButton), "edit button is shown");

  // Without email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(4), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  Assert.ok(BrowserTestUtils.is_hidden(actions), "actions section is hidden");

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(5), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.is_hidden(editButton), "editButton is hidden");

  // Basic person again, to prove the buttons aren't hidden forever.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(BrowserTestUtils.is_visible(detailsPane));
  Assert.ok(BrowserTestUtils.is_visible(actions), "actions section is shown");
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.is_visible(editButton), "edit button is shown");

  await promiseDirectoryRemoved(readOnlyBook.URI);
});

async function checkActionButtons(
  primaryEmail,
  displayName,
  searchString = primaryEmail
) {
  let tabmail = document.getElementById("tabmail");
  let abWindow = getAddressBookWindow();
  let abDocument = abWindow.document;

  let writeButton = abDocument.getElementById("detailsWriteButton");
  let eventButton = abDocument.getElementById("detailsEventButton");
  let searchButton = abDocument.getElementById("detailsSearchButton");

  if (primaryEmail) {
    // Write.
    Assert.ok(
      BrowserTestUtils.is_visible(writeButton),
      "write button is visible"
    );

    let composeWindowPromise = BrowserTestUtils.domWindowOpened();
    EventUtils.synthesizeMouseAtCenter(writeButton, {}, abWindow);
    await checkComposeWindow(
      await composeWindowPromise,
      `${displayName} <${primaryEmail}>`
    );

    // Search. Do this before the event test to stop a strange macOS failure.
    Assert.ok(
      BrowserTestUtils.is_visible(searchButton),
      "search button is visible"
    );

    let searchTabPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
    EventUtils.synthesizeMouseAtCenter(searchButton, {}, abWindow);
    let {
      detail: { tabInfo: searchTab },
    } = await searchTabPromise;

    let searchBox = tabmail.selectedTab.panel.querySelector(".searchBox");
    Assert.equal(searchBox.value, searchString);

    searchTabPromise = BrowserTestUtils.waitForEvent(window, "TabClose");
    tabmail.closeTab(searchTab);
    await searchTabPromise;

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
    let attendeeName = attendeesTabPanel.querySelector(
      ".attendee-list .attendee-name"
    );
    Assert.equal(
      attendeeName.textContent,
      `${displayName} <${primaryEmail}>`,
      "contact is an attendee"
    );

    eventWindowPromise = BrowserTestUtils.domWindowClosed(eventWindow);
    BrowserTestUtils.promiseAlertDialog("extra1");
    EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);
    await eventWindowPromise;
    Assert.report(false, undefined, undefined, "Item dialog closed");
  } else {
    Assert.ok(
      BrowserTestUtils.is_hidden(writeButton),
      "write button is hidden"
    );
    Assert.ok(
      BrowserTestUtils.is_hidden(eventButton),
      "event button is hidden"
    );
    Assert.ok(
      BrowserTestUtils.is_hidden(searchButton),
      "search button is hidden"
    );
  }
}
