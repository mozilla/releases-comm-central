/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPServer } = ChromeUtils.import(
  "resource://testing-common/LDAPServer.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

const jsonFile =
  "http://mochi.test:8888/browser/comm/mail/components/addrbook/test/browser/ldap_contacts.json";

add_task(async () => {
  function waitForCountChange(expectedCount) {
    return new Promise(resolve => {
      abWindow.addEventListener("countchange", function onCountChange() {
        if (resultsTree.view && resultsTree.view.rowCount == expectedCount) {
          abWindow.removeEventListener("countchange", onCountChange);
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

  registerCleanupFunction(async () => {
    abWindow.close();
    personalBook.deleteCards(cardsToRemove);
    await promiseDirectoryRemoved(book.URI);
    LDAPServer.close();
  });

  let dirTree = abDocument.getElementById("dirTree");
  let resultsTree = abDocument.getElementById("abResultsTree");
  let searchBox = abDocument.getElementById("peopleSearchInput");

  // Search for some people in the LDAP directory.

  Assert.equal(dirTree.view.getCellText(2, dirTree.columns[0]), "Mochitest");
  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 2, 0, {});

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

  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 0, 0, {});
  checkNamesListed("daniel", "jonathan", "nathan");

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
});
