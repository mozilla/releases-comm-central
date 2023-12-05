/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that additions and removals are accurately displayed, or not
 * displayed if they happen outside the current address book.
 */
add_task(async function test_additions_and_removals() {
  async function deleteRowWithPrompt(index) {
    const promptPromise = BrowserTestUtils.promiseAlertDialogOpen("accept");
    EventUtils.synthesizeMouseAtCenter(
      cardsList.getRowAtIndex(index),
      {},
      abWindow
    );
    EventUtils.synthesizeKey("VK_DELETE", {}, abWindow);
    await promptPromise;
    await new Promise(r => abWindow.setTimeout(r));
    await new Promise(r => abWindow.setTimeout(r));
  }

  const bookA = createAddressBook("book A");
  const contactA1 = bookA.addCard(createContact("contact", "A1"));
  const bookB = createAddressBook("book B");
  const contactB1 = bookB.addCard(createContact("contact", "B1"));

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;

  await openAllAddressBooks();
  info("Performing check #1");
  checkCardsListed(contactA1, contactB1);

  // While in bookA, add a contact and list. Check that they show up.
  openDirectory(bookA);
  checkCardsListed(contactA1);
  const contactA2 = bookA.addCard(createContact("contact", "A2")); // Add A2.
  checkCardsListed(contactA1, contactA2);
  const listC = bookA.addMailList(createMailingList("list C")); // Add C.
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
  Assert.equal(cardsList.currentIndex, 0);

  await openAllAddressBooks();
  info("Performing check #3");
  checkCardsListed(contactA1, contactA2, contactB1, listC);

  // While in bookA, delete a contact. Check it disappears.
  openDirectory(bookA);
  checkCardsListed(contactA1, contactA2, listC);
  await deleteRowWithPrompt(0); // Delete A1.
  checkCardsListed(contactA2, listC);
  Assert.equal(cardsList.currentIndex, 0);
  // Now do some things in an unrelated book. Check nothing changes here.
  const contactB2 = bookB.addCard(createContact("contact", "B2")); // Add B2.
  checkCardsListed(contactA2, listC);
  const listD = bookB.addMailList(createMailingList("list D")); // Add D.
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
  const listE = bookB.addMailList(createMailingList("list E")); // Add E.
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
  Assert.equal(cardsList.currentIndex, 0);
  bookA.deleteCards([contactA2]);
  checkCardsListed();
  Assert.equal(cardsList.currentIndex, -1);

  // While in "All Address Books", delete a directory that has contacts and
  // mailing lists. They should disappear.
  const contactA3 = bookA.addCard(createContact("contact", "A3")); // Add A3.
  checkCardsListed(contactA3);
  const listF = bookA.addMailList(createMailingList("list F")); // Add F.
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

  const bookA = createAddressBook("book A");
  openDirectory(bookA);
  checkCardsListed();
  const contactA2 = bookA.addCard(createContact("contact", "A2"));
  checkCardsListed(contactA2);
  const contactA1 = bookA.addCard(createContact("contact", "A1")); // Add first.
  checkCardsListed(contactA1, contactA2);
  const contactA5 = bookA.addCard(createContact("contact", "A5")); // Add last.
  checkCardsListed(contactA1, contactA2, contactA5);
  const contactA3 = bookA.addCard(createContact("contact", "A3")); // Add in the middle.
  checkCardsListed(contactA1, contactA2, contactA3, contactA5);

  // Flip sort direction.
  await showSortMenu("sort", "GeneratedName descending");

  checkCardsListed(contactA5, contactA3, contactA2, contactA1);
  const contactA4 = bookA.addCard(createContact("contact", "A4")); // Add in the middle.
  checkCardsListed(contactA5, contactA4, contactA3, contactA2, contactA1);
  const contactA7 = bookA.addCard(createContact("contact", "A7")); // Add first.
  checkCardsListed(
    contactA7,
    contactA5,
    contactA4,
    contactA3,
    contactA2,
    contactA1
  );
  const contactA0 = bookA.addCard(createContact("contact", "A0")); // Add last.
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

  const book = createAddressBook("book");
  book.addCard(createContact("alpha", "tango", "kilo"));
  book.addCard(createContact("bravo", "zulu", "quebec"));
  book.addCard(createContact("charlie", "mike", "whiskey"));
  book.addCard(createContact("delta", "foxtrot", "sierra"));
  book.addCard(createContact("echo", "november", "uniform"));

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;

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
  Assert.deepEqual(cardsList.selectedIndices, [0]);

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
  await showSortMenu("sort", "EmailAddresses ascending");

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
 * Tests that sort order and name format survive closing and reopening.
 */
add_task(async function test_persistence() {
  const book = createAddressBook("book");
  book.addCard(createContact("alpha", "tango", "kilo"));
  book.addCard(createContact("bravo", "zulu", "quebec"));
  book.addCard(createContact("charlie", "mike", "whiskey"));
  book.addCard(createContact("delta", "foxtrot", "sierra"));
  book.addCard(createContact("echo", "november", "uniform"));

  Services.xulStore.removeDocument("about:addressbook");
  Services.prefs.clearUserPref("mail.addr_book.lastnamefirst");

  await openAddressBookWindow();
  checkNamesListed("kilo", "quebec", "sierra", "uniform", "whiskey");

  info("sorting by GeneratedName, descending");
  await showSortMenu("sort", "GeneratedName descending");
  checkNamesListed("whiskey", "uniform", "sierra", "quebec", "kilo");

  await closeAddressBookWindow();
  info("address book closed, reopening");
  await openAddressBookWindow();
  checkNamesListed("whiskey", "uniform", "sierra", "quebec", "kilo");

  info("sorting by EmailAddresses, ascending");
  await showSortMenu("sort", "EmailAddresses ascending");
  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");

  await closeAddressBookWindow();
  info("address book closed, reopening");
  await openAddressBookWindow();
  checkNamesListed("kilo", "quebec", "whiskey", "sierra", "uniform");

  info("setting name format to first last");
  await showSortMenu("format", Ci.nsIAbCard.GENERATE_FIRST_LAST_ORDER);
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );

  await closeAddressBookWindow();
  info("address book closed, reopening");
  await openAddressBookWindow();
  checkNamesListed(
    "alpha tango",
    "bravo zulu",
    "charlie mike",
    "delta foxtrot",
    "echo november"
  );

  await closeAddressBookWindow();

  Services.xulStore.removeDocument("about:addressbook");
  Services.prefs.clearUserPref("mail.addr_book.lastnamefirst");

  await promiseDirectoryRemoved(book.URI);
});

/**
 * Tests the context menu compose items.
 */
add_task(async function test_context_menu_compose() {
  const account = MailServices.accounts.createLocalMailAccount();
  account.addIdentity(MailServices.accounts.createIdentity());

  registerCleanupFunction(async () => {
    MailServices.accounts.removeAccount(account, true);
  });

  const book = createAddressBook("Book");
  const contactA = book.addCard(createContact("Contact", "A"));
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
  const list = book.addMailList(createMailingList("List"));
  list.addCard(contactA);
  list.addCard(contactB);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abWindow.cardsPane.cardsList;

  const menu = abDocument.getElementById("cardContext");
  const writeMenuItem = abDocument.getElementById("cardContextWrite");
  const writeMenu = abDocument.getElementById("cardContextWriteMenu");
  const writeMenuSeparator = abDocument.getElementById(
    "cardContextWriteSeparator"
  );

  openDirectory(book);

  // Contact A, first and only email address.

  let composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await showCardsContext(0);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact A <contact.a@invalid>"
  );

  // Contact B, first email address.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await showCardsContext(1);
  Assert.ok(writeMenuItem.hidden, "write menu item hidden");
  Assert.ok(!writeMenu.hidden, "write menu shown");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
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

  await showCardsContext(1);
  Assert.ok(writeMenuItem.hidden, "write menu item hidden");
  Assert.ok(!writeMenu.hidden, "write menu shown");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
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

  await showCardsContext(2);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact C <c.contact@invalid>"
  );

  // Contact D, no email address.

  await showCardsContext(3);
  Assert.ok(writeMenuItem.hidden, "write menu item hidden");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(writeMenuSeparator.hidden, "write menu separator hidden");
  menu.hidePopup();

  // List.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  await showCardsContext(4);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(await composeWindowPromise, "List <List>");

  // Contact A and Contact D.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndices = [0, 3];
  await showCardsContext(3);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact A <contact.a@invalid>"
  );

  // Contact B and Contact C.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndices = [1, 2];
  await showCardsContext(2);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
  menu.activateItem(writeMenuItem);

  await checkComposeWindow(
    await composeWindowPromise,
    "Contact B <contact.b@invalid>",
    "Contact C <c.contact@invalid>"
  );

  // Contact B and List.

  composeWindowPromise = BrowserTestUtils.domWindowOpened();

  cardsList.selectedIndices = [1, 4];
  await showCardsContext(4);
  Assert.ok(!writeMenuItem.hidden, "write menu item shown");
  Assert.ok(writeMenu.hidden, "write menu hidden");
  Assert.ok(!writeMenuSeparator.hidden, "write menu separator shown");
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
 * Tests the context menu edit items.
 */
add_task(async function test_context_menu_edit() {
  const normalBook = createAddressBook("Normal Book");
  const normalList = normalBook.addMailList(createMailingList("Normal List"));
  const normalContact = normalBook.addCard(createContact("Normal", "Contact"));
  normalList.addCard(normalContact);

  const readOnlyBook = createAddressBook("Read-Only Book");
  const readOnlyList = readOnlyBook.addMailList(
    createMailingList("Read-Only List")
  );
  const readOnlyContact = readOnlyBook.addCard(
    createContact("Read-Only", "Contact")
  );
  readOnlyList.addCard(readOnlyContact);
  readOnlyBook.setBoolValue("readOnly", true);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abWindow.cardsPane.cardsList;

  const menu = abDocument.getElementById("cardContext");
  const editMenuItem = abDocument.getElementById("cardContextEdit");
  const exportMenuItem = abDocument.getElementById("cardContextExport");

  async function checkEditItems(index, hidden, isMailList = false) {
    await showCardsContext(index);

    Assert.equal(
      editMenuItem.hidden,
      hidden,
      `editMenuItem should be hidden=${hidden} on index ${index}`
    );
    Assert.equal(
      exportMenuItem.hidden,
      !isMailList,
      `exportMenuItem should be hidden=${!isMailList} on index ${index}`
    );

    Assert.deepEqual(document.l10n.getAttributes(editMenuItem), {
      id: isMailList
        ? "about-addressbook-books-context-edit-list"
        : "about-addressbook-books-context-edit",
      args: null,
    });

    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  info("Testing Normal Book");
  openDirectory(normalBook);
  await checkEditItems(0, false); // normal contact
  await checkEditItems(1, false, true); // normal list

  cardsList.selectedIndices = [0, 1];
  await checkEditItems(0, true); // normal contact + normal list
  await checkEditItems(1, true); // normal contact + normal list

  info("Testing Normal List");
  openDirectory(normalList);
  await checkEditItems(0, false); // normal contact

  info("Testing Read-Only Book");
  openDirectory(readOnlyBook);
  await checkEditItems(0, true); // read-only contact
  await checkEditItems(1, true, true); // read-only list

  info("Testing Read-Only List");
  openDirectory(readOnlyList);
  await checkEditItems(0, true); // read-only contact

  info("Testing All Address Books");
  openAllAddressBooks();
  await checkEditItems(0, false); // normal contact
  await checkEditItems(1, false, true); // normal list
  await checkEditItems(2, true); // read-only contact
  await checkEditItems(3, true, true); // read-only list

  cardsList.selectedIndices = [0, 1];
  await checkEditItems(1, true); // normal contact + normal list

  cardsList.selectedIndices = [0, 2];
  await checkEditItems(2, true); // normal contact + read-only contact

  cardsList.selectedIndices = [1, 3];
  await checkEditItems(3, true); // normal list + read-only list

  cardsList.selectedIndices = [0, 1, 2, 3];
  await checkEditItems(3, true); // everything

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(normalBook.URI);
  await promiseDirectoryRemoved(readOnlyBook.URI);
});

/**
 * Tests the context menu delete items.
 */
add_task(async function test_context_menu_delete() {
  const normalBook = createAddressBook("Normal Book");
  const normalList = normalBook.addMailList(createMailingList("Normal List"));
  const normalContact = normalBook.addCard(createContact("Normal", "Contact"));
  normalList.addCard(normalContact);

  const readOnlyBook = createAddressBook("Read-Only Book");
  const readOnlyList = readOnlyBook.addMailList(
    createMailingList("Read-Only List")
  );
  const readOnlyContact = readOnlyBook.addCard(
    createContact("Read-Only", "Contact")
  );
  readOnlyList.addCard(readOnlyContact);
  readOnlyBook.setBoolValue("readOnly", true);

  const abWindow = await openAddressBookWindow();
  const abDocument = abWindow.document;
  const cardsList = abWindow.cardsPane.cardsList;

  const menu = abDocument.getElementById("cardContext");
  const deleteMenuItem = abDocument.getElementById("cardContextDelete");
  const removeMenuItem = abDocument.getElementById("cardContextRemove");

  async function checkDeleteItems(index, deleteHidden, removeHidden, disabled) {
    await showCardsContext(index);

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

    const hiddenPromise = BrowserTestUtils.waitForEvent(menu, "popuphidden");
    menu.hidePopup();
    await hiddenPromise;
  }

  info("Testing Normal Book");
  openDirectory(normalBook);
  await checkDeleteItems(0, false, true, false); // normal contact
  await checkDeleteItems(1, false, true, false); // normal list

  cardsList.selectedIndices = [0, 1];
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

  cardsList.selectedIndices = [0, 1];
  await checkDeleteItems(1, false, true, false); // normal contact + normal list

  cardsList.selectedIndices = [0, 2];
  await checkDeleteItems(2, false, true, true); // normal contact + read-only contact

  cardsList.selectedIndices = [1, 3];
  await checkDeleteItems(3, false, true, true); // normal list + read-only list

  cardsList.selectedIndices = [0, 1, 2, 3];
  await checkDeleteItems(3, false, true, true); // everything

  await closeAddressBookWindow();

  await promiseDirectoryRemoved(normalBook.URI);
  await promiseDirectoryRemoved(readOnlyBook.URI);
});

add_task(async function test_layout() {
  function checkColumns(visibleColumns, sortColumn, sortDirection) {
    const visibleHeaders = cardsHeader.querySelectorAll(
      `th[is="tree-view-table-header-cell"]:not([hidden])`
    );
    Assert.deepEqual(
      Array.from(visibleHeaders, h => h.id),
      visibleColumns,
      "visible columns are correct"
    );

    for (const header of visibleHeaders) {
      const button = header.querySelector("button");
      Assert.equal(
        button.classList.contains("ascending"),
        header.id == sortColumn && sortDirection == "ascending",
        `${header.id} header is ascending`
      );
      Assert.equal(
        button.classList.contains("descending"),
        header.id == sortColumn && sortDirection == "descending",
        `${header.id} header is descending`
      );
    }
  }

  function checkRowHeight(height) {
    Assert.equal(cardsList.getRowAtIndex(0).clientHeight, height);
  }

  Services.prefs.setIntPref("mail.uidensity", 0);
  personalBook.addCard(
    createContact("contact", "one", undefined, "first@invalid")
  );
  personalBook.addCard(
    createContact("contact", "two", undefined, "second@invalid")
  );
  personalBook.addCard(
    createContact("contact", "three", undefined, "third@invalid")
  );
  personalBook.addCard(
    createContact("contact", "four", undefined, "fourth@invalid")
  );

  let abWindow = await openAddressBookWindow();
  let abDocument = abWindow.document;
  let cardsList = abWindow.cardsPane.cardsList;
  let cardsHeader = abWindow.cardsPane.table.header;
  let sharedSplitter = abDocument.getElementById("sharedSplitter");

  // Sanity check.

  Assert.ok(
    !abDocument.body.classList.contains("layout-table"),
    "not table layout on opening"
  );
  Assert.equal(
    sharedSplitter.resizeDirection,
    "horizontal",
    "splitter direction is horizontal"
  );
  Assert.equal(
    sharedSplitter.resizeElement.id,
    "cardsPane",
    "splitter is affecting the cards pane"
  );
  Assert.equal(
    cardsList.getAttribute("rows"),
    "ab-card-row",
    "list row implementation used"
  );

  // Switch layout to table.

  await toggleLayout();

  Assert.ok(
    abDocument.body.classList.contains("layout-table"),
    "layout changed"
  );
  Assert.equal(
    sharedSplitter.resizeDirection,
    "vertical",
    "splitter direction is vertical"
  );
  Assert.equal(
    sharedSplitter.resizeElement.id,
    "detailsPane",
    "splitter is affecting the details pane"
  );
  Assert.equal(
    cardsList.getAttribute("rows"),
    "ab-table-card-row",
    "table row implementation used"
  );

  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Addresses"],
    "GeneratedName",
    "ascending"
  );
  checkNamesListed(
    "contact four",
    "contact one",
    "contact three",
    "contact two"
  );
  checkRowHeight(18);

  // Click the email addresses header to sort.

  EventUtils.synthesizeMouseAtCenter(
    cardsHeader.querySelector(`[id="EmailAddressesButton"]`),
    {},
    abWindow
  );
  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Addresses"],
    "EmailAddresses",
    "ascending"
  );
  checkNamesListed(
    "contact one",
    "contact four",
    "contact two",
    "contact three"
  );

  // Click the email addresses header again to flip the sort.

  EventUtils.synthesizeMouseAtCenter(
    cardsHeader.querySelector(`[id="EmailAddressesButton"]`),
    {},
    abWindow
  );
  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Addresses"],
    "EmailAddresses",
    "descending"
  );
  checkNamesListed(
    "contact three",
    "contact two",
    "contact four",
    "contact one"
  );

  // Add a column.

  await showPickerMenu("toggle", "Title");
  await TestUtils.waitForCondition(
    () => !cardsHeader.querySelector(`[id="Title"]`).hidden
  );
  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Addresses", "Title"],
    "EmailAddresses",
    "descending"
  );

  // Remove a column.

  await showPickerMenu("toggle", "Addresses");
  await TestUtils.waitForCondition(
    () => cardsHeader.querySelector(`[id="Addresses"]`).hidden
  );
  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Title"],
    "EmailAddresses",
    "descending"
  );

  // Change the density.

  Services.prefs.setIntPref("mail.uidensity", 1);
  checkRowHeight(22);

  Services.prefs.setIntPref("mail.uidensity", 2);
  checkRowHeight(32);

  // Close and reopen the Address Book and check that settings were remembered.

  await closeAddressBookWindow();

  abWindow = await openAddressBookWindow();
  abDocument = abWindow.document;
  cardsList = abWindow.cardsPane.cardsList;
  cardsHeader = abWindow.cardsPane.table.header;
  sharedSplitter = abDocument.getElementById("sharedSplitter");

  Assert.ok(
    abDocument.body.classList.contains("layout-table"),
    "table layout preserved on reopening"
  );
  Assert.equal(
    sharedSplitter.resizeDirection,
    "vertical",
    "splitter direction preserved as vertical"
  );
  Assert.equal(
    sharedSplitter.resizeElement.id,
    "detailsPane",
    "splitter preserved affecting the details pane"
  );
  Assert.equal(
    cardsList.getAttribute("rows"),
    "ab-table-card-row",
    "table row implementation used"
  );

  checkColumns(
    ["GeneratedName", "EmailAddresses", "PhoneNumbers", "Title"],
    "EmailAddresses",
    "descending"
  );
  checkNamesListed(
    "contact three",
    "contact two",
    "contact four",
    "contact one"
  );
  checkRowHeight(32);

  // Reset layout to list.

  await toggleLayout();

  Assert.ok(
    !abDocument.body.classList.contains("layout-table"),
    "layout changed"
  );
  Assert.equal(
    sharedSplitter.resizeDirection,
    "horizontal",
    "splitter direction is horizontal"
  );
  Assert.equal(
    sharedSplitter.resizeElement.id,
    "cardsPane",
    "splitter is affecting the cards pane"
  );
  Assert.equal(
    cardsList.getAttribute("rows"),
    "ab-card-row",
    "list row implementation used"
  );

  await closeAddressBookWindow();

  Services.xulStore.removeDocument("about:addressbook");
  Services.prefs.clearUserPref("mail.uidensity");
  personalBook.deleteCards(personalBook.childCards);
});

add_task(async function test_placeholders() {
  const writableBook = createAddressBook("Writable Book");
  const readOnlyBook = createAddressBook("Read-Only Book");
  readOnlyBook.setBoolValue("readOnly", true);

  const abWindow = await openAddressBookWindow();
  const placeholderCreateContact = abWindow.document.getElementById(
    "placeholderCreateContact"
  );

  info("checking all address books");
  await openAllAddressBooks();
  checkPlaceholders(["placeholderEmptyBook", "placeholderCreateContact"]);

  info("checking writable book");
  await openDirectory(writableBook);
  checkPlaceholders(["placeholderEmptyBook", "placeholderCreateContact"]);

  const writableList = writableBook.addMailList(
    createMailingList("Writable List")
  );
  checkPlaceholders();

  info("checking writable list");
  await openDirectory(writableList);
  checkPlaceholders(["placeholderEmptyBook"]);

  info("checking writable book");
  await openDirectory(writableBook);
  writableBook.deleteDirectory(writableList);
  checkPlaceholders(["placeholderEmptyBook", "placeholderCreateContact"]);

  info("checking read-only book");
  await openDirectory(readOnlyBook);
  checkPlaceholders(["placeholderEmptyBook"]);

  // This wouldn't happen but we need to check the state in a read-only list.
  readOnlyBook.setBoolValue("readOnly", false);
  const readOnlyList = readOnlyBook.addMailList(
    createMailingList("Read-Only List")
  );
  readOnlyBook.setBoolValue("readOnly", true);
  checkPlaceholders();

  info("checking read-only list");
  await openDirectory(readOnlyList);
  checkPlaceholders(["placeholderEmptyBook"]);

  info("checking read-only book");
  await openDirectory(readOnlyBook);
  readOnlyBook.setBoolValue("readOnly", false);
  readOnlyBook.deleteDirectory(readOnlyList);
  readOnlyBook.setBoolValue("readOnly", true);
  checkPlaceholders(["placeholderEmptyBook"]);

  info("checking button opens a new contact to edit");
  await openAllAddressBooks();
  checkPlaceholders(["placeholderEmptyBook", "placeholderCreateContact"]);
  EventUtils.synthesizeMouseAtCenter(placeholderCreateContact, {}, abWindow);

  await TestUtils.waitForCondition(
    () => abWindow.detailsPane.isEditing,
    "entering editing mode"
  );

  await closeAddressBookWindow();
  await promiseDirectoryRemoved(writableBook.URI);
  await promiseDirectoryRemoved(readOnlyBook.URI);
});

/**
 * Checks that mailling lists address books are shown in the table layout.
 */
add_task(async function test_list_table_layout() {
  const book = createAddressBook("Book");
  book.addCard(createContact("contact", "one"));
  const list = createMailingList("list one");
  book.addMailList(list);

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;
  const cardsHeader = abWindow.cardsPane.table.header;

  // Switch layout to table.

  await toggleLayout();

  await showPickerMenu("toggle", "addrbook");
  await TestUtils.waitForCondition(
    () => !cardsHeader.querySelector(`[id="addrbook"]`).hidden
  );

  // Check for the contact that the column is shown.
  Assert.ok(
    !cardsList.getRowAtIndex(0).querySelector(".addrbook-column").hidden,
    "Address book column is shown."
  );

  Assert.ok(
    cardsList
      .getRowAtIndex(0)
      .querySelector(".addrbook-column")
      .textContent.includes("Book"),
    "Address book column has the correct name for a contact."
  );

  Assert.ok(
    cardsList
      .getRowAtIndex(0)
      .querySelector(".addrbook-column")
      .textContent.includes("Book"),
    "Address book column has the correct name for a list."
  );

  Services.xulStore.removeDocument("about:addressbook");
  await closeAddressBookWindow();
  await promiseDirectoryRemoved(book.URI);
});

/**
 * Tests the option of showing the address book for All Address Book for the
 * list view (vertical layout).
 */
add_task(async function test_list_all_address_book() {
  const firstBook = createAddressBook("First Book");
  const secondBook = createAddressBook("Second Book");
  firstBook.addCard(createContact("contact", "one"));
  secondBook.addCard(createContact("contact", "two"));
  const list = createMailingList("list two");
  secondBook.addMailList(list);

  const abWindow = await openAddressBookWindow();
  const cardsList = abWindow.cardsPane.cardsList;
  const cardsHeader = abWindow.cardsPane.table.header;

  info("Check that no address book suffix is present.");
  Assert.ok(
    !cardsList.getRowAtIndex(0).querySelector(".address-book-name"),
    "No address book suffix is present."
  );
  Assert.ok(
    !cardsList.getRowAtIndex(1).querySelector(".address-book-name"),
    "No address book suffix is present."
  );
  Assert.ok(
    !cardsList.getRowAtIndex(2).querySelector(".address-book-name"),
    "No address book suffix is present."
  );

  info("Toggle the option to show address books.");
  await showSortMenu("toggle", "addrbook");
  await TestUtils.waitForCondition(
    () => !cardsHeader.querySelector(`[id="addrbook"]`).hidden
  );

  Assert.ok(
    cardsList
      .getRowAtIndex(0)
      .querySelector(".address-book-name")
      .textContent.includes("First Book"),
    "Address book suffix is present."
  );
  Assert.ok(
    cardsList
      .getRowAtIndex(1)
      .querySelector(".address-book-name")
      .textContent.includes("Second Book"),
    "Address book suffix is present."
  );
  Assert.ok(
    cardsList
      .getRowAtIndex(2)
      .querySelector(".address-book-name")
      .textContent.includes("Second Book"),
    "Address book suffix is present for a list."
  );

  info(`Select another address book and check that no address book suffix is
  present for another book besides All Address Book`);
  await openDirectory(secondBook);
  Assert.ok(
    !cardsList.getRowAtIndex(0).querySelector(".address-book-name"),
    "Address book suffix is only present in All Address Book."
  );

  Services.xulStore.removeDocument("about:addressbook");
  await closeAddressBookWindow();
  await promiseDirectoryRemoved(firstBook.URI);
  await promiseDirectoryRemoved(secondBook.URI);
});
