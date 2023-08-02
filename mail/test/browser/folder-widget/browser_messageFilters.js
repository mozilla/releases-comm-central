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
  make_message_sets_in_folders,
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
  click_menus_in_sequence,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

var { gMockPromptService } = ChromeUtils.import(
  "resource://testing-common/mozmill/PromptHelpers.jsm"
);

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

var folderA, NNTPAccount;

add_setup(async function () {
  setupNNTPDaemon();

  folderA = await create_folder("FolderToolbarA");
  // we need one message to select and open
  await make_message_sets_in_folders([folderA], [{ count: 1 }]);

  const server = setupLocalServer(NNTP_PORT);
  NNTPAccount = MailServices.accounts.FindAccountForServer(server);

  registerCleanupFunction(() => {
    folderA.deleteSelf(null);
    MailServices.accounts.removeAccount(NNTPAccount);
    // Some tests that open new windows don't return focus to the main window
    // in a way that satisfies mochitest, and the test times out.
    Services.focus.focusedWindow = window;
  });
});

/**
 * Tests the keyboard navigation on the message filters window, ensures that the
 * new fitler toolbarbutton and it's dropdown work correctly.
 */
add_task(async function key_navigation_test() {
  await openFiltersDialogs();

  const filterc = wait_for_existing_window("mailnews:filterlist");
  const filterWinDoc = filterc.window.document;
  const BUTTONS_SELECTOR = `toolbarbutton:not([disabled="true"],[is="toolbarbutton-menu-button"]),dropmarker, button:not([hidden])`;
  const filterButtonList = filterWinDoc.getElementById("filterActionButtons");
  const navigableButtons = filterButtonList.querySelectorAll(BUTTONS_SELECTOR);
  const menupopupNewFilter = filterWinDoc.getElementById("newFilterMenupopup");

  EventUtils.synthesizeKey("KEY_Tab", {}, filterc.window);
  Assert.equal(
    filterWinDoc.activeElement.id,
    navigableButtons[0].id,
    "focused on the first filter action button"
  );

  for (let button of navigableButtons) {
    if (!filterWinDoc.getElementById(button.id).disabled) {
      Assert.equal(
        filterWinDoc.activeElement.id,
        button.id,
        "focused on the correct filter action button"
      );

      if (button.id == "newButtontoolbarbutton") {
        function openEmptyDialog(fec) {
          fec.window.document.getElementById("filterName").value = " ";
        }

        plan_for_modal_dialog("mailnews:filtereditor", openEmptyDialog);
        EventUtils.synthesizeKey("KEY_Enter", {}, filterc.window);
        wait_for_modal_dialog("mailnews:filtereditor");

        plan_for_modal_dialog("mailnews:filtereditor", openEmptyDialog);
        // Simulate Space keypress.
        EventUtils.synthesizeKey(" ", {}, filterc.window);
        wait_for_modal_dialog("mailnews:filtereditor");

        Assert.equal(
          filterWinDoc.activeElement.id,
          button.id,
          "Correct btn is focused after opening and closing new filter editor"
        );
      } else if (button.id == "newButtondropmarker") {
        const menupopupOpenPromise = BrowserTestUtils.waitForEvent(
          menupopupNewFilter,
          "popupshown"
        );
        EventUtils.synthesizeKey("KEY_Enter", {}, filterc.window);
        await menupopupOpenPromise;
        const menupopupClosePromise = BrowserTestUtils.waitForEvent(
          menupopupNewFilter,
          "popuphidden"
        );
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc.window);
        await menupopupClosePromise;

        // Simulate Space keypress.
        EventUtils.synthesizeKey(" ", {}, filterc.window);
        await menupopupOpenPromise;
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc.window);
        await menupopupClosePromise;
        Assert.equal(
          filterWinDoc.activeElement.id,
          button.id,
          "The correct btn is focused after opening and closing the menupopup"
        );
      }
    }
    EventUtils.synthesizeKey("KEY_Tab", {}, filterc.window);
  }

  close_window(filterc);
}).__skipMe = AppConstants.platform == "macosx";

/*
 * Test that the message filter list shows newsgroup servers.
 */
add_task(async function test_message_filter_shows_newsgroup_server() {
  await be_in_folder(folderA);

  plan_for_new_window("mailnews:filterlist");
  await openFiltersDialogs();
  let filterc = wait_for_new_window("mailnews:filterlist");
  wait_for_window_focused(filterc.window);

  let popup = filterc.window.document.getElementById("serverMenuPopup");
  Assert.ok(popup);
  EventUtils.synthesizeMouseAtCenter(popup, {}, popup.ownerGlobal);

  let nntp = popup.children.item(1);
  Assert.ok(nntp);
  // We need to get the newsgroups to pop up somehow.
  // These all fail.
  // EventUtils.synthesizeMouseAtCenter(nntp, { }, nntp.ownerGlobal)
  // filterc.mouseover(nntp);
  // filterc.select(popup, popup.parentNode.getIndexOfItem(nntp));
  // filterc.select(nntp, popup.parentNode.getIndexOfItem(nntp));
  // filterc.select(popup, 2);
  // let nntpPopup = nntp.menupopup;
  // EventUtils.synthesizeMouseAtCenter(nntpPopup, { }, nntpPopup.ownerGlobal)
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

/* A helper function that opens up the new filter dialog (assuming that the
 * main filters dialog is already open), creates a simple filter, and then
 * closes the dialog.
 */
async function create_simple_filter() {
  await openFiltersDialogs();

  // We'll assume that the filters dialog is already open from
  // the previous tests.
  let filterc = wait_for_existing_window("mailnews:filterlist");

  function fill_in_filter_fields(fec) {
    let filterName = fec.window.document.getElementById("filterName");
    filterName.value = "A Simple Filter";
    fec.window.document.getElementById("searchAttr0").value =
      Ci.nsMsgSearchAttrib.To;
    fec.window.document.getElementById("searchOp0").value = Ci.nsMsgSearchOp.Is;
    let searchVal = fec.window.document.getElementById("searchVal0").input;
    searchVal.setAttribute("value", "test@foo.invalid");

    let filterActions = fec.window.document.getElementById("filterActionList");
    let firstAction = filterActions.getItemAtIndex(0);
    firstAction.setAttribute("value", "markasflagged");
    fec.window.document.querySelector("dialog").acceptDialog();
  }

  // Let's open the filter editor.
  plan_for_modal_dialog("mailnews:filtereditor", fill_in_filter_fields);
  EventUtils.synthesizeMouseAtCenter(
    filterc.window.document.getElementById("newButton"),
    {},
    filterc.window.document.getElementById("newButton").ownerGlobal
  );
  wait_for_modal_dialog("mailnews:filtereditor");
}

/**
 * Open the Message Filters dialog by clicking the menus.
 */
async function openFiltersDialogs() {
  if (AppConstants.platform == "macosx") {
    // Can't click the menus on mac.
    mc.window.MsgFilters();
    return;
  }
  // Show menubar so we can click it.
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  // Open the "Tools | Message Filters…", a.k.a. "tasksMenu » filtersCmd".
  EventUtils.synthesizeMouseAtCenter(
    mc.window.document.getElementById("tasksMenu"),
    {},
    mc.window
  );
  await click_menus_in_sequence(
    mc.window.document.getElementById("taskPopup"),
    [{ id: "filtersCmd" }]
  );
}

/**
 * Test that the address books can appear in the message filter dropdown
 */
add_task(async function test_address_books_appear_in_message_filter_dropdown() {
  // Create a remote address book - we don't want this to appear in the
  // dropdown.
  let ldapAb = create_ldap_address_book("Some LDAP Address Book");

  // Sanity check - this LDAP book should be remote.
  Assert.ok(ldapAb.isRemote);

  await openFiltersDialogs();

  // We'll assume that the filters dialog is already open from
  // the previous tests.
  let filterc = wait_for_existing_window("mailnews:filterlist");

  // Prepare a function to deal with the filter editor once it
  // has opened
  function filterEditorOpened(fec) {
    fec.window.document.getElementById("searchAttr0").value =
      Ci.nsMsgSearchAttrib.To;
    fec.window.document.getElementById("searchOp0").value =
      Ci.nsMsgSearchOp.IsInAB;
    let abList = fec.window.document.getElementById("searchVal0").input;

    // We should have 2 address books here - one for the Personal Address
    // Book, and one for Collected Addresses.  The LDAP address book should
    // not be shown, since it isn't a local address book.
    Assert.equal(
      abList.itemCount,
      2,
      "Should have 2 address books in the filter menu list."
    );
  }

  // Let's open the filter editor.
  plan_for_modal_dialog("mailnews:filtereditor", filterEditorOpened);
  EventUtils.synthesizeMouseAtCenter(
    filterc.window.document.getElementById("newButton"),
    {},
    filterc.window.document.getElementById("newButton").ownerGlobal
  );
  wait_for_modal_dialog("mailnews:filtereditor");
});

/* Test that if the user has started running a filter, and the
 * "quit-application-requested" notification is fired, the user
 * is given a dialog asking whether or not to quit.
 *
 * This also tests whether or not cancelling quit works.
 */
add_task(async function test_can_cancel_quit_on_filter_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  await create_simple_filter();

  let filterc = wait_for_existing_window("mailnews:filterlist");
  let runButton = filterc.window.document.getElementById("runFiltersButton");
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
add_task(async function test_can_quit_on_filter_changes() {
  // Register the Mock Prompt Service
  gMockPromptService.register();

  let filterc = wait_for_existing_window("mailnews:filterlist");

  // There should already be 1 filter defined from previous test.
  let filterCount =
    filterc.window.document.getElementById("filterList").itemCount;
  Assert.equal(filterCount, 1);

  let runButton = filterc.window.document.getElementById("runFiltersButton");
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

  EventUtils.synthesizeMouseAtCenter(
    filterc.window.document.querySelector("#filterList richlistitem"),
    {},
    filterc.window
  );

  const deleteAlertPromise = BrowserTestUtils.promiseAlertDialogOpen(
    "",
    "chrome://global/content/commonDialog.xhtml",
    {
      async callback(win) {
        EventUtils.synthesizeKey("VK_RETURN", {}, win);
      },
    }
  );
  EventUtils.synthesizeKey("KEY_Delete", {}, filterc.window);
  await deleteAlertPromise;

  Assert.equal(
    filterc.window.document.getElementById("filterList").itemCount,
    0,
    "Previously created filter should have been deleted."
  );

  close_window(filterc);
});
