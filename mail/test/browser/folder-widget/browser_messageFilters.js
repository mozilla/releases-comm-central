/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test various properties of the message filters.
 */

"use strict";

var { create_ldap_address_book } = ChromeUtils.importESModule(
  "resource://testing-common/mail/AddressBookHelpers.sys.mjs"
);
var { be_in_folder, create_folder, make_message_sets_in_folders } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
  );
var { NNTP_PORT, setupLocalServer, setupNNTPDaemon } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NNTPHelpers.sys.mjs"
  );

var {
  click_menus_in_sequence,
  promise_modal_dialog,
  promise_new_window,
  wait_for_existing_window,
  wait_for_window_focused,
} = ChromeUtils.importESModule(
  "resource://testing-common/mail/WindowHelpers.sys.mjs"
);

var { gMockPromptService } = ChromeUtils.importESModule(
  "resource://testing-common/mail/PromptHelpers.sys.mjs"
);

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var folderA, NNTPAccount;

add_setup(async function () {
  setupNNTPDaemon();

  folderA = await create_folder("FolderToolbarA");
  // we need one message to select and open
  await make_message_sets_in_folders([folderA], [{ count: 1 }]);

  const server = setupLocalServer(NNTP_PORT);
  NNTPAccount = MailServices.accounts.findAccountForServer(server);

  registerCleanupFunction(() => {
    folderA.deleteSelf(null);
    // For some peculiar reason, removing won't work in --verify mode
    // if we remove the account here.
    //  MailServices.accounts.removeAccount(NNTPAccount);
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
  const filterc = await openFiltersDialogs();

  const filterWinDoc = filterc.document;
  const BUTTONS_SELECTOR = `toolbarbutton:not([disabled="true"],[is="toolbarbutton-menu-button"]),dropmarker, button:not([hidden])`;
  const filterButtonList = filterWinDoc.getElementById("filterActionButtons");
  const navigableButtons = filterButtonList.querySelectorAll(BUTTONS_SELECTOR);
  const menupopupNewFilter = filterWinDoc.getElementById("newFilterMenupopup");

  EventUtils.synthesizeKey("KEY_Tab", {}, filterc);
  Assert.equal(
    filterWinDoc.activeElement.id,
    navigableButtons[0].id,
    "focused on the first filter action button"
  );

  for (const button of navigableButtons) {
    if (!filterWinDoc.getElementById(button.id).disabled) {
      Assert.equal(
        filterWinDoc.activeElement.id,
        button.id,
        "focused on the correct filter action button"
      );

      if (button.id == "newButtontoolbarbutton") {
        function openEmptyDialog(fec) {
          fec.document.getElementById("filterName").value = " ";
          fec.close();
        }

        let dialogPromise = promise_modal_dialog(
          "mailnews:filtereditor",
          openEmptyDialog
        );
        EventUtils.synthesizeKey("KEY_Enter", {}, filterc);
        await dialogPromise;

        dialogPromise = promise_modal_dialog(
          "mailnews:filtereditor",
          openEmptyDialog
        );
        // Simulate Space keypress.
        EventUtils.synthesizeKey(" ", {}, filterc);
        await dialogPromise;

        Assert.equal(
          filterWinDoc.activeElement.id,
          button.id,
          "Correct btn is focused after opening and closing new filter editor"
        );
      } else if (button.id == "newButtondropmarker") {
        EventUtils.synthesizeKey("KEY_Enter", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "shown");
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "hidden");

        // Simulate Space keypress.
        EventUtils.synthesizeKey(" ", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "shown");
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "hidden");
        Assert.equal(
          filterWinDoc.activeElement.id,
          button.id,
          "The correct btn is focused after opening and closing the menupopup"
        );
      }
    }
    EventUtils.synthesizeKey("KEY_Tab", {}, filterc);
  }

  await BrowserTestUtils.closeWindow(filterc);
}).skip(AppConstants.platform == "macosx");

/*
 * Test that the message filter list shows newsgroup servers.
 */
add_task(async function test_message_filter_shows_newsgroup_server() {
  await be_in_folder(folderA);

  const filterc = await openFiltersDialogs();
  wait_for_window_focused(filterc);

  // Get the newsgroups to pop up.
  const serverMenu = filterc.document.getElementById("serverMenu");
  let popupshown = BrowserTestUtils.waitForEvent(serverMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(serverMenu, {}, serverMenu.ownerGlobal);
  await popupshown;

  const nntp = serverMenu.firstElementChild.children.item(1);
  Assert.equal(
    nntp.label,
    "localhost",
    "should show 'localhost' nntp server item in menu"
  );
  popupshown = BrowserTestUtils.waitForEvent(nntp, "popupshown");
  EventUtils.synthesizeMouseAtCenter(nntp, {}, nntp.ownerGlobal);
  await popupshown;

  Assert.equal(nntp.itemCount, 5, "All five items should show");
  await BrowserTestUtils.closeWindow(filterc);
});

/* A helper function that opens up the new filter dialog (assuming that the
 * main filters dialog is already open), creates a simple filter, and then
 * closes the dialog.
 */
async function create_simple_filter() {
  const filterc = await openFiltersDialogs();

  function fill_in_filter_fields(fec) {
    const filterName = fec.document.getElementById("filterName");
    filterName.value = "A Simple Filter";
    fec.document.getElementById("searchAttr0").value = Ci.nsMsgSearchAttrib.To;
    fec.document.getElementById("searchOp0").value = Ci.nsMsgSearchOp.Is;
    const searchVal = fec.document.getElementById("searchVal0").input;
    searchVal.setAttribute("value", "test@foo.invalid");

    const filterActions = fec.document.getElementById("filterActionList");
    const firstAction = filterActions.getItemAtIndex(0);
    firstAction.setAttribute("value", "markasflagged");
    fec.document.querySelector("dialog").acceptDialog();
  }

  // Let's open the filter editor.
  const dialogPromise = promise_modal_dialog(
    "mailnews:filtereditor",
    fill_in_filter_fields
  );
  EventUtils.synthesizeMouseAtCenter(
    filterc.document.getElementById("newButton"),
    {},
    filterc
  );
  await dialogPromise;

  return filterc;
}

/**
 * Open the Message Filters dialog by clicking the menus.
 */
async function openFiltersDialogs() {
  const filterListPromise = promise_new_window("mailnews:filterlist");
  if (AppConstants.platform == "macosx") {
    // Can't click the menus on mac.
    window.MsgFilters();
    return filterListPromise;
  }
  // Show menubar so we can click it.
  document.getElementById("toolbar-menubar").removeAttribute("autohide");
  // Open the "Tools | Message Filters…", a.k.a. "tasksMenu » filtersCmd".
  EventUtils.synthesizeMouseAtCenter(
    document.getElementById("tasksMenu"),
    {},
    window
  );
  await click_menus_in_sequence(document.getElementById("taskPopup"), [
    { id: "filtersCmd" },
  ]);
  return filterListPromise;
}

/**
 * Test that the address books can appear in the message filter dropdown
 */
add_task(async function test_address_books_appear_in_message_filter_dropdown() {
  // Create a remote address book - we don't want this to appear in the
  // dropdown.
  const ldapAb = create_ldap_address_book("Some LDAP Address Book");

  // Sanity check - this LDAP book should be remote.
  Assert.ok(ldapAb.isRemote);

  const filterc = await openFiltersDialogs();

  // Prepare a function to deal with the filter editor once it
  // has opened
  function filterEditorOpened(fec) {
    fec.document.getElementById("searchAttr0").value = Ci.nsMsgSearchAttrib.To;
    fec.document.getElementById("searchOp0").value = Ci.nsMsgSearchOp.IsInAB;
    const abList = fec.document.getElementById("searchVal0").input;

    // We should have 2 address books here - one for the Personal Address
    // Book, and one for Collected Addresses.  The LDAP address book should
    // not be shown, since it isn't a local address book.
    Assert.equal(
      abList.itemCount,
      2,
      "Should have 2 address books in the filter menu list."
    );
    fec.close();
  }

  // Let's open the filter editor.
  const dialogPromise = promise_modal_dialog(
    "mailnews:filtereditor",
    filterEditorOpened
  );
  EventUtils.synthesizeMouseAtCenter(
    filterc.document.getElementById("newButton"),
    {},
    filterc
  );
  await dialogPromise;

  await BrowserTestUtils.closeWindow(filterc);
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

  const filterc = await create_simple_filter();

  const runButton = filterc.document.getElementById("runFiltersButton");
  runButton.setAttribute("label", runButton.getAttribute("stoplabel"));

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return false, so that we
  // cancel the quit.
  gMockPromptService.returnValue = false;
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  const promptState = gMockPromptService.promptState;
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

  const filterc = await wait_for_existing_window("mailnews:filterlist");

  // There should already be 1 filter defined from previous test.
  const filterCount = filterc.document.getElementById("filterList").itemCount;
  Assert.equal(filterCount, 1, "should have 1 filter from prev test");

  const runButton = filterc.document.getElementById("runFiltersButton");
  runButton.setAttribute("label", runButton.getAttribute("stoplabel"));

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Set the Mock Prompt Service to return true, so that we
  // allow the quit.
  gMockPromptService.returnValue = true;
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  const promptState = gMockPromptService.promptState;
  Assert.notEqual(null, promptState, "Expected a confirmEx prompt");

  Assert.equal("confirmEx", promptState.method);
  // Since we returned true on the confirmation dialog,
  // we should be allowing the quit - so cancelQuit.data
  // should now be false
  Assert.ok(!cancelQuit.data, "Cancelled the quit");

  // Unregister the Mock Prompt Service
  gMockPromptService.unregister();

  EventUtils.synthesizeMouseAtCenter(
    filterc.document.querySelector("#filterList richlistitem"),
    {},
    filterc
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
  EventUtils.synthesizeKey("KEY_Delete", {}, filterc);
  await deleteAlertPromise;

  Assert.equal(
    filterc.document.getElementById("filterList").itemCount,
    0,
    "Previously created filter should have been deleted."
  );

  await BrowserTestUtils.closeWindow(filterc);
});
