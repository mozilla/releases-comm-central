/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the various selection interaction with the recipient pills.
 */

"use strict";

var { close_compose_window, open_compose_new_mail, setup_msg_contents } =
  ChromeUtils.importESModule(
    "resource://testing-common/mozmill/ComposeHelpers.sys.mjs"
  );
var { close_popup } = ChromeUtils.importESModule(
  "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs"
);

var modifiers =
  AppConstants.platform == "macosx" ? { accelKey: true } : { ctrlKey: true };

/**
 * Test the correct pill selection behavior to properly handle multi selection
 * and accidental deselection when interacting with other elements.
 */
add_task(async function test_pill_selection() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.org, test@invalid.foo, test@tinderborx.invalid, alice@foo.test",
    "Testing recipient pills selection!",
    "Testing testing testing! "
  );

  const cDoc = cwc.document;
  const recipientsContainer = cDoc.getElementById("recipientsContainer");
  const allPills = recipientsContainer.getAllPills();

  Assert.equal(allPills.length, 4, "Pills correctly created");

  // Click on the To input field to move the focus there.
  EventUtils.synthesizeMouseAtCenter(
    cDoc.getElementById("toAddrInput"),
    {},
    cwc
  );
  // Ctrl/Cmd+a should select all pills.
  EventUtils.synthesizeKey("a", modifiers, cwc);
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    allPills.length,
    "All pills currently selected"
  );

  // Right click on the last pill to open the context menu.
  const pill3 = allPills[3];
  const contextMenu = cDoc.getElementById("emailAddressPillPopup");
  const popupPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(
    pill3,
    { type: "contextmenu" },
    pill3.ownerGlobal
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
    cwc
  );
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    0,
    "All pills currently deselected"
  );

  const popupPromise2 = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );

  const pill0 = allPills[0];
  // Right click on the first pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    pill0,
    { type: "contextmenu" },
    pill0.ownerGlobal
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
  EventUtils.synthesizeMouseAtCenter(allPills[0], {}, cwc);
  Assert.ok(allPills[0].isEditing, "The pill is in edit mode");

  // Click on the input field, the pills should all be deselected.
  EventUtils.synthesizeMouseAtCenter(
    cDoc.getElementById("toAddrInput"),
    {},
    cwc
  );

  // Click on the first pill to select it.
  EventUtils.synthesizeMouseAtCenter(allPills[0], {}, cwc);
  // Ctrl/Cmd+Click ont he second pill to add it to the selection.
  EventUtils.synthesizeMouseAtCenter(allPills[1], modifiers, cwc);
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    2,
    "Two pills currently selected"
  );

  const popupPromise3 = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );

  const pill2 = allPills[2];
  // Right click on the thirds pill, which should be selected, to select it
  // while opening the context menu and deselecting the other two pills.
  EventUtils.synthesizeMouseAtCenter(
    pill2,
    { type: "contextmenu" },
    pill2.ownerGlobal
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

  await close_compose_window(cwc);
});

/**
 * Test the correct behavior of the pill context menu items to edit, remove, and
 * move the currently selected pills.
 */
add_task(async function test_pill_context_menu() {
  const cwc = await open_compose_new_mail();
  await setup_msg_contents(
    cwc,
    "test@example.org, test@invalid.foo, test@tinderborx.invalid, alice@foo.test",
    "Testing recipient pills context menu!",
    "Testing testing testing! "
  );

  const cDoc = cwc.document;
  const recipientsContainer = cDoc.getElementById("recipientsContainer");
  const allPills = recipientsContainer.getAllPills();

  Assert.equal(allPills.length, 4, "Pills correctly created");

  const contextMenu = cDoc.getElementById("emailAddressPillPopup");
  const popupPromise = BrowserTestUtils.waitForEvent(contextMenu, "popupshown");

  // Right click on the first pill to open the context menu.
  const pill = allPills[0];
  EventUtils.synthesizeMouseAtCenter(
    pill,
    { type: "contextmenu" },
    pill.ownerGlobal
  );
  await popupPromise;
  // The selection should not have changed.
  Assert.equal(
    recipientsContainer.getAllSelectedPills().length,
    1,
    "The first pill was selected"
  );

  const pillMoved = BrowserTestUtils.waitForCondition(
    () =>
      cDoc.querySelectorAll("#ccAddrContainer mail-address-pill").length == 1,
    "Timeout waiting for the pill to be moved to the Cc field"
  );

  const movePillCc = contextMenu.querySelector("#moveAddressPillCc");
  // Move the pill to the Cc field.
  if (AppConstants.platform == "macosx") {
    // We need to use click() since the synthesizeMouseAtCenter doesn't work for
    // context menu items on macos.
    movePillCc.click();
  } else {
    EventUtils.synthesizeMouseAtCenter(movePillCc, {}, movePillCc.ownerGlobal);
  }
  await pillMoved;

  close_popup(cwc, contextMenu);

  const ccContainer = cDoc.getElementById("ccAddrContainer");
  const ccPill = ccContainer.querySelector("mail-address-pill");

  // Assert the pill was moved to the Cc filed and it's still selected.
  Assert.equal(
    ccPill.fullAddress,
    allPills[0].fullAddress,
    "The first pill was moved to the Cc field"
  );
  Assert.ok(ccPill.hasAttribute("selected"), "The pill is selected");

  const popupPromise2 = BrowserTestUtils.waitForEvent(
    contextMenu,
    "popupshown"
  );

  // Right click on the same pill to open the context menu.
  EventUtils.synthesizeMouseAtCenter(
    ccPill,
    { type: "contextmenu" },
    ccPill.ownerGlobal
  );
  await popupPromise2;

  const pillMoved2 = BrowserTestUtils.waitForCondition(
    () =>
      cDoc.querySelectorAll("#bccAddrContainer mail-address-pill").length == 1,
    "Timeout waiting for the pill to be moved to the Bcc field"
  );

  // Move the pill to the Bcc field.
  const moveAdd = contextMenu.querySelector("#moveAddressPillBcc");
  if (AppConstants.platform == "macosx") {
    // We need to use click() since the synthesizeMouseAtCenter doesn't work for
    // context menu items on macos.
    moveAdd.click();
  } else {
    EventUtils.synthesizeMouseAtCenter(moveAdd, {}, moveAdd.ownerGlobal);
  }
  await pillMoved2;

  close_popup(cwc, contextMenu);

  const bccContainer = cDoc.getElementById("bccAddrContainer");
  const bccPill = bccContainer.querySelector("mail-address-pill");

  // Assert the pill was moved to the Cc filed and it's still selected.
  Assert.equal(
    bccPill.fullAddress,
    allPills[0].fullAddress,
    "The first pill was moved to the Bcc field"
  );
  Assert.ok(bccPill.hasAttribute("selected"), "The pill is selected");

  await close_compose_window(cwc);
});
