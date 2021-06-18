/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

function rightClickOnIndex(index) {
  let abWindow = getAddressBookWindow();
  let cardsList = abWindow.cardsPane.cardsList;
  let menu = abWindow.document.getElementById("cardContext");

  let shownPromise = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    cardsList.getRowAtIndex(index),
    { type: "contextmenu" },
    abWindow
  );
  return shownPromise;
}

/**
 * Tests that additions and removals are accurately displayed, or not
 * displayed if they happen outside the current address book.
 */
add_task(async function test_additions_and_removals() {
  async function deleteRowWithPrompt(index) {
    let promptPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
    EventUtils.synthesizeMouseAtCenter(
      cardsList.getRowAtIndex(index),
      {},
      abWindow
    );
    EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
    await promptPromise;
    await new Promise(r => abWindow.setTimeout(r));
  }

  let bookA = createAddressBook("book A");
  let contactA1 = bookA.addCard(createContact("contact", "A1"));
  let bookB = createAddressBook("book B");
  let contactB1 = bookB.addCard(createContact("contact", "B1"));

  let abWindow = await openAddressBookWindow();
  let cardsList = abWindow.document.getElementById("cards");

  await openAllAddressBooks();
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

  await openAllAddressBooks();
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

  await openAllAddressBooks();
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

  await openAllAddressBooks();
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

  await openAllAddressBooks();
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
  await openAllAddressBooks();
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
  await openAddressBookWindow();

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
  await showSortMenu("sort", "GeneratedName descending");

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
  await showSortMenu("sort", "GeneratedName ascending");

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
 * Tests the name column is updated when the format changes.
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
  let cardsList = abWindow.document.getElementById("cards");

  // Check the format is display name, ascending.
  Assert.equal(
    Services.prefs.getIntPref("mail.addr_book.lastnamefirst"),
    GENERATE_DISPLAY_NAME
  );

  checkNamesListed("kilo", "quebec", "sierra", "uniform", "whiskey");

  // Select the "delta foxtrot" contact. This should remain selected throughout.
  cardsList.selectedIndex = 2;
  Assert.equal(cardsList.selectedIndex, 2);

  // Change the format to last, first.
  await showSortMenu("format", GENERATE_LAST_FIRST_ORDER);
  checkNamesListed(
    "foxtrot, delta",
    "mike, charlie",
    "november, echo",
    "tango, alpha",
    "zulu, bravo"
  );
  Assert.equal(cardsList.selectedIndex, 0);
  Assert.deepEqual(cardsList.selectedIndicies, [0]);

  // Change the format to first last.
  await showSortMenu("format", GENERATE_FIRST_LAST_ORDER);
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );
  Assert.equal(cardsList.selectedIndex, 3);

  // Flip the order to descending.
  await showSortMenu("sort", "GeneratedName descending");

  checkNamesListed(
    "echo november",
    "delta foxtrot",
    "charlie mike",
    "bravo zulu",
    "alpha tango"
  );
  Assert.equal(cardsList.selectedIndex, 1);

  // Change the format to last, first.
  await showSortMenu("format", GENERATE_LAST_FIRST_ORDER);
  checkNamesListed(
    "zulu, bravo",
    "tango, alpha",
    "november, echo",
    "mike, charlie",
    "foxtrot, delta"
  );
  Assert.equal(cardsList.selectedIndex, 4);

  // Change the format to display name.
  await showSortMenu("format", GENERATE_DISPLAY_NAME);
  checkNamesListed("whiskey", "uniform", "sierra", "quebec", "kilo");
  Assert.equal(cardsList.selectedIndex, 2);

  // Sort by email address, ascending.
  await showSortMenu("sort", "PrimaryEmail ascending");

  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");
  Assert.equal(cardsList.selectedIndex, 3);

  // Change the format to last, first.
  await showSortMenu("format", GENERATE_LAST_FIRST_ORDER);
  checkNamesListed(
    "tango, alpha",
    "zulu, bravo",
    "mike, charlie",
    "foxtrot, delta",
    "november, echo"
  );
  Assert.equal(cardsList.selectedIndex, 3);

  // Change the format to first last.
  await showSortMenu("format", GENERATE_FIRST_LAST_ORDER);
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );
  Assert.equal(cardsList.selectedIndex, 3);

  // Change the format to display name.
  await showSortMenu("format", GENERATE_DISPLAY_NAME);
  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");
  Assert.equal(cardsList.selectedIndex, 3);

  // Restore original sort column and direction.
  await showSortMenu("sort", "GeneratedName ascending");

  checkNamesListed("kilo", "quebec", "sierra", "uniform", "whiskey");
  Assert.equal(cardsList.selectedIndex, 2);

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(book.URI);
});

/**
 * Tests the context menu compose items.
 */
add_task(async function test_context_menu_compose() {
  MailServices.accounts.createLocalMailAccount();
  let account = MailServices.accounts.accounts[0];
  account.addIdentity(MailServices.accounts.createIdentity());

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
  });

  let book = createAddressBook("Book");
  let contactA = book.addCard(createContact("Contact", "A"));
  let contactB = createContact("Contact", "B");
  contactB.setProperty("SecondEmail", "b.contact@invalid");
  contactB = book.addCard(contactB);
  let contactC = createContact("Contact", "C");
  contactC.primaryEmail = null;
  contactC.setProperty("SecondEmail", "c.contact@invalid");
  contactC = book.addCard(contactC);
  let contactD = createContact("Contact", "D");
  contactD.primaryEmail = null;
  contactD = book.addCard(contactD);
  let list = book.addMailList(createMailingList("List"));
  list.addCard(contactA);
  list.addCard(contactB);

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let cardsList = abWindow.cardsPane.cardsList;

  let menu = abDocument.getElementById("cardContext");
  let writeMenuItem = abDocument.getElementById("cardContextWrite");
  let writeMenu = abDocument.getElementById("cardContextWriteMenu");

  async function checkComposeWindow(composeWindow, ...expectedAddresses) {
    await BrowserTestUtils.waitForEvent(composeWindow, "compose-editor-ready");
    let composeDocument = composeWindow.document;
    let toAddrRow = composeDocument.getElementById("addressRowTo");

    let pills = toAddrRow.querySelectorAll("mail-address-pill");
    Assert.equal(pills.length, expectedAddresses.length);
    for (let i = 0; i < expectedAddresses.length; i++) {
      Assert.equal(pills[i].label, expectedAddresses[i]);
    }

    await Promise.all([
      BrowserTestUtils.closeWindow(composeWindow),
      BrowserTestUtils.waitForEvent(window, "activate"),
    ]);
  }

  openDirectory(book);

  // Contact A, first and only email address.

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await rightClickOnIndex(0);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact A <contact.a@invalid>"
  );

  // Contact B, first email address.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await rightClickOnIndex(1);
  Assert.ok(writeMenuItem.hidden);
  Assert.ok(!writeMenu.hidden);
  let shownPromise = BrowserTestUtils.waitForEvent(writeMenu, "popupshown");
  writeMenu.openMenu(true);
  await shownPromise;
  let subMenuItems = writeMenu.querySelectorAll("menuitem");
  Assert.equal(subMenuItems.length, 2);
  Assert.equal(subMenuItems[0].label, "Contact B <contact.b@invalid>");
  Assert.equal(subMenuItems[1].label, "Contact B <b.contact@invalid>");

  writeMenu.menupopup.activateItem(subMenuItems[0]);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact B <contact.b@invalid>"
  );

  // Contact B, second email address.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await rightClickOnIndex(1);
  Assert.ok(writeMenuItem.hidden);
  Assert.ok(!writeMenu.hidden);
  shownPromise = BrowserTestUtils.waitForEvent(writeMenu, "popupshown");
  writeMenu.openMenu(true);
  await shownPromise;
  subMenuItems = writeMenu.querySelectorAll("menuitem");
  Assert.equal(subMenuItems.length, 2);
  Assert.equal(subMenuItems[0].label, "Contact B <contact.b@invalid>");
  Assert.equal(subMenuItems[1].label, "Contact B <b.contact@invalid>");

  writeMenu.menupopup.activateItem(subMenuItems[1]);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact B <b.contact@invalid>"
  );

  // Contact C, second and only email address.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await rightClickOnIndex(2);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact C <c.contact@invalid>"
  );

  // Contact D, no email address.

  await rightClickOnIndex(3);
  Assert.ok(writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.hidePopup();

  // List.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await rightClickOnIndex(4);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(await composeWindowPromise, "List <List>");

  // Contact A and Contact D.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndicies = [0, 3];
  await rightClickOnIndex(3);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact A <contact.a@invalid>"
  );

  // Contact B and Contact C.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndicies = [1, 2];
  await rightClickOnIndex(2);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact B <contact.b@invalid>",
    "Contact C <c.contact@invalid>"
  );

  // Contact B and List.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndicies = [1, 4];
  await rightClickOnIndex(4);
  Assert.ok(!writeMenuItem.hidden);
  Assert.ok(writeMenu.hidden);
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact B <contact.b@invalid>",
    "List <List>"
  );

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(book.URI);
});

/**
 * Tests the context menu delete items.
 */
add_task(async function test_context_menu_delete() {
  let normalBook = createAddressBook("Normal Book");
  let normalList = normalBook.addMailList(createMailingList("Normal List"));
  let normalContact = normalBook.addCard(createContact("Normal", "Contact"));
  normalList.addCard(normalContact);

  let readOnlyBook = createAddressBook("Read-Only Book");
  let readOnlyList = readOnlyBook.addMailList(
    createMailingList("Read-Only List")
  );
  let readOnlyContact = readOnlyBook.addCard(
    createContact("Read-Only", "Contact")
  );
  readOnlyList.addCard(readOnlyContact);
  readOnlyBook.setBoolValue("readOnly", true);

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let cardsList = abWindow.cardsPane.cardsList;

  let menu = abDocument.getElementById("cardContext");
  let deleteMenuItem = abDocument.getElementById("cardContextDelete");
  let removeMenuItem = abDocument.getElementById("cardContextRemove");

  async function checkDeleteItems(index, deleteHidden, removeHidden, disabled) {
    await rightClickOnIndex(index);

    Assert.equal(
      deleteMenuItem.hidden,
      deleteHidden,
      `deleteMenuItem.hidden on index ${index}`
    );
    Assert.equal(
      deleteMenuItem.disabled,
      disabled,
      `deleteMenuItem.disabled on index ${index}`
    );
    Assert.equal(
      removeMenuItem.hidden,
      removeHidden,
      `removeMenuItem.hidden on index ${index}`
    );
    Assert.equal(
      removeMenuItem.disabled,
      disabled,
      `removeMenuItem.disabled on index ${index}`
    );

    let hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  info("Testing Normal Book");
  openDirectory(normalBook);
  await checkDeleteItems(0, false, true, false); // normal contact
  await checkDeleteItems(1, false, true, false); // normal list

  cardsList.selectedIndicies = [0, 1];
  await checkDeleteItems(0, false, true, false); // normal contact + normal list
  await checkDeleteItems(1, false, true, false); // normal contact + normal list

  info("Testing Normal List");
  openDirectory(normalList);
  await checkDeleteItems(0, true, false, false); // normal contact

  info("Testing Read-Only Book");
  openDirectory(readOnlyBook);
  await checkDeleteItems(0, false, true, true); // read-only contact
  await checkDeleteItems(1, false, true, true); // read-only list

  info("Testing Read-Only List");
  openDirectory(readOnlyList);
  await checkDeleteItems(0, true, false, true); // read-only contact

  info("Testing All Address Books");
  openAllAddressBooks();
  await checkDeleteItems(0, false, true, false); // normal contact
  await checkDeleteItems(1, false, true, false); // normal list
  await checkDeleteItems(2, false, true, true); // read-only contact
  await checkDeleteItems(3, false, true, true); // read-only list

  cardsList.selectedIndicies = [0, 1];
  await checkDeleteItems(1, false, true, false); // normal contact + normal list

  cardsList.selectedIndicies = [0, 2];
  await checkDeleteItems(2, false, true, true); // normal contact + read-only contact

  cardsList.selectedIndicies = [1, 3];
  await checkDeleteItems(3, false, true, true); // normal list + read-only list

  cardsList.selectedIndicies = [0, 1, 2, 3];
  await checkDeleteItems(3, false, true, true); // everything

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(normalBook.URI);
  await promiseDirectoryRemoved(readOnlyBook.URI);
});
