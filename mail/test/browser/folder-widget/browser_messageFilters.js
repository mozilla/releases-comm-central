/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test various properties of the message filters.
 */

"use strict";

var { create_ldap_address_book } = ChromeUtils.import(
  "resource://testing-common/mozmill/AddressBookHelpers.jsm"
);
var {
  be_in_folder,
  close_popup,
  create_folder,
  make_new_sets_in_folder,
  mc,
} = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { NNTP_PORT, setupLocalServer, setupNNTPDaemon } = ChromeUtils.import(
  "resource://testing-common/mozmill/NNTPHelpers.jsm"
);
var {
  close_window,
  plan_for_modal_dialog,
  plan_for_new_window,
  plan_for_window_close,
  wait_for_existing_window,
  wait_for_modal_dialog,
  wait_for_new_window,
  wait_for_window_focused,
  wait_for_window_close,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var folderA;

add_task(function setupModule(module) {
  setupNNTPDaemon();

  folderA = create_folder("FolderToolbarA");
  // we need one message to select and open
  make_new_sets_in_folder(folderA, [{ count: 1 }]);

  setupLocalServer(NNTP_PORT);
});

/*
 * Test that the message filter list shows newsgroup servers.
 */
add_task(function test_message_filter_shows_newsgroup_server() {
  be_in_folder(folderA);

  // Open the "Tools » Message Filters…" window,
  // a.k.a. "tasksMenu » filtersCmd".
  plan_for_new_window("mailnews:filterlist");
  mc.menus.Tools.filtersCmd.click();
  let filterc = wait_for_new_window("mailnews:filterlist");
  wait_for_window_focused(filterc.window);

  let popup = filterc.e("serverMenuPopup");
  Assert.ok(popup);
  filterc.click(popup);

  let nntp = popup.children.item(1);
  Assert.ok(nntp);
  // We need to get the newsgroups to pop up somehow.
  // These all fail.
  // filterc.click(nntp);
  // filterc.mouseover(nntp);
  // filterc.select(popup, popup.parentNode.getIndexOfItem(nntp));
  // filterc.select(nntp, popup.parentNode.getIndexOfItem(nntp));
  // filterc.select(popup, 2);
  // let nntpPopup = nntp.menupopup;
  // filterc.click(nntpPopup);
  // filterc.mouseover(nntpPopup);
  // filterc.select(nntpPopup, 2);

  // This one initializes the menuitems, but it's kinda hacky.
  nntp.menupopup._ensureInitialized();
  Assert.equal(
    nntp.itemCount,
    5,
    "Incorrect number of children for the NNTP server"
  );
  close_window(filterc);
});

/*
 * Test that customizing the toolbar doesn't lead to doubled accounts in
 * the Get Mail menu.  (bug 520457)
 */
add_task(async function test_customize_toolbar_doesnt_double_get_mail_menu() {
  be_in_folder(folderA);

  /**
   * Get the getAllNewMessages menu and check the number of items.
   */
  function check_getAllNewMsgMenu() {
    wait_for_window_focused(mc.window);

    const subview = mc.click_through_appmenu([
      { id: "appmenu_File" },
      { id: "appmenu_getNewMsgFor" },
    ]);

    Assert.equal(
      subview.children.length,
      5,
      "Incorrect number of items for GetNewMessages before customization"
    );

    // Close the appmenu.
    mc.click(mc.e("button-appmenu"));
  }

  check_getAllNewMsgMenu();

  plan_for_new_window("mailnews:customizeToolbar");
  // Open the customization dialog.
  mc.rightClick(mc.e("mail-bar3"));
  mc.click(mc.e("CustomizeMailToolbar"));
  await close_popup(mc, mc.e("toolbar-context-menu"));

  let customc = wait_for_new_window("mailnews:customizeToolbar");
  wait_for_window_focused(customc.window);
  plan_for_window_close(customc);
  customc.click(customc.e("donebutton"));
  wait_for_window_close();

  check_getAllNewMsgMenu();
}).__skipMe =
  AppConstants.platform == "macosx" || AppConstants.platform == "win";

/* A helper function that opens up the new filter dialog (assuming that the
 * main filters dialog is already open), creates a simple filter, and then
 * closes the dialog.
 */
function create_simple_filter() {
  // Open the "Tools » Message Filters…" window,
  // a.k.a. "tasksMenu » filtersCmd".
  mc.menus.Tools.filtersCmd.click();

  // We'll assume that the filters dialog is already open from
  // the previous tests.
  let filterc = wait_for_existing_window("mailnews:filterlist");

  function fill_in_filter_fields(fec) {
    let filterName = fec.e("filterName");
    filterName.value = "A Simple Filter";
    let searchAttr = fec.e("searchAttr0");
    let attrList = searchAttr.children[0];
    attrList.value = Ci.nsMsgSearchAttrib.To;
    let searchOp = fec.e("searchOp0");
    let opList = searchOp.children[0];
    opList.value = Ci.nsMsgSearchOp.Is;
    let searchValList = fec.e("searchVal0");
    let searchVal = searchValList.children[0];
    searchVal.setAttribute("value", "test@foo.invalid");

    let filterActions = fec.e("filterActionList");
    let firstAction = filterActions.getItemAtIndex(0);
    firstAction.setAttribute("value", "markasflagged");
    fec.window.document.querySelector("dialog").acceptDialog();
  }

  // Let's open the filter editor.
  plan_for_modal_dialog("mailnews:filtereditor", fill_in_filter_fields);
  filterc.click(filterc.e("newButton"));
  wait_for_modal_dialog("mailnews:filtereditor");
}

/*
 * Test that the address books can appear in the message filter dropdown
 */
add_task(function test_address_books_appear_in_message_filter_dropdown() {
  // Create a remote address book - we don't want this to appear in the
  // dropdown.
  let ldapAb = create_ldap_address_book("Some LDAP Address Book");

  // Sanity check - this LDAP book should be remote.
  Assert.ok(ldapAb.isRemote);

  // Open the "Tools » Message Filters…" window,
  // a.k.a. "tasksMenu » filtersCmd".
  mc.menus.Tools.filtersCmd.click();

  // We'll assume that the filters dialog is already open from
  // the previous tests.
  let filterc = wait_for_existing_window("mailnews:filterlist");

  // Prepare a function to deal with the filter editor once it
  // has opened
  function filterEditorOpened(fec) {
    let searchAttr = fec.e("searchAttr0");
    let attrList = searchAttr.children[0];
    attrList.value = Ci.nsMsgSearchAttrib.To;
    let searchOp = fec.e("searchOp0");
    let opList = searchOp.children[0];
    opList.value = Ci.nsMsgSearchOp.IsInAB;
    let searchValue = fec.e("searchVal0");

    // The magic number "4" is because the address book list is the
    // 4th child node of the search-value widget.
    let abList = searchValue.children[4];

    // We should have 2 address books here - one for the Personal Address
    // Book, and one for Collected Addresses.  The LDAP address book should
    // not be shown, since it isn't a local address book.
    Assert.equal(
      2,
      abList.itemCount,
      "Did not display the correct number " +
        "of address books in the filter menu list."
    );
  }

  // Let's open the filter editor.
  plan_for_modal_dialog("mailnews:filtereditor", filterEditorOpened);
  filterc.click(filterc.e("newButton"));
  wait_for_modal_dialog("mailnews:filtereditor");
});

/* Test that if the user has started running a filter, and the
 * "quit-application-requested" notification is fired, the user
 * is given a dialog asking whether or not to quit.
 *
 * This also tests whether or not cancelling quit works.
 */
add_task(function test_can_cancel_quit_on_filter_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  create_simple_filter();

  let filterc = wait_for_existing_window("mailnews:filterlist");
  let runButton = filterc.e("runFiltersButton");
  runButton.setAttribute("label", runButton.getAttribute("stoplabel"));

  let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return false, so that we
  // cancel the quit.
  gMockPromptService.returnValue = false;
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  let promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a confirmEx prompt");

  Assert.equal("confirmEx", promptState.method);
  // Since we returned false on the confirmation dialog,
  // we should be cancelling the quit - so cancelQuit.data
  // should now be true
  Assert.ok(cancelQuit.data, "Didn't cancel the quit");

  // Unregister the Mock Prompt Service
  gMockPromptService.unregister();
});

/* Test that if the user has started running a filter, and the
 * "quit-application-requested" notification is fired, the user
 * is given a dialog asking whether or not to quit.
 *
 * This also tests whether or not allowing quit works.
 */
add_task(function test_can_quit_on_filter_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  let filterc = wait_for_existing_window("mailnews:filterlist");

  // There should already be 1 filter defined from previous test.
  let filterCount = filterc.e("filterList").itemCount;
  Assert.equal(filterCount, 1);

  let runButton = filterc.e("runFiltersButton");
  runButton.setAttribute("label", runButton.getAttribute("stoplabel"));

  let cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return true, so that we
  // allow the quit.
  gMockPromptService.returnValue = true;
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  let promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a confirmEx prompt");

  Assert.equal("confirmEx", promptState.method);
  // Since we returned true on the confirmation dialog,
  // we should be allowing the quit - so cancelQuit.data
  // should now be false
  Assert.ok(!cancelQuit.data, "Cancelled the quit");

  // Unregister the Mock Prompt Service
  gMockPromptService.unregister();

  close_window(filterc);
});

registerCleanupFunction(() => {
  // Some tests that open new windows don't return focus to the main window
  // in a way that satisfies mochitest, and the test times out.
  Services.focus.focusedWindow = window;
  window.gFolderDisplay.tree.focus();
});
