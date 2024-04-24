/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/LDAPServer.sys.mjs"
);

const jsonFile =
  "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/ldap_contacts.json";

add_task(async () => {
  function waitForCountChange(expectedCount) {
    return new Promise(resolve => {
      cardsList.addEventListener("rowcountchange", function onRowCountChange() {
        console.log(cardsList.view.rowCount, expectedCount);
        if (cardsList.view.rowCount == expectedCount) {
          cardsList.removeEventListener("rowcountchange", onRowCountChange);
          resolve();
        }
      });
    });
  }

  // Set up some local people.

  const cardsToRemove = [];
  for (const name of ["daniel", "jonathan", "nathan"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = personalBook.addCard(card);
    cardsToRemove.push(card);
  }

  // Set up the LDAP server.

  LDAPServer.open();
  const response = await fetch(jsonFile);
  const ldapContacts = await response.json();

  const bookPref = MailServices.ab.newAddressBook(
    "Mochitest",
    `ldap://localhost:${LDAPServer.port}/`,
    0
  );
  const book = MailServices.ab.getDirectoryFromId(bookPref);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;

  const searchBox = abDocument.getElementById("searchInput");
  const cardsList = abWindow.cardsPane.cardsList;
  const noSearchResults = abDocument.getElementById(
    "placeholderNoSearchResults"
  );
  const detailsPane = abDocument.getElementById("detailsPane");

  // Search for some people in the LDAP directory.

  await openDirectory(book);
  await checkPlaceholders(["placeholderSearchOnly"]);

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.sendString("holmes", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed();
  await checkPlaceholders(["placeholderSearching"]);

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.mycroft);
  LDAPServer.writeSearchResultEntry(ldapContacts.sherlock);
  LDAPServer.writeSearchResultDone();

  Assert.ok(BrowserTestUtils.isHidden(detailsPane));
  await waitForCountChange(2);
  await checkNamesListed("Mycroft Holmes", "Sherlock Holmes");
  await checkPlaceholders();

  // Check that displaying an LDAP card works without error.
  EventUtils.synthesizeMouseAtCenter(cardsList.getRowAtIndex(0), {}, abWindow);
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(detailsPane)
  );

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("john", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed();
  await checkPlaceholders(["placeholderSearching"]);

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  await checkNamesListed("John Watson");
  await checkPlaceholders();

  // Now move back to the "All Address Books" view and search again.
  // The search string is retained when switching books.

  await openAllAddressBooks();
  await checkNamesListed();
  Assert.equal(searchBox.value, "john");

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed();
  await checkPlaceholders(["placeholderSearching"]);

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  await checkNamesListed("John Watson");
  await checkPlaceholders();

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("irene", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed();
  await checkPlaceholders(["placeholderSearching"]);

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.irene);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  await checkNamesListed("Irene Adler");
  await checkPlaceholders();

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("jo", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed("jonathan");
  await checkPlaceholders();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(2);
  await checkNamesListed("John Watson", "jonathan");
  await checkPlaceholders();

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("mark", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await checkNamesListed();
  await checkPlaceholders(["placeholderSearching"]);

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultDone();
  await TestUtils.waitForCondition(() =>
    BrowserTestUtils.isVisible(noSearchResults)
  );
  await checkNamesListed();
  await checkPlaceholders(["placeholderNoSearchResults"]);

  await closeAddressBookWindow();
  personalBook.deleteCards(cardsToRemove);
  await promiseDirectoryRemoved(book.URI);
  LDAPServer.close();
});
