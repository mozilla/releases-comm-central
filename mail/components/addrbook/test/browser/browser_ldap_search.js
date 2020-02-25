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
    let deletePromise = promiseDirectoryRemoved();
    MailServices.ab.deleteAddressBook(book.URI);
    await deletePromise;
    LDAPServer.close();
  });

  let dirTree = abDocument.getElementById("dirTree");
  is(dirTree.view.getCellText(2, dirTree.columns[0]), "Mochitest");
  mailTestUtils.treeClick(EventUtils, abWindow, dirTree, 2, 0, {});

  let resultsTree = abDocument.getElementById("abResultsTree");

  let searchBox = abDocument.getElementById("peopleSearchInput");
  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.sendString("holmes", abWindow);

  await LDAPServer.read(); // BindRequest
  is(resultsTree.view.rowCount, 0);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(); // SearchRequest
  LDAPServer.writeSearchResultEntry(ldapContacts.mycroft);
  LDAPServer.writeSearchResultEntry(ldapContacts.sherlock);
  LDAPServer.writeSearchResultDone();

  await new Promise(resolve => {
    abWindow.addEventListener("countchange", function onCountChange() {
      if (resultsTree.view && resultsTree.view.rowCount == 2) {
        abWindow.removeEventListener("countchange", onCountChange);
        resolve();
      }
    });
  });

  is(resultsTree.view.rowCount, 2);
  is(resultsTree.view.getCellText(0, resultsTree.columns[0]), "Mycroft Holmes");
  is(
    resultsTree.view.getCellText(1, resultsTree.columns[0]),
    "Sherlock Holmes"
  );

  EventUtils.synthesizeMouseAtCenter(searchBox, {}, abWindow);
  EventUtils.synthesizeKey("a", { accelKey: true }, abWindow);
  EventUtils.sendString("john", abWindow);

  await LDAPServer.read(); // BindRequest
  is(resultsTree.view.rowCount, 0);
  LDAPServer.writeBindResponse();

  await LDAPServer.read(); // SearchRequest
  LDAPServer.writeSearchResultEntry(ldapContacts.john);
  LDAPServer.writeSearchResultDone();

  await new Promise(resolve => {
    abWindow.addEventListener("countchange", function onCountChange() {
      if (resultsTree.view && resultsTree.view.rowCount == 1) {
        abWindow.removeEventListener("countchange", onCountChange);
        resolve();
      }
    });
  });

  is(resultsTree.view.rowCount, 1);
  is(resultsTree.view.getCellText(0, resultsTree.columns[0]), "John Watson");
});
