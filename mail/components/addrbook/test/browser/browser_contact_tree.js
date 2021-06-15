/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);

/**
 * Tests that additions and removals are accurately displayed, or not
 * displayed if they happen outside the current address book.
 */
add_task(async function test_additions_and_removals() {
  async function deleteRowWithPrompt(row) {
    let promptPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
    mailTestUtils.treeClick(EventUtils, abWindow, abContactTree, row, 0, {});
    EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
    await promptPromise;
    await new Promise(r => abWindow.setTimeout(r));
  }

  let bookA = createAddressBook("book A");
  let contactA1 = bookA.addCard(createContact("contact", "A1"));
  let bookB = createAddressBook("book B");
  let contactB1 = bookB.addCard(createContact("contact", "B1"));

  let abWindow = await openAddressBookWindow();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  await openRootDirectory();
  info("Performing check #1");
  checkCardsListed(contactA1, contactB1);

  // While in bookA, add a contact and list. Check that they show up.
  openDirectory(bookA);
  checkCardsListed(contactA1);
  let contactA2 = bookA.addCard(createContact("contact", "A2")); // Add A2.
  checkCardsListed(contactA1, contactA2);
  let listC = bookA.addMailList(createMailingList("list C")); // Add C.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA1, contactA2, listC);
  listC.addCard(contactA1);
  checkCardsListed(contactA1, contactA2, listC);

  await openRootDirectory();
  info("Performing check #2");
  checkCardsListed(contactA1, contactA2, contactB1, listC);

  // While in listC, add a member and remove a member. Check that they show up
  // or disappear as appropriate.
  openDirectory(listC);
  checkCardsListed(contactA1);
  listC.addCard(contactA2);
  checkCardsListed(contactA1, contactA2);
  await deleteRowWithPrompt(0);
  checkCardsListed(contactA2);

  await openRootDirectory();
  info("Performing check #3");
  checkCardsListed(contactA1, contactA2, contactB1, listC);

  // While in bookA, delete a contact. Check it disappears.
  openDirectory(bookA);
  checkCardsListed(contactA1, contactA2, listC);
  await deleteRowWithPrompt(0); // Delete A1.
  checkCardsListed(contactA2, listC);
  // Now do some things in an unrelated book. Check nothing changes here.
  let contactB2 = bookB.addCard(createContact("contact", "B2")); // Add B2.
  checkCardsListed(contactA2, listC);
  let listD = bookB.addMailList(createMailingList("list D")); // Add D.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA2, listC);
  listD.addCard(contactB1);
  checkCardsListed(contactA2, listC);

  await openRootDirectory();
  info("Performing check #4");
  checkCardsListed(contactA2, contactB1, contactB2, listC, listD);

  // While in listC, do some things in an unrelated list. Check nothing
  // changes here.
  openDirectory(listC);
  checkCardsListed(contactA2);
  listD.addCard(contactB2);
  checkCardsListed(contactA2);
  listD.deleteCards([contactB1]);
  checkCardsListed(contactA2);
  bookB.deleteCards([contactB1]);
  checkCardsListed(contactA2);

  await openRootDirectory();
  info("Performing check #5");
  checkCardsListed(contactA2, contactB2, listC, listD);

  // While in bookA, do some things in an unrelated book. Check nothing
  // changes here.
  openDirectory(bookA);
  checkCardsListed(contactA2, listC);
  bookB.deleteDirectory(listD); // Delete D.
  checkDirectoryDisplayed(bookA);
  checkCardsListed(contactA2, listC);
  await deleteRowWithPrompt(1); // Delete C.
  checkCardsListed(contactA2);

  // While in "All Address Books", make some changes and check that things
  // appear or disappear as appropriate.
  await openRootDirectory();
  info("Performing check #6");
  checkCardsListed(contactA2, contactB2);
  let listE = bookB.addMailList(createMailingList("list E")); // Add E.
  checkDirectoryDisplayed(null);
  checkCardsListed(contactA2, contactB2, listE);
  listE.addCard(contactB2);
  checkCardsListed(contactA2, contactB2, listE);
  listE.deleteCards([contactB2]);
  checkCardsListed(contactA2, contactB2, listE);
  bookB.deleteDirectory(listE); // Delete E.
  checkDirectoryDisplayed(null);
  checkCardsListed(contactA2, contactB2);
  await deleteRowWithPrompt(1);
  checkCardsListed(contactA2);
  bookA.deleteCards([contactA2]);
  checkCardsListed();

  // While in "All Address Books", delete a directory that has contacts and
  // mailing lists. They should disappear.
  let contactA3 = bookA.addCard(createContact("contact", "A3")); // Add A3.
  checkCardsListed(contactA3);
  let listF = bookA.addMailList(createMailingList("list F")); // Add F.
  checkCardsListed(contactA3, listF);
  await promiseDirectoryRemoved(bookA.URI);
  checkCardsListed();

  abWindow.close();

  await promiseDirectoryRemoved(bookB.URI);
});

/**
 * Tests that added contacts are inserted in the right place in the list.
 */
add_task(async function test_insertion_order() {
  let abWindow = await openAddressBookWindow();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  Assert.equal(abContactTree.columns[0].element.id, "GeneratedName");
  Assert.equal(
    abContactTree.columns[0].element.getAttribute("sortDirection"),
    "ascending"
  );
  for (let i = 1; i < abContactTree.columns.length; i++) {
    Assert.equal(
      abContactTree.columns[i].element.getAttribute("sortDirection"),
      ""
    );
  }

  let bookA = createAddressBook("book A");
  openDirectory(bookA);
  checkCardsListed();
  let contactA2 = bookA.addCard(createContact("contact", "A2"));
  checkCardsListed(contactA2);
  let contactA1 = bookA.addCard(createContact("contact", "A1")); // Add first.
  checkCardsListed(contactA1, contactA2);
  let contactA5 = bookA.addCard(createContact("contact", "A5")); // Add last.
  checkCardsListed(contactA1, contactA2, contactA5);
  let contactA3 = bookA.addCard(createContact("contact", "A3")); // Add in the middle.
  checkCardsListed(contactA1, contactA2, contactA3, contactA5);

  // Flip sort direction.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  Assert.equal(
    abContactTree.columns[0].element.getAttribute("sortDirection"),
    "descending"
  );
  checkCardsListed(contactA5, contactA3, contactA2, contactA1);
  let contactA4 = bookA.addCard(createContact("contact", "A4")); // Add in the middle.
  checkCardsListed(contactA5, contactA4, contactA3, contactA2, contactA1);
  let contactA7 = bookA.addCard(createContact("contact", "A7")); // Add first.
  checkCardsListed(
    contactA7,
    contactA5,
    contactA4,
    contactA3,
    contactA2,
    contactA1
  );
  let contactA0 = bookA.addCard(createContact("contact", "A0")); // Add last.
  checkCardsListed(
    contactA7,
    contactA5,
    contactA4,
    contactA3,
    contactA2,
    contactA1,
    contactA0
  );

  contactA3.displayName = "contact A6";
  contactA3.lastName = "contact A3";
  contactA3.primaryEmail = "contact.A6@invalid";
  bookA.modifyCard(contactA3); // Rename, should change position.
  checkCardsListed(
    contactA7,
    contactA3, // Actually A6.
    contactA5,
    contactA4,
    contactA2,
    contactA1,
    contactA0
  );

  // Restore original sort direction.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  checkCardsListed(
    contactA0,
    contactA1,
    contactA2,
    contactA4,
    contactA5,
    contactA3, // Actually A6.
    contactA7
  );

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(bookA.URI);
});

/**
 * Tests the name column is updated when the format changes. Usually this
 * happens through the menus, but testing menus on Mac is hard, so instead
 * this test just sets the relevant pref.
 */
add_task(async function test_name_column() {
  const {
    GENERATE_DISPLAY_NAME,
    GENERATE_LAST_FIRST_ORDER,
    GENERATE_FIRST_LAST_ORDER,
  } = Ci.nsIAbCard;

  let book = createAddressBook("book");
  book.addCard(createContact("alpha", "tango", "kilo"));
  book.addCard(createContact("bravo", "zulu", "quebec"));
  book.addCard(createContact("charlie", "mike", "whiskey"));
  book.addCard(createContact("delta", "foxtrot", "sierra"));
  book.addCard(createContact("echo", "november", "uniform"));

  let abWindow = await openAddressBookWindow();
  let abContactTree = abWindow.document.getElementById("abResultsTree");

  // Check the format is display name, ascending.
  Assert.equal(
    Services.prefs.getIntPref("mail.addr_book.lastnamefirst"),
    GENERATE_DISPLAY_NAME
  );
  Assert.equal(abContactTree.columns[0].element.id, "GeneratedName");
  Assert.equal(
    abContactTree.columns[0].element.getAttribute("sortDirection"),
    "ascending"
  );

  checkNamesListed("kilo", "quebec", "sierra", "uniform", "whiskey");

  // Select the "delta foxtrot" contact. This should remain selected throughout.
  mailTestUtils.treeClick(EventUtils, abWindow, abContactTree, 2, 0, {});
  Assert.equal(abContactTree.view.selection.currentIndex, 2);

  // Change the format to last, first.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_LAST_FIRST_ORDER
  );
  checkNamesListed(
    "foxtrot, delta",
    "mike, charlie",
    "november, echo",
    "tango, alpha",
    "zulu, bravo"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 0);

  // Change the format to first last.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_FIRST_LAST_ORDER
  );
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 3);

  // Flip the order to descending.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  checkNamesListed(
    "echo november",
    "delta foxtrot",
    "charlie mike",
    "bravo zulu",
    "alpha tango"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 1);

  // Change the format to last, first.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_LAST_FIRST_ORDER
  );
  checkNamesListed(
    "zulu, bravo",
    "tango, alpha",
    "november, echo",
    "mike, charlie",
    "foxtrot, delta"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 4);

  // Change the format to display name.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_DISPLAY_NAME
  );
  checkNamesListed("whiskey", "uniform", "sierra", "quebec", "kilo");
  Assert.equal(abContactTree.view.selection.currentIndex, 2);

  // Sort by email address, ascending.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.PrimaryEmail.element,
    {},
    abWindow
  );
  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");
  Assert.equal(abContactTree.view.selection.currentIndex, 3);

  // Change the format to last, first.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_LAST_FIRST_ORDER
  );
  checkNamesListed(
    "tango, alpha",
    "zulu, bravo",
    "mike, charlie",
    "foxtrot, delta",
    "november, echo"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 3);

  // Change the format to first last.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_FIRST_LAST_ORDER
  );
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );
  Assert.equal(abContactTree.view.selection.currentIndex, 3);

  // Change the format to display name.
  Services.prefs.setIntPref(
    "mail.addr_book.lastnamefirst",
    GENERATE_DISPLAY_NAME
  );
  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");
  Assert.equal(abContactTree.view.selection.currentIndex, 3);

  // Restore original sort column and direction.
  EventUtils.synthesizeMouseAtCenter(
    abContactTree.columns.GeneratedName.element,
    {},
    abWindow
  );
  checkNamesListed("kilo", "quebec", "sierra", "uniform", "whiskey");
  Assert.equal(abContactTree.view.selection.currentIndex, 2);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(book.URI);
});
