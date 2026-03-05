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
var { be_in_folder, create_folder } = ChromeUtils.importESModule(
  "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs"
);
var { make_message_sets_in_folders } = ChromeUtils.importESModule(
  "resource://testing-common/mail/MessageInjectionHelpers.sys.mjs"
);
var { NNTP_PORT, setupLocalServer, setupNNTPDaemon } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/NNTPHelpers.sys.mjs"
  );
var { click_menus_in_sequence, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
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
 * new filter toolbarbutton and it's dropdown work correctly.
 */
add_task(async function key_navigation_test() {
  const filterc = await openFiltersDialogs();

  const filterWinDoc = filterc.document;
  const BUTTONS_SELECTOR = `toolbarbutton:not([disabled],[is="toolbarbutton-menu-button"]),dropmarker, button:not([hidden])`;
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

        let dialogPromise = BrowserTestUtils.promiseAlertDialog(
          null,
          "chrome://messenger/content/FilterEditor.xhtml",
          {
            callback: openEmptyDialog,
          }
        );
        EventUtils.synthesizeKey("KEY_Enter", {}, filterc);
        await dialogPromise;

        dialogPromise = dialogPromise = BrowserTestUtils.promiseAlertDialog(
          null,
          "chrome://messenger/content/FilterEditor.xhtml",
          {
            callback: openEmptyDialog,
          }
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
        await new Promise(resolve => filterc.requestAnimationFrame(resolve));

        EventUtils.synthesizeKey("KEY_Enter", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "shown");
        Assert.ok(true, `Enter opened #${menupopupNewFilter.id}`);
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "hidden");
        Assert.ok(true, `Esc closed #${menupopupNewFilter.id}`);

        await new Promise(resolve => filterc.requestAnimationFrame(resolve));

        // Simulate Space keypress.
        EventUtils.synthesizeKey(" ", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "shown");
        Assert.ok(true, `Space opened #${menupopupNewFilter.id}`);
        EventUtils.synthesizeKey("KEY_Escape", {}, filterc);
        await BrowserTestUtils.waitForPopupEvent(menupopupNewFilter, "hidden");
        Assert.ok(true, `Esc closed #${menupopupNewFilter.id}`);
        Assert.equal(
          filterWinDoc.activeElement.id,
          button.id,
          "The correct btn should be focused after closing the menupopup"
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
  await SimpleTest.promiseFocus(filterc);

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

  async function fill_in_filter_fields(fec) {
    const filterName = fec.document.getElementById("filterName");
    filterName.value = "A Simple Filter";
    fec.document.getElementById("searchAttr0").value = Ci.nsMsgSearchAttrib.To;
    fec.document.getElementById("searchOp0").value = Ci.nsMsgSearchOp.Is;
    const searchVal = fec.document.getElementById("searchVal0").input;
    searchVal.setAttribute("value", "test@foo.invalid");

    const filterActions = fec.document.getElementById("filterActionList");
    const firstAction = filterActions.getItemAtIndex(0);
    firstAction.setAttribute("value", "markasflagged");

    // Test that pressing Enter adds another search row and does not close
    // the dialog. Remove the second row afterwards.
    EventUtils.synthesizeMouseAtCenter(searchVal, {}, fec);
    EventUtils.synthesizeKey("KEY_Enter", {}, fec);
    await new Promise(resolve => requestIdleCallback(resolve));
    EventUtils.synthesizeMouseAtCenter(
      fec.document
        .getElementById("searchRow1")
        .getElementsByClassName("small-button")[1],
      {},
      fec
    );

    fec.document.querySelector("dialog").acceptDialog();
  }

  // Let's open the filter editor.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/FilterEditor.xhtml",
    {
      callback: fill_in_filter_fields,
    }
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
  const dialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/FilterEditor.xhtml",
    {
      callback: filterEditorOpened,
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    filterc.document.getElementById("newButton"),
    {},
    filterc
  );
  await dialogPromise;

  await BrowserTestUtils.closeWindow(filterc);
});

/**
 * Tests that elements can be added to the list of custom headers.
 *
 * This test is a bit complex and involves a bunch of callbacks, so here's a
 * summary of what it does:
 *
 *  - it opens the message filters dialog,
 *  - then it opens the filter editor dialog by clicking on the "New" button
 *  - while the filter editor dialog is open, `filter_editor_callback` is run
 *  - `filter_editor_callback` opens the custom headers dialog by selecting the
 *    relevant option in the search attributes drop-down
 *  - while the custom headers dialog is open, `custom_headers_callback` is run
 *  - `custom_headers_callback` tests that it can add a new header to the list
 *    in that dialog
 *  - then the dialogs are closed one after the other, and everyone's happy
 */
add_task(async function test_custom_headers_can_be_added() {
  const customHeaderName = "X-Foo";

  const filtersDialog = await openFiltersDialogs();

  /**
   * The callback run when opening the custom headers dialog.
   *
   * @param {window} win - The window object for the custom headers dialog.
   */
  async function custom_headers_callback(win) {
    info("Opening custom headers dialog");

    // Make sure the window has loaded and has focus.
    await SimpleTest.promiseFocus(win);

    // Write the header's name in the input field. The "Add" button has some
    // logic that relies on input events being sent to enable/disable it, so
    // it's better to simulate the user typing the name rather than setting the
    // `value` attribute directly.
    const input = win.document.getElementById("headerInput");
    EventUtils.synthesizeMouseAtCenter(input, {}, win);
    for (const c of customHeaderName) {
      await BrowserTestUtils.synthesizeKey(c, {}, win.browsingContext);
    }

    // After we click on the "Add" button, the custom headers list (which is
    // currently empty) shouldn't be empty anymore.
    const listPromise = TestUtils.waitForCondition(() => {
      const headers = win.document
        .getElementById("headerList")
        .getElementsByTagName("richlistitem");
      return headers.length != 0;
    }, "the header list should not stay empty");

    const button = win.document.getElementById("addButton");
    EventUtils.synthesizeMouseAtCenter(button, {}, win);
    await listPromise;

    // Check the new length and content of the list.
    const headers = win.document
      .getElementById("headerList")
      .getElementsByTagName("richlistitem");

    Assert.equal(headers.length, 1, "the header list should have 1 item");

    const headerLabel = headers[0].getElementsByTagName("label")[0];

    Assert.equal(
      headerLabel.getAttribute("value"),
      customHeaderName,
      "the custom header should have the correct name"
    );

    info("Closing custom headers dialog");
    win.close();
  }

  /**
   * The callback run when opening the filter editor dialog.
   *
   * @param {window} win - The window object for the filter editor dialog.
   */
  async function filter_editor_callback(win) {
    info("Opening filter editor dialog");

    // Make sure the window has loaded and has focus.
    await SimpleTest.promiseFocus(win);

    const menu = win.document
      .getElementById("searchAttr0")
      .getElementsByTagName("menulist")[0];

    EventUtils.synthesizeMouseAtCenter(menu, {}, win);
    await BrowserTestUtils.waitForPopupEvent(menu, "shown");

    const customizeOption = win.document.querySelector(
      `#searchAttr0 menuitem[value="${Ci.nsMsgSearchAttrib.OtherHeader}"]`
    );

    // The custom headers dialog opens upon clicking the "Customize" option in
    // the search attributes drop-down.
    const customHeadersDialogPromise = BrowserTestUtils.promiseAlertDialog(
      null,
      "chrome://messenger/content/CustomHeaders.xhtml",
      {
        callback: custom_headers_callback,
      }
    );
    EventUtils.synthesizeMouseAtCenter(customizeOption, {}, win);
    await customHeadersDialogPromise;

    // Ensure the window is in focus, otherwise we won't be able to close it.
    await SimpleTest.promiseFocus(win);

    info("Closing filter editor dialog");
    win.close();
  }

  // Open the filter editor.
  const filterEditorDialogPromise = BrowserTestUtils.promiseAlertDialog(
    null,
    "chrome://messenger/content/FilterEditor.xhtml",
    {
      callback: filter_editor_callback,
    }
  );
  EventUtils.synthesizeMouseAtCenter(
    filtersDialog.document.getElementById("newButton"),
    {},
    filtersDialog
  );
  await filterEditorDialogPromise;

  await BrowserTestUtils.closeWindow(filtersDialog);
});

/**
 * Test that if the user has started running a filter, and the
 * "quit-application-requested" notification is fired, the user
 * is given a dialog asking whether or not to quit.
 *
 * This also tests whether or not cancelling quit works.
 */
add_task(async function test_can_cancel_quit_on_filter_changes() {
  const filterWin = await create_simple_filter();

  filterWin.gRunningFilters = true; // simulate running

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Prevent the quit. Confusingly, the accept button is labelled Stop.
  const stopPromise = BrowserTestUtils.promiseAlertDialog("accept");
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  await stopPromise;

  // Since we returned false on the confirmation dialog,
  // we should be cancelling the quit - so cancelQuit.data
  // should now be true
  Assert.ok(cancelQuit.data, "Didn't cancel the quit");
  filterWin.gRunningFilters = false; // reset
});

/**
 * Test that if the user has started running a filter, and the
 * "quit-application-requested" notification is fired, the user
 * is given a dialog asking whether or not to quit.
 *
 * This also tests whether or not allowing quit works.
 */
add_task(async function test_can_quit_on_filter_changes() {
  const filterWin = Services.wm.getMostRecentWindow("mailnews:filterlist");

  // There should already be 1 filter defined from previous test.
  const filterCount = filterWin.document.getElementById("filterList").itemCount;
  Assert.equal(filterCount, 1, "should have 1 filter from prev test");

  filterWin.gRunningFilters = true; // simulate running

  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );

  // Allow the quit. The cancel button is labelled Continue.
  const continuePromise = BrowserTestUtils.promiseAlertDialog("cancel");
  // Trigger the quit-application-request notification
  Services.obs.notifyObservers(cancelQuit, "quit-application-requested");
  await continuePromise;

  // Since we returned true on the confirmation dialog,
  // we should be allowing the quit - so cancelQuit.data
  // should now be false
  Assert.ok(!cancelQuit.data, "Cancelled the quit");

  EventUtils.synthesizeMouseAtCenter(
    filterWin.document.querySelector("#filterList richlistitem"),
    {},
    filterWin
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
  EventUtils.synthesizeKey("KEY_Delete", {}, filterWin);
  await deleteAlertPromise;

  Assert.equal(
    filterWin.document.getElementById("filterList").itemCount,
    0,
    "Previously created filter should have been deleted."
  );

  await BrowserTestUtils.closeWindow(filterWin);
});
