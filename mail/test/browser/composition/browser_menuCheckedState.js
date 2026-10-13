/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that compose menu items show the current state as check marks.
 */

"use strict";

var { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );

add_setup(async function () {
  // Write new messages from the default identity, whatever ran before.
  const about3Pane = document.getElementById("tabmail").currentAbout3Pane;
  about3Pane.displayFolder(
    MailServices.accounts.defaultAccount.incomingServer.rootFolder
  );
});

add_task(async function testSaveAsItems() {
  const cwc = await open_compose_new_mail();
  const doc = cwc.document;
  const savePopup = doc.getElementById("button-savePopup");
  const saveDropmarker = doc
    .getElementById("button-save")
    .querySelector(".toolbarbutton-menubutton-dropmarker");

  EventUtils.synthesizeMouseAtCenter(saveDropmarker, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(savePopup, "shown");
  Assert.deepEqual(
    Array.from(savePopup.querySelectorAll("menuitem[checked]"), item =>
      item.getAttribute("command")
    ),
    ["cmd_saveAsDraft"],
    "only Draft should be checked in the Save button menu for a new message"
  );
  savePopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(savePopup, "hidden");

  const fileMenu = doc.getElementById("menu_File");
  const saveAsMenu = doc.getElementById("menu_SaveAsCmd");
  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  saveAsMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(saveAsMenu.menupopup, "shown");
  Assert.deepEqual(
    Array.from(
      saveAsMenu.menupopup.querySelectorAll("menuitem[checked]"),
      item => item.getAttribute("command")
    ),
    ["cmd_saveAsDraft"],
    "only Draft should be checked in File > Save As for a new message"
  );
  fileMenu.menupopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await close_compose_window(cwc);
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function testCustomizeFromCancelled() {
  await SpecialPowers.pushPrefEnv({
    set: [["mail.compose.warned_about_customize_from", false]],
  });
  const cwc = await open_compose_new_mail();
  const doc = cwc.document;
  const optionsMenu = doc.getElementById("optionsMenu");
  const item = optionsMenu.menupopup.querySelector(
    `:scope > menuitem[command="cmd_customizeFromAddress"]`
  );

  // Choose Customize From Address, but cancel the warning.
  const dialogPromise = BrowserTestUtils.promiseAlertDialog("cancel");
  EventUtils.synthesizeMouseAtCenter(optionsMenu, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(optionsMenu.menupopup, "shown");
  optionsMenu.menupopup.activateItem(item);
  await BrowserTestUtils.waitForPopupEvent(optionsMenu.menupopup, "hidden");
  await dialogPromise;

  EventUtils.synthesizeMouseAtCenter(optionsMenu, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(optionsMenu.menupopup, "shown");
  Assert.ok(
    !item.hasAttribute("checked"),
    "Customize From Address should stay unchecked when the warning is cancelled"
  );
  optionsMenu.menupopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(optionsMenu.menupopup, "hidden");

  await close_compose_window(cwc);
  await SpecialPowers.popPrefEnv();
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.

add_task(async function testAttachVCard() {
  const identity = MailServices.accounts.defaultAccount.defaultIdentity;
  identity.escapedVCard = encodeURIComponent(
    "BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Tinderbox\r\nEND:VCARD\r\n"
  );
  identity.attachVCard = true;
  registerCleanupFunction(() => {
    identity.escapedVCard = "";
    identity.attachVCard = false;
  });

  const cwc = await open_compose_new_mail();
  const doc = cwc.document;
  const attachPopup = doc.getElementById("button-attachPopup");
  const attachDropmarker = doc
    .getElementById("button-attach")
    .querySelector(".toolbarbutton-menubutton-dropmarker");

  EventUtils.synthesizeMouseAtCenter(attachDropmarker, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(attachPopup, "shown");
  const vCardItem = doc.getElementById("button-attachPopup_attachVCardItem");
  Assert.ok(
    vCardItem.hasAttribute("checked"),
    "Personal vCard should be checked in the Attach button menu when the identity attaches it"
  );
  attachPopup.activateItem(vCardItem);
  await BrowserTestUtils.waitForPopupEvent(attachPopup, "hidden");

  const fileMenu = doc.getElementById("menu_File");
  const attachMenu = doc.getElementById("menu_Attach");
  EventUtils.synthesizeMouseAtCenter(fileMenu, {}, cwc);
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "shown");
  attachMenu.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(attachMenu.menupopup, "shown");
  Assert.ok(
    !attachMenu.menupopup
      .querySelector(`:scope > menuitem[command="cmd_attachVCard"]`)
      .hasAttribute("checked"),
    "Personal vCard should be unchecked in File > Attach after turning it off in the Attach button menu"
  );
  fileMenu.menupopup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(fileMenu.menupopup, "hidden");

  await close_compose_window(cwc);
}).skip(AppConstants.platform == "macosx"); // Can't click menu bar on Mac.
