/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests contacts can be deleted from the compose window sidebar.
 */

"use strict";

var { create_contact, load_contacts_into_address_book } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var { click_tree_row } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);
var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { wait_for_frame_load } = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

/**
 * Bug 1619157
 * Test that a contact can be deleted from the Contacts sidebar.
 */
add_task(function test_sidebar_contact_delete() {
  gMockPromptService.register();
  gMockPromptService.returnValue = Ci.nsIPromptService.BUTTON_TITLE_OK;

  // Create some contact address book card in the Personal addressbook.
  let defaultAB = MailServices.ab.getDirectory("jsaddrbook://abook.sqlite");

  let contact = create_contact("test@example.com", "Sammy Jenkis", true);
  load_contacts_into_address_book(defaultAB, [contact]);

  let cwc = open_compose_new_mail(); // compose controller

  // Open Contacts sidebar.
  cwc.window.toggleAddressPicker();

  let sidebar = cwc.e("sidebar");
  let sidebarController = wait_for_frame_load(
    sidebar,
    "chrome://messenger/content/addressbook/abContactsPanel.xhtml?focus"
  );

  let abTree = sidebar.contentDocument.getElementById("abResultsTree");

  // The results are loaded async so wait for the population of the tree.
  sidebarController.waitFor(
    () => abTree.view.rowCount > 0,
    "Addressbook cards didn't load"
  );
  click_tree_row(abTree, 0, cwc);

  cwc.keypress(sidebarController.eid("abResultsTree"), "VK_DELETE", {});
  Assert.notEqual(
    null,
    gMockPromptService.promptState,
    "Expected a confirmEx prompt"
  );

  sidebarController.waitFor(
    () => abTree.view.rowCount == 0,
    "Card didn't delete"
  );

  cwc.window.toggleAddressPicker();
  close_compose_window(cwc);

  gMockPromptService.unregister();
});
