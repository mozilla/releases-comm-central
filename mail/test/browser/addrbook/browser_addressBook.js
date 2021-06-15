/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Tests for the address book.
 */

"use strict";

var {
  close_address_book_window,
  create_address_book,
  delete_address_book,
  create_contact,
  create_ldap_address_book,
  create_mailing_list,
  get_name_of_address_book_element_at,
  is_address_book_collapsed,
  load_contacts_into_address_book,
  load_contacts_into_mailing_list,
  open_address_book_window,
  select_address_book,
  select_contacts,
  set_address_books_collapsed,
  set_address_books_expanded,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { close_compose_window, wait_for_compose_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);
var { plan_for_new_window } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var abController = null;
var addrBook1, addrBook2, addrBook3, addrBook4, ldapBook;
var mListA, mListB, mListC, mListD, mListE;

add_task(function setupModule(module) {
  // Open the address book main window
  abController = open_address_book_window();

  // Let's add some new address books.  I'll add them
  // out of order to properly test the alphabetical
  // ordering of the address books.
  ldapBook = create_ldap_address_book("LDAP Book");
  addrBook3 = create_address_book("AB 3");
  addrBook1 = create_address_book("AB 1");
  addrBook4 = create_address_book("AB 4");
  addrBook2 = create_address_book("AB 2");

  abController.sleep();

  mListA = create_mailing_list("ML A");
  addrBook1.addMailList(mListA);

  mListB = create_mailing_list("ML B");
  addrBook2.addMailList(mListB);

  mListC = create_mailing_list("ML C");
  addrBook3.addMailList(mListC);

  mListD = create_mailing_list("ML D");
  addrBook3.addMailList(mListD);

  // There are 8 address books (All, Personal, AB 1, AB 2, AB 3, AB 4, LDAP Book
  // and Collected Address Book) and 4 mailing lists.  So let's ensure that
  // those address books exist in the tree view before executing our tests.
  abController.waitFor(
    () => abController.window.gDirectoryTreeView.rowCount == 12,
    "Timeout waiting for all 12 rows in address books list to show up in the tree view",
    1000,
    10
  );

  set_address_books_collapsed([addrBook1, addrBook2, addrBook3]);
});

registerCleanupFunction(function teardownModule(module) {
  close_address_book_window(abController);
});

/* Test that the address book manager automatically sorts
 * address books.
 *
 * Currently, we sort address books as follows:
 * 1. All Address Books
 * 2. Personal Address Book
 * 3. Mork Address Books
 * 4. LDAP / Other Address Books
 * 5. Collected Address Book
 *
 * With the All, Personal and Collapsed address books existing
 * automatically, our address books *should* be in this order:
 *
 * All Address Books
 * Personal Address Book
 * AB 1
 *    ML A
 * AB 2
 *    ML B
 * AB 3
 *    ML C
 *    ML D
 * AB 4
 * LDAP Book
 * Collected Address Book
 **/
add_task(function test_order_of_address_books() {
  const EXPECTED_AB_ORDER = [
    "All Address Books",
    "Personal Address Book",
    "AB 1",
    "AB 2",
    "AB 3",
    "AB 4",
    "LDAP Book",
    "Collected Addresses",
  ];

  for (let i = 0; i < EXPECTED_AB_ORDER.length; i++) {
    let abName = get_name_of_address_book_element_at(i);
    Assert.equal(
      abName,
      EXPECTED_AB_ORDER[i],
      "The address books are out of order."
    );
  }
});

/* Test that the expanded and collapsed states of address books
 * in the tree persist state when closing and re-opening the
 * address book manager
 */
add_task(function test_persist_collapsed_and_expanded_states() {
  // Set the state of address books 1 and 3 to expanded
  set_address_books_expanded([addrBook1, addrBook3]);

  // Set address book 2 to be collapsed
  set_address_books_collapsed(addrBook2);

  // Now close and re-open the address book
  close_address_book_window(abController);
  abController = open_address_book_window();

  Assert.ok(is_address_book_collapsed(addrBook2));
  Assert.ok(!is_address_book_collapsed(addrBook1));
  Assert.ok(!is_address_book_collapsed(addrBook3));

  // Now set the state of address books 1 and 3 to collapsed
  // and make sure 2 is expanded
  set_address_books_collapsed([addrBook1, addrBook3]);
  set_address_books_expanded(addrBook2);

  // Now close and re-open the address book
  close_address_book_window(abController);
  abController = open_address_book_window();

  Assert.ok(!is_address_book_collapsed(addrBook2));
  Assert.ok(is_address_book_collapsed(addrBook1));
  Assert.ok(is_address_book_collapsed(addrBook3));
});

/* Test that if we try to delete a contact, that we are given
 * a confirm prompt.
 */
add_task(async function test_deleting_contact_causes_confirm_prompt() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  // Create a contact that we'll try to delete
  let contact1 = create_contact("test@example.com", "Sammy Jenkis", true);
  let toDelete = [contact1];

  // Add some contacts to the address book
  load_contacts_into_address_book(addrBook1, toDelete);
  select_address_book(addrBook1);

  let totalEntries = abController.window.gAbView.rowCount;

  // Set the mock prompt to return false, so that the
  // contact should not be deleted.
  gMockPromptService.returnValue = false;

  // Now attempt to delete the contact
  select_contacts(toDelete);
  let promptPromise = gMockPromptService.promisePrompt();
  EventUtils.synthesizeKey("VK_DELETE", {}, abController.window);
  await promptPromise;

  let promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");
  // Was a confirm displayed?
  Assert.equal("confirm", promptState.method);
  // Was the right message displayed?
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete the contact Sammy Jenkis?"
  );
  // The contact should not have been deleted.
  Assert.equal(abController.window.gAbView.rowCount, totalEntries);

  gMockPromptService.reset();

  // Now we'll return true on confirm so that
  // the contact is deleted.
  gMockPromptService.returnValue = true;
  select_contacts(toDelete);
  promptPromise = gMockPromptService.promisePrompt();
  EventUtils.synthesizeKey("VK_DELETE", {}, abController.window);
  await promptPromise;

  promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");
  // Was a confirm displayed?
  Assert.equal("confirm", promptState.method);
  // Was the right message displayed?
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete the contact Sammy Jenkis?"
  );
  // The contact should have been deleted.
  Assert.equal(
    abController.window.gAbView.rowCount,
    totalEntries - toDelete.length
  );

  gMockPromptService.unregister();
});

/* Test that if we try to delete multiple contacts, that we are give
 * a confirm prompt.
 */
add_task(async function test_deleting_contacts_causes_confirm_prompt() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  // Create some contacts that we'll try to delete.
  let contact2 = create_contact("test2@example.com", "Leonard Shelby", true);
  let contact3 = create_contact(
    "test3@example.com",
    "John Edward Gammell",
    true
  );
  let contact4 = create_contact("test4@example.com", "Natalie", true);

  let toDelete = [contact2, contact3, contact4];

  // Add some contacts to the address book
  load_contacts_into_address_book(addrBook1, toDelete);
  select_address_book(addrBook1);

  let totalEntries = abController.window.gAbView.rowCount;
  Assert.equal(totalEntries, 4);

  // Set the mock prompt to return false, so that the
  // contact should not be deleted.
  gMockPromptService.returnValue = false;

  // Now attempt to delete the contact
  select_contacts(toDelete);
  let promptPromise = gMockPromptService.promisePrompt();
  EventUtils.synthesizeKey("VK_DELETE", {}, abController.window);
  await promptPromise;

  let promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");
  // Was a confirm displayed?
  Assert.equal("confirm", promptState.method);
  // Was the right message displayed?
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete these 3 contacts?"
  );
  // The contact should not have been deleted.
  Assert.equal(abController.window.gAbView.rowCount, totalEntries);

  gMockPromptService.reset();

  // Now we'll return true on confirm so that
  // the contact is deleted.
  gMockPromptService.returnValue = true;
  select_contacts(toDelete);
  promptPromise = gMockPromptService.promisePrompt();
  EventUtils.synthesizeKey("VK_DELETE", {}, abController.window);
  await promptPromise;

  promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");
  // Was a confirm displayed?
  Assert.equal("confirm", promptState.method);
  // Was the right message displayed?
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete these 3 contacts?"
  );
  // The contact should have been deleted.
  Assert.equal(
    abController.window.gAbView.rowCount,
    totalEntries - toDelete.length
  );

  gMockPromptService.unregister();
});

/* Tests that attempting to delete a mailing list causes a
 * confirmation dialog to be brought up, and that deletion
 * actually works if the user clicks "OK".
 */
add_task(async function test_deleting_mailing_lists() {
  // Register our Mock Prompt Service
  gMockPromptService.register();

  // Create a new mailing list, and add it to one of our
  // address books
  let newList = create_mailing_list("Delete Me!");
  let addedList = addrBook1.addMailList(newList);

  // Make sure it got added.
  Assert.ok(addrBook1.hasDirectory(addedList));

  // Let's click "cancel" on the confirm dialog box
  // first.
  gMockPromptService.returnValue = false;

  let promptPromise = gMockPromptService.promisePrompt();
  abController.window.AbDeleteDirectory(addedList.URI);
  await promptPromise;

  let promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");

  // Test that the confirmation dialog was brought up.
  Assert.equal("confirm", promptState.method);
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete the list Delete Me!?"
  );

  // Ensure that the mailing list was not removed.
  Assert.ok(addrBook1.hasDirectory(addedList));

  // This time, let's click "OK" on the confirm dialog box
  gMockPromptService.reset();
  gMockPromptService.returnValue = true;

  promptPromise = gMockPromptService.promisePrompt();
  abController.window.AbDeleteDirectory(addedList.URI);
  await promptPromise;

  // Test that the confirmation dialog was brought up.
  promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a prompt state");
  Assert.equal("confirm", promptState.method);
  Assert.equal(
    promptState.text,
    "Are you sure you want to delete the list Delete Me!?"
  );

  // Ensure that the mailing list was removed.
  Assert.ok(!addrBook1.hasDirectory(addedList));

  gMockPromptService.unregister();
});

/* Tests that we can send mail to a mailing list by selecting the
 * mailing list in the tree, and clicking "Write"
 */
add_task(function test_writing_to_mailing_list() {
  // Create a new mailing list, and add it to one of our
  // address books
  let newList = create_mailing_list("Some Mailing List");
  let addedList = addrBook1.addMailList(newList);

  // Create some contacts that we'll try to contact
  let contacts = [
    create_contact("test2@example.com", "Leonard Shelby", true),
    create_contact("test3@example.com", "John Edward Gammell", true),
    create_contact("test4@example.com", "Natalie", true),
  ];

  load_contacts_into_mailing_list(addedList, contacts);

  // Ensure that addrBook1 is expanded
  set_address_books_expanded(addrBook1);

  // Now select the mailing list in the tree...
  select_address_book(addedList);

  // Focus it...
  abController.window.gDirTree.focus();

  // Assuming we've made it this far, now we just plan for the compose
  // window...
  plan_for_new_window("msgcompose");
  // ... and click the "Write" button
  abController.click(
    abController.window.document.getElementById("button-newmessage")
  );
  let composeWin = wait_for_compose_window(abController);
  let to = composeWin.window.gMsgCompose.compFields.to;

  // Make sure we're writing to all contacts in the mailing list.
  for (let contact of contacts) {
    Assert.ok(to.includes(contact.primaryEmail));
    Assert.ok(to.includes(contact.displayName));
  }

  close_compose_window(composeWin);

  registerCleanupFunction(() => {
    delete_address_book(addrBook1);
    delete_address_book(addrBook2);
    delete_address_book(addrBook3);
    delete_address_book(addrBook4);
    delete_address_book(ldapBook);
  });
});
