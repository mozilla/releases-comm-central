/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the various selection interaction with the recipient pills.
 */

"use strict";

var {
  close_compose_window,
  open_compose_new_mail,
  setup_msg_contents,
} = ChromeUtils.import("resource://testing-common/mozmill/ComposeHelpers.jsm");
var { close_popup } = ChromeUtils.import(
  "resource://testing-common/mozmill/FolderDisplayHelpers.jsm"
);
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

var modifiers =
  AppConstants.platform == "macosx" ? { accelKey: true } : { ctrlKey: true };

/**
 * Test the correct pill selection behavior to properly handle multi selection
 * and accidental deselection when interacting with other elements.
 */
add_task(async function test_pill_selection() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org, test@invalid.foo, test@tinderborx.invalid, alice@foo.test",
    "Testing recipient pills selection!",
    "Testing testing testing! "
  );

  let cDoc = cwc.window.document;
  let recipientsContainer = cDoc.getElementById("recipientsContainer");
  let allPills = recipientsContainer.getAllPills();

  Assert.equal(allPills.length, 4, "Pills correctly created");

  // Click on the To input field to move the focus there.
  EventUtils.synthesizeMouseAtCenter(
    cDoc.getElementById("toAddrInput"),
    {},
    cwc.window
  );
  // Ctrl/Cmd+a should select all pills.
  EventUtils.synthesizeKey("a", modifiers, cwc.window);
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    allPills.length,
    "All pills currently selected"
  );

  let contextMenu = cDoc.getElementById("emailAddressPillPopup");
  let popupPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the last pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    allPills[3],
    { type: "contextmenu" },
    cwc.window
  );
  await popupPromise;
  // The selection should not have changed.
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    allPills.length,
    "All pills currently selected"
  );
  close_popup(cwc, contextMenu);

  // Click on the input field, the pills should all be deselected.
  EventUtils.synthesizeMouseAtCenter(
    cDoc.getElementById("toAddrInput"),
    {},
    cwc.window
  );
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    0,
    "All pills currently deselected"
  );

  let popupPromise2 = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the first pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    allPills[0],
    { type: "contextmenu" },
    cwc.window
  );
  await popupPromise2;

  // The first pill should be selected.
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    1,
    "One pill currently selected"
  );
  Assert.equal(
    recipientsContainer.getAllSelectedPills()[0],
    allPills[0],
    "The first pill was selected"
  );
  close_popup(cwc, contextMenu);

  // Click on the first pill, which should be selected, to trigger edit mode.
  EventUtils.synthesizeMouseAtCenter(allPills[0], {}, cwc.window);
  Assert.ok(allPills[0].isEditing, "The pill is in edit mode");

  // Click on the input field, the pills should all be deselected.
  EventUtils.synthesizeMouseAtCenter(
    cDoc.getElementById("toAddrInput"),
    {},
    cwc.window
  );

  // Click on the first pill to select it.
  EventUtils.synthesizeMouseAtCenter(allPills[0], {}, cwc.window);
  // Ctrl/Cmd+Click ont he second pill to add it to the selection.
  EventUtils.synthesizeMouseAtCenter(allPills[1], modifiers, cwc.window);
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    2,
    "Two pills currently selected"
  );

  let popupPromise3 = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the thirds pill, which should be selected, to select it
  // while opening the context menu and deselecting the other two pills.
  EventUtils.synthesizeMouseAtCenter(
    allPills[2],
    { type: "contextmenu" },
    cwc.window
  );
  await popupPromise3;

  // Only one pills should be selected
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    1,
    "One pill currently selected"
  );
  Assert.equal(
    recipientsContainer.getAllSelectedPills()[0],
    allPills[2],
    "The third pill was selected"
  );
  close_popup(cwc, contextMenu);

  close_compose_window(cwc);
});

/**
 * Test the correct behavior of the pill context menu items to edit, remove, and
 * move the currently selected pills.
 */
add_task(async function test_pill_context_menu() {
  let cwc = open_compose_new_mail();
  setup_msg_contents(
    cwc,
    "test@example.org, test@invalid.foo, test@tinderborx.invalid, alice@foo.test",
    "Testing recipient pills context menu!",
    "Testing testing testing! "
  );

  let cDoc = cwc.window.document;
  let recipientsContainer = cDoc.getElementById("recipientsContainer");
  let allPills = recipientsContainer.getAllPills();

  Assert.equal(allPills.length, 4, "Pills correctly created");

  let contextMenu = cDoc.getElementById("emailAddressPillPopup");
  let popupPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the first pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    allPills[0],
    { type: "contextmenu" },
    cwc.window
  );
  await popupPromise;
  // The selection should not have changed.
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    1,
    "The first pill was selected"
  );

  let pillMoved = BrowserTestUtils.waitForCondition(
    () =>
      cDoc.querySelectorAll("#ccAddrContainer mail-address-pill").length == 1,
    "Timeout waiting for the pill to be moved to the Cc field"
  );

  // Move the pill to the Cc field.
  // We need to use click() since the synthesizeMouseAtCenter doesn't work for
  // context menu items on macos.
  cwc.click(contextMenu.querySelector("#moveAddressPillCc"));
  await pillMoved;

  close_popup(cwc, contextMenu);

  let ccContainer = cDoc.getElementById("ccAddrContainer");
  let ccPill = ccContainer.querySelector("mail-address-pill");

  // Assert the pill was moved to the Cc filed and it's still selected.
  Assert.equal(
    ccPill.fullAddress,
    allPills[0].fullAddress,
    "The first pill was moved to the Cc field"
  );
  Assert.ok(ccPill.hasAttribute("selected"), "The pill is selected");

  let popupPromise2 = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the same pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    ccPill,
    { type: "contextmenu" },
    cwc.window
  );
  await popupPromise2;

  let pillMoved2 = BrowserTestUtils.waitForCondition(
    () =>
      cDoc.querySelectorAll("#bccAddrContainer mail-address-pill").length == 1,
    "Timeout waiting for the pill to be moved to the Bcc field"
  );

  // Move the pill to the Bcc field.
  cwc.click(contextMenu.querySelector("#moveAddressPillBcc"));
  await pillMoved2;

  close_popup(cwc, contextMenu);

  let bccContainer = cDoc.getElementById("bccAddrContainer");
  let bccPill = bccContainer.querySelector("mail-address-pill");

  // Assert the pill was moved to the Cc filed and it's still selected.
  Assert.equal(
    bccPill.fullAddress,
    allPills[0].fullAddress,
    "The first pill was moved to the Bcc field"
  );
  Assert.ok(bccPill.hasAttribute("selected"), "The pill is selected");

  close_compose_window(cwc);
});
