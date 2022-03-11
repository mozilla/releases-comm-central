/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPServer } = ChromeUtils.import(
  "resource://testing-common/LDAPServer.jsm"
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

  let personalBook = MailServices.ab.getDirectoryFromId("ldap_2.servers.pab");
  let cardsToRemove = [];
  for (let name of ["daniel", "jonathan", "nathan"]) {
    let card = Cc["@mozilla.org/addressbook/cardproperty;1"].createInstance(
      Ci.nsIAbCard
    );
    card.displayName = name;

    card = personalBook.addCard(card);
    cardsToRemove.push(card);
  }

  // Set up the LDAP server.

  LDAPServer.open();
  let response = await fetch(jsonFile);
  let ldapContacts = await response.json();

  let bookPref = MailServices.ab.newAddressBook(
    "Mochitest",
    `ldap://localhost:${LDAPServer.port}/`,
    0
  );
  let book = MailServices.ab.getDirectoryFromId(bookPref);

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;

  let searchBox = abDocument.getElementById("searchInput");
  let cardsList = abDocument.getElementById("cards");

  // Search for some people in the LDAP directory.

  openDirectory(book);

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.sendString("holmes", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkNamesListed();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.mycroft);
  LDAPServer.writeSearchResultEntry(ldapContacts.sherlock);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(2);
  checkNamesListed("Mycroft Holmes", "Sherlock Holmes");

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("john", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkNamesListed();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  checkNamesListed("John Watson");

  // Now move back to the "All Address Books" view and search again.
  // The search string is retained when switching books.

  openAllAddressBooks();
  checkNamesListed();

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("irene", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkNamesListed();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.irene);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  checkNamesListed("Irene Adler");

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("jo", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkNamesListed("jonathan");

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(2);
  checkNamesListed("John Watson", "jonathan");

  await closeAddressBookWindow();
  personalBook.deleteCards(cardsToRemove);
  await promiseDirectoryRemoved(book.URI);
  LDAPServer.close();
});
