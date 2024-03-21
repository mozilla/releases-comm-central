/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

requestLongerTimeout(2);

var { CalendarTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/calendar/CalendarTestUtils.sys.mjs"
);
var { MockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);

var { VCardUtils } = ChromeUtils.importESModule(
  "resource:///modules/VCardUtils.sys.mjs"
);
var { AddrBookCard } = ChromeUtils.importESModule(
  "resource:///modules/AddrBookCard.sys.mjs"
);

/** @implements {nsIExternalProtocolService} */
const mockExternalProtocolService = {
  _loadedURLs: [],
  externalProtocolHandlerExists(aProtocolScheme) {},
  getApplicationDescription(aScheme) {},
  getProtocolHandlerInfo(aProtocolScheme) {},
  getProtocolHandlerInfoFromOS(aProtocolScheme, aFound) {},
  isExposedProtocol(aProtocolScheme) {},
  loadURI(aURI, aWindowContext) {
    this._loadedURLs.push(aURI.spec);
  },
  setProtocolHandlerDefaults(aHandlerInfo, aOSHandlerExists) {},
  urlLoaded(aURL) {
    return this._loadedURLs.includes(aURL);
  },
  QueryInterface: ChromeUtils.generateQI(["nsIExternalProtocolService"]),
};

add_setup(async function () {
  // Card 0.
  personalBook.addCard(
    VCardUtils.vCardToAbCard("BEGIN:VCARD\r\nEND:VCARD\r\n")
  );
  // Card 1.
  personalBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      FN:basic person
      EMAIL:basic@invalid
      END:VCARD
    `)
  );
  // Card 2.
  personalBook.addCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      FN:complex person
      EMAIL:secondary@invalid
      EMAIL;PREF=1:primary@invalid
      EMAIL;TYPE=WORK:tertiary@invalid
      TEL;VALUE=URI:tel:000-0000
      TEL;TYPE=WORK,VOICE:callto:111-1111
      TEL;TYPE=VOICE,WORK:222-2222
      TEL;TYPE=HOME;TYPE=VIDEO:tel:333-3333
      ADR:;;street,suburb;city;state;zip;country
      ANNIVERSARY:2018-06-11
      BDAY;VALUE=DATE:--0229
      NOTE:mary had a little lamb\\nits fleece was white as snow\\nand everywhere t
       hat mary went\\nthe lamb was sure to go
      ORG:thunderbird;engineering
      ROLE:sheriff
      TITLE:senior engineering lead
      TZ;VALUE=TEXT:Pacific/Auckland
      URL;TYPE=work:https://www.thunderbird.net/
      IMPP:xmpp:cowboy@example.org
      END:VCARD
    `)
  );

  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  const calendar = CalendarTestUtils.createCalendar();

  const mockExternalProtocolServiceCID = MockRegistrar.register(
    "@mozilla.org/uriloader/external-protocol-service;1",
    mockExternalProtocolService
  );

  registerCleanupFunction(async () => {
    personalBook.deleteCards(personalBook.childCards);
    MailServices.accounts.removeAccount(account, true);
    CalendarTestUtils.removeCalendar(calendar);
    MockRegistrar.unregister(mockExternalProtocolServiceCID);
  });
});

/**
 * Checks basic display.
 */
add_task(async function testDisplay() {
  const abWindow = await openAddressBookWindow();
  openDirectory(personalBook);

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  const viewContactName = abDocument.getElementById("viewContactName");
  const viewPrimaryEmail = abDocument.getElementById("viewPrimaryEmail");
  const editButton = abDocument.getElementById("editButton");

  const emailAddressesSection = abDocument.getElementById("emailAddresses");
  const phoneNumbersSection = abDocument.getElementById("phoneNumbers");
  const addressesSection = abDocument.getElementById("addresses");
  const notesSection = abDocument.getElementById("notes");
  const websitesSection = abDocument.getElementById("websites");
  const imppSection = abDocument.getElementById("instantMessaging");
  const otherInfoSection = abDocument.getElementById("otherInfo");
  const selectedCardsSection = abDocument.getElementById("selectedCards");

  Assert.equal(cardsList.view.rowCount, personalBook.childCardCount);
  Assert.ok(detailsPane.hidden);

  // Card 0: an empty card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  // Header.
  Assert.equal(viewContactName.textContent, "");
  Assert.equal(viewPrimaryEmail.textContent, "");

  // Action buttons.
  await checkActionButtons();
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  Assert.ok(BrowserTestUtils.isHidden(emailAddressesSection));
  Assert.ok(BrowserTestUtils.isHidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.isHidden(addressesSection));
  Assert.ok(BrowserTestUtils.isHidden(notesSection));
  Assert.ok(BrowserTestUtils.isHidden(otherInfoSection));
  Assert.ok(BrowserTestUtils.isHidden(selectedCardsSection));

  // Card 1: an basic card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  // Header.
  Assert.equal(viewContactName.textContent, "basic person");
  Assert.equal(viewPrimaryEmail.textContent, "basic@invalid");

  // Action buttons.
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Email section.
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
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
  Assert.ok(BrowserTestUtils.isHidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.isHidden(addressesSection));
  Assert.ok(BrowserTestUtils.isHidden(notesSection));
  Assert.ok(BrowserTestUtils.isHidden(otherInfoSection));
  Assert.ok(BrowserTestUtils.isHidden(selectedCardsSection));

  // Card 2: an complex card.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  // Header.
  Assert.equal(viewContactName.textContent, "complex person");
  Assert.equal(viewPrimaryEmail.textContent, "primary@invalid");

  // Action buttons.
  await checkActionButtons(
    "primary@invalid",
    "complex person",
    "primary@invalid secondary@invalid tertiary@invalid"
  );
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Email section.
  Assert.ok(BrowserTestUtils.isVisible(emailAddressesSection));
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
  Assert.ok(BrowserTestUtils.isVisible(phoneNumbersSection));
  items = phoneNumbersSection.querySelectorAll("li");
  Assert.equal(items.length, 4);

  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(items[0].querySelector(".entry-value a").href, `tel:0000000`);

  Assert.equal(
    items[1].querySelector(".entry-type").dataset.l10nId,
    "about-addressbook-entry-type-work"
  );
  Assert.equal(items[1].querySelector(".entry-value").textContent, "111-1111");
  Assert.equal(items[1].querySelector(".entry-value a").href, `callto:1111111`);

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
  Assert.equal(items[3].querySelector(".entry-value a").href, `tel:3333333`);

  // Addresses section.
  Assert.ok(BrowserTestUtils.isVisible(addressesSection));
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
  Assert.ok(BrowserTestUtils.isVisible(notesSection));
  Assert.equal(
    notesSection.querySelector("div").textContent,
    "mary had a little lamb\nits fleece was white as snow\nand everywhere that mary went\nthe lamb was sure to go"
  );

  // Websites section
  Assert.ok(BrowserTestUtils.isVisible(websitesSection));
  items = websitesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-type-work"
  );
  Assert.equal(
    items[0].children[1].querySelector("a").href,
    "https://www.thunderbird.net/"
  );
  Assert.equal(
    items[0].children[1].querySelector("a").textContent,
    "www.thunderbird.net"
  );
  items[0].children[1].querySelector("a").scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    items[0].children[1].querySelector("a"),
    {},
    abWindow
  );
  await TestUtils.waitForCondition(
    () => mockExternalProtocolService.urlLoaded("https://www.thunderbird.net/"),
    "attempted to load website in a browser"
  );

  // Instant messaging section
  Assert.ok(BrowserTestUtils.isVisible(imppSection));
  items = imppSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[1].querySelector("a").href,
    "xmpp:cowboy@example.org"
  );

  // Other sections.
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 6, "number of <li> in section should be correct");
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-birthday"
  );
  Assert.equal(items[0].children[1].textContent, "February 29");
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
    "about-addressbook-entry-name-organization"
  );
  Assert.deepEqual(
    Array.from(
      items[4].querySelector(".entry-value").childNodes,
      n => n.textContent
    ),
    ["engineering", " • ", "thunderbird"]
  );
  Assert.equal(
    items[5].children[0].dataset.l10nId,
    "about-addressbook-entry-name-time-zone"
  );
  Assert.equal(items[5].children[1].firstChild.nodeValue, "Pacific/Auckland");
  Assert.equal(
    items[5].children[1].lastChild.getAttribute("is"),
    "active-time"
  );
  Assert.equal(
    items[5].children[1].lastChild.getAttribute("tz"),
    "Pacific/Auckland"
  );
  Assert.ok(BrowserTestUtils.isHidden(selectedCardsSection));

  // Card 0, again, just to prove that everything was cleared properly.

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  // Header.
  Assert.equal(viewContactName.textContent, "");
  Assert.equal(viewPrimaryEmail.textContent, "");

  // Action buttons.
  await checkActionButtons();
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  Assert.ok(BrowserTestUtils.isHidden(emailAddressesSection));
  Assert.ok(BrowserTestUtils.isHidden(phoneNumbersSection));
  Assert.ok(BrowserTestUtils.isHidden(addressesSection));
  Assert.ok(BrowserTestUtils.isHidden(notesSection));
  Assert.ok(BrowserTestUtils.isHidden(otherInfoSection));
  Assert.ok(BrowserTestUtils.isHidden(selectedCardsSection));

  await closeAddressBookWindow();
});

/**
 * Test the display of dates with various components missing.
 */
add_task(async function testDates() {
  const abWindow = await openAddressBookWindow();
  const otherInfoSection = abWindow.document.getElementById("otherInfo");

  // Year only.

  const yearCard = await addAndDisplayCard(formatVCard`
    BEGIN:VCARD
    EMAIL:xbasic3@invalid
    ANNIVERSARY:2005
    END:VCARD
  `);
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  let items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[0].children[1].textContent, "2005");

  // Year and month.

  const yearMonthCard = await addAndDisplayCard(formatVCard`
    BEGIN:VCARD
    EMAIL:xbasic4@invalid
    ANNIVERSARY:2006-06
    END:VCARD
  `);
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[0].children[1].textContent, "June 2006");

  // Month only.
  const monthCard = await addAndDisplayCard(formatVCard`
    BEGIN:VCARD
    EMAIL:xbasic5@invalid
    ANNIVERSARY:--12
    END:VCARD
  `);
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[0].children[1].textContent, "December");

  // Month and day.
  const monthDayCard = await addAndDisplayCard(formatVCard`
    BEGIN:VCARD
    EMAIL:xbasic6@invalid
    ANNIVERSARY;VALUE=DATE:--0704
    END:VCARD
  `);
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[0].children[1].textContent, "July 4");

  // Day only.
  const dayCard = await addAndDisplayCard(formatVCard`
    BEGIN:VCARD
    EMAIL:xbasic7@invalid
    ANNIVERSARY:---30
    END:VCARD
  `);
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-anniversary"
  );
  Assert.equal(items[0].children[1].textContent, "30");

  await closeAddressBookWindow();
  personalBook.deleteCards([
    yearCard,
    yearMonthCard,
    monthCard,
    monthDayCard,
    dayCard,
  ]);
});

/**
 * Only an organisation name.
 */
add_task(async function testOrganisationNameOnly() {
  const card = await addAndDisplayCard(
    VCardUtils.vCardToAbCard(formatVCard`
      BEGIN:VCARD
      ORG:organisation
      END:VCARD
    `)
  );

  const abWindow = await getAddressBookWindow();
  const viewContactName = abWindow.document.getElementById("viewContactName");
  Assert.equal(viewContactName.textContent, "organisation");

  await closeAddressBookWindow();
  personalBook.deleteCards([card]);
});

/**
 * Tests that custom properties (Custom1 etc.) are displayed.
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
  card = await addAndDisplayCard(card);

  const abWindow = await getAddressBookWindow();
  const otherInfoSection = abWindow.document.getElementById("otherInfo");

  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));

  const items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 3);
  // Custom 1 has no value, should not display.
  // Custom 2 has an old property value, should display that.

  await TestUtils.waitForCondition(() => {
    return items[0].children[0].textContent;
  }, "text not created in time");

  Assert.equal(items[0].children[0].textContent, "Custom 2");
  Assert.equal(items[0].children[1].textContent, "custom two");
  // Custom 3 has a vCard property value, should display that.
  Assert.equal(items[1].children[0].textContent, "Custom 3");
  Assert.equal(items[1].children[1].textContent, "x-custom three");
  // Custom 4 has both types of value, the vCard value should be displayed.
  Assert.equal(items[2].children[0].textContent, "Custom 4");
  Assert.equal(items[2].children[1].textContent, "x-custom four");

  await closeAddressBookWindow();
  personalBook.deleteCards([card]);
});

/**
 * Checks that the edit button is hidden for read-only contacts.
 */
add_task(async function testReadOnlyActions() {
  const readOnlyBook = createAddressBook("Read-Only Book");
  const readOnlyList = readOnlyBook.addMailList(
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

  const abWindow = await openAddressBookWindow();

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");
  const contactView = abDocument.getElementById("viewContact");

  const actions = abDocument.getElementById("detailsActions");
  const editButton = abDocument.getElementById("editButton");
  const editForm = abDocument.getElementById("editContactForm");

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

  // Check contacts with the book displayed.

  openDirectory(readOnlyBook);
  Assert.equal(cardsList.view.rowCount, 3);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));

  // Without email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(
    BrowserTestUtils.isVisible(contactView),
    "contact view should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(actions),
    "actions section should be hidden"
  );

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(2), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.isHidden(editButton), "editButton is hidden");

  // Double clicking on the item will select but not edit it.
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(1),
    { clickCount: 1 },
    abWindow
  );
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(1),
    { clickCount: 2 },
    abWindow
  );
  // Wait one loop to see if edit form was opened.
  await TestUtils.waitForTick();
  Assert.ok(
    BrowserTestUtils.isVisible(contactView),
    "contact view should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(editForm),
    "contact form should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(actions),
    "actions section should be hidden"
  );
  Assert.equal(
    cardsList.table.body,
    abDocument.activeElement,
    "Cards list should be the active element"
  );

  selectHandler.reset();
  cardsList.addEventListener("select", selectHandler, { once: true });
  // Same with Enter on the second item.
  EventUtils.synthesizeKey("KEY_ArrowDown", {}, abWindow);
  await TestUtils.waitForCondition(
    () => selectHandler.seenEvent,
    `'select' event should get fired`
  );
  Assert.ok(
    BrowserTestUtils.isVisible(contactView),
    "contact view should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(editForm),
    "contact form should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(actions),
    "actions section should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(editButton),
    "editButton should be hidden"
  );

  EventUtils.synthesizeKey("KEY_Enter", {}, abWindow);
  await TestUtils.waitForTick();
  Assert.ok(
    BrowserTestUtils.isVisible(contactView),
    "contact view should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(editForm),
    "contact form should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(actions),
    "actions section should be shown"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(editForm),
    "contact form should be hidden"
  );

  // Check contacts with the list displayed.

  openDirectory(readOnlyList);
  Assert.equal(cardsList.view.rowCount, 1);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(contactView));
  Assert.ok(BrowserTestUtils.isVisible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.isHidden(editButton), "editButton is hidden");

  // Check contacts with All Address Books displayed.

  openAllAddressBooks();
  Assert.equal(cardsList.view.rowCount, 6);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));

  // Basic person from Personal Address Books.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(contactView));
  Assert.ok(BrowserTestUtils.isVisible(actions), "actions section is shown");
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.isVisible(editButton), "edit button is shown");

  // Without email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(4), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(contactView));
  Assert.ok(BrowserTestUtils.isHidden(actions), "actions section is hidden");

  // With email.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(5), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(actions), "actions section is shown");
  await checkActionButtons("read.only@invalid", "read-only person with email");
  Assert.ok(BrowserTestUtils.isHidden(editButton), "editButton is hidden");

  // Basic person again, to prove the buttons aren't hidden forever.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(1), {}, abWindow);
  Assert.ok(BrowserTestUtils.isVisible(contactView));
  Assert.ok(BrowserTestUtils.isVisible(actions), "actions section is shown");
  await checkActionButtons("basic@invalid", "basic person");
  Assert.ok(BrowserTestUtils.isVisible(editButton), "edit button is shown");

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(readOnlyBook.URI);
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
      NOTE:notes\\:\\nnotes\\;\\nnotes\\,\\nnotes\\\\
      URL:https\\://host/url\\:url\\;url\\,url\\\\url
      END:VCARD
    `)
  );

  const abWindow = await openAddressBookWindow();

  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  const viewContactName = abDocument.getElementById("viewContactName");
  const viewPrimaryEmail = abDocument.getElementById("viewPrimaryEmail");
  const editButton = abDocument.getElementById("editButton");

  const emailAddressesSection = abDocument.getElementById("emailAddresses");
  const phoneNumbersSection = abDocument.getElementById("phoneNumbers");
  const addressesSection = abDocument.getElementById("addresses");
  const notesSection = abDocument.getElementById("notes");
  const websitesSection = abDocument.getElementById("websites");
  const imppSection = abDocument.getElementById("instantMessaging");
  const otherInfoSection = abDocument.getElementById("otherInfo");
  const selectedCardsSection = abDocument.getElementById("selectedCards");

  openDirectory(googleBook);
  Assert.equal(cardsList.view.rowCount, 1);
  Assert.ok(BrowserTestUtils.isHidden(detailsPane));

  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  // Header.
  Assert.equal(viewContactName.textContent, "en\\c:oding test");
  Assert.equal(viewPrimaryEmail.textContent, "");

  // Action buttons.
  await checkActionButtons();
  Assert.ok(BrowserTestUtils.isVisible(editButton));

  // Email section.
  Assert.ok(BrowserTestUtils.isHidden(emailAddressesSection));

  // Phone numbers section.
  Assert.ok(BrowserTestUtils.isVisible(phoneNumbersSection));
  let items = phoneNumbersSection.querySelectorAll("li");
  Assert.equal(items.length, 1);

  Assert.equal(items[0].querySelector(".entry-type").textContent, "");
  Assert.equal(items[0].querySelector(".entry-value").textContent, "01234567");

  // Addresses section.
  Assert.ok(BrowserTestUtils.isHidden(addressesSection));

  // Notes section.
  Assert.ok(BrowserTestUtils.isVisible(notesSection));
  Assert.equal(
    notesSection.querySelector("div").textContent,
    "notes:\nnotes;\nnotes,\nnotes\\"
  );

  // Websites section
  Assert.ok(BrowserTestUtils.isVisible(websitesSection));
  items = websitesSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[1].querySelector("a").href,
    "https://host/url:url;url,url/url"
  );
  Assert.equal(
    items[0].children[1].querySelector("a").textContent,
    "host/url:url;url,url/url"
  );
  items[0].children[1].querySelector("a").scrollIntoView();
  EventUtils.synthesizeMouseAtCenter(
    items[0].children[1].querySelector("a"),
    {},
    abWindow
  );
  await TestUtils.waitForCondition(
    () =>
      mockExternalProtocolService.urlLoaded("https://host/url:url;url,url/url"),
    "attempted to load website in a browser"
  );

  // Instant messaging section.
  Assert.ok(BrowserTestUtils.isHidden(imppSection));

  // Other sections.
  Assert.ok(BrowserTestUtils.isVisible(otherInfoSection));
  items = otherInfoSection.querySelectorAll("li");
  Assert.equal(items.length, 1);
  Assert.equal(
    items[0].children[0].dataset.l10nId,
    "about-addressbook-entry-name-title"
  );
  Assert.equal(
    items[0].children[1].textContent,
    "title:title;title,title\\title\\:title\\;title\\,title\\\\"
  );

  Assert.ok(BrowserTestUtils.isHidden(selectedCardsSection));

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(googleBook.URI);
});

async function addAndDisplayCard(card) {
  if (typeof card == "string") {
    card = VCardUtils.vCardToAbCard(card);
  }
  card = personalBook.addCard(card);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abDocument.getElementById("cards");
  const detailsPane = abDocument.getElementById("detailsPane");

  const index = cardsList.view.getIndexForUID(card.UID);
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(index),
    {},
    abWindow
  );
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );
  return card;
}

async function checkActionButtons(
  primaryEmail,
  displayName,
  searchString = primaryEmail
) {
  const tabmail = document.getElementById("tabmail");
  const abWindow = getAddressBookWindow();
  const abDocument = abWindow.document;

  const writeButton = abDocument.getElementById("detailsWriteButton");
  const eventButton = abDocument.getElementById("detailsEventButton");
  const searchButton = abDocument.getElementById("detailsSearchButton");
  const newListButton = abDocument.getElementById("detailsNewListButton");

  if (primaryEmail) {
    // Write.
    Assert.ok(
      BrowserTestUtils.isVisible(writeButton),
      "write button is visible"
    );

    const composeWindowPromise = BrowserTestUtils.domWindowOpened();
    EventUtils.synthesizeMouseAtCenter(writeButton, {}, abWindow);
    await checkComposeWindow(
      await composeWindowPromise,
      `${displayName} <${primaryEmail}>`
    );

    // Search. Do this before the event test to stop a strange macOS failure.
    Assert.ok(
      BrowserTestUtils.isVisible(searchButton),
      "search button is visible"
    );

    let searchTabPromise = BrowserTestUtils.waitForEvent(window, "TabOpen");
    EventUtils.synthesizeMouseAtCenter(searchButton, {}, abWindow);
    const {
      detail: { tabInfo: searchTab },
    } = await searchTabPromise;

    const searchBox = tabmail.selectedTab.panel.querySelector(".searchBox");
    Assert.equal(searchBox.value, searchString);

    searchTabPromise = BrowserTestUtils.waitForEvent(window, "TabClose");
    tabmail.closeTab(searchTab);
    await searchTabPromise;

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
      [`${displayName} <${primaryEmail}>`],
      "attendees are correct"
    );

    eventWindowPromise = BrowserTestUtils.domWindowClosed(eventWindow);
    BrowserTestUtils.promiseAlertDialog("extra1");
    EventUtils.synthesizeKey("VK_ESCAPE", {}, eventWindow);
    await eventWindowPromise;
    Assert.report(false, undefined, undefined, "Item dialog closed");
  } else {
    Assert.ok(BrowserTestUtils.isHidden(writeButton), "write button is hidden");
    Assert.ok(BrowserTestUtils.isHidden(eventButton), "event button is hidden");
    Assert.ok(
      BrowserTestUtils.isHidden(searchButton),
      "search button is hidden"
    );
  }

  Assert.ok(
    BrowserTestUtils.isHidden(newListButton),
    "new list button is hidden"
  );
}
