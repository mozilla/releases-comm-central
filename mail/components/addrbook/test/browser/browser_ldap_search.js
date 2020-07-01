/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { LDAPServer } = ChromeUtils.import(
  "resource://testing-common/LDAPServer.jsm"
);
const { mailTestUtils } = ChromeUtils.import(
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

  function checkResultsDisplay(...expectedNames) {
    let expectedCount = expectedNames.length;
    let treeTop = resultsTree.lastElementChild.getBoundingClientRect().top;

    // Checking how many rows the tree *actually has* is difficult. It may be
    // different from the view's row count, which is *bad*. We'll work it out
    // using the coordinates of the expected number of rows. This will fail if
    // there's more rows than can be displayed at once.

    Assert.equal(
      resultsTree.getRowAt(0, treeTop + resultsTree.rowHeight * expectedCount),
      -1,
      "Tree does not have too many rows"
    );
    if (expectedCount > 0) {
      Assert.equal(
        resultsTree.getRowAt(
          0,
          treeTop + resultsTree.rowHeight * expectedCount - 1
        ),
        expectedCount - 1,
        "Tree does not have too few rows"
      );
    }

    Assert.equal(
      resultsTree.view.rowCount,
      expectedCount,
      "Tree view has the right number of rows"
    );

    for (let i = 0; i < expectedCount; i++) {
      Assert.equal(
        resultsTree.view.getCellText(i, resultsTree.columns.GeneratedName),
        expectedNames[i]
      );
    }
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
    let deletePromise = promiseDirectoryRemoved();
    MailServices.ab.deleteAddressBook(book.URI);
    await deletePromise;
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
  checkResultsDisplay();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.mycroft);
  LDAPServer.writeSearchResultEntry(ldapContacts.sherlock);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(2);
  checkResultsDisplay("Mycroft Holmes", "Sherlock Holmes");

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("john", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkResultsDisplay();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  checkResultsDisplay("John Watson");

  // Now move back to the "All Address Books" view and search again.

  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 0, 0, {});
  checkResultsDisplay("daniel", "jonathan", "nathan");

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("irene", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkResultsDisplay();

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.irene);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(1);
  checkResultsDisplay("Irene Adler");

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("jo", abWindow);

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  checkResultsDisplay("jonathan");

  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await waitForCountChange(2);
  checkResultsDisplay("John Watson", "jonathan");
});
