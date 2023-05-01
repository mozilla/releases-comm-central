/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the image insertion dialog functionality.
 */

"use strict";

var { close_compose_window, open_compose_new_mail } = ChromeUtils.import(
  "resource://testing-common/mozmill/ComposeHelpers.jsm"
);
var { input_value } = ChromeUtils.import(
  "resource://testing-common/mozmill/KeyboardHelpers.jsm"
);

var {
  click_menus_in_sequence,
  plan_for_modal_dialog,
  wait_for_window_close,
  wait_for_modal_dialog,
} = ChromeUtils.import("resource://testing-common/mozmill/WindowHelpers.jsm");

add_task(async function test_image_insertion_dialog_persist() {
  let cwc = open_compose_new_mail();

  // First focus on the editor element
  cwc.window.document.getElementById("messageEditor").focus();

  // Now open the image window
  plan_for_modal_dialog("Mail:image", async function insert_image(mwc) {
    // Insert the url of the image.
    let srcloc = mwc.window.document.getElementById("srcInput");
    srcloc.focus();

    let file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
    input_value(mwc, Services.io.newFileURI(file).spec);

    // Don't add alternate text
    let noAlt = mwc.window.document.getElementById("noAltTextRadio");
    EventUtils.synthesizeMouseAtCenter(noAlt, {}, noAlt.ownerGlobal);
    await new Promise(resolve => setTimeout(resolve));
    mwc.window.document.documentElement.querySelector("dialog").acceptDialog();
  });

  let insertMenu = cwc.window.document.getElementById("InsertPopupButton");
  let insertMenuPopup = cwc.window.document.getElementById("InsertPopup");

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);

  wait_for_modal_dialog();
  wait_for_window_close();
  await new Promise(resolve => setTimeout(resolve));

  let img = cwc.window.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("img");
  Assert.ok(!!img, "editor should contain an image");

  info("Will check that radio option persists");

  // Check that the radio option persists
  plan_for_modal_dialog("Mail:image", async function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "We should persist the previously selected value"
    );
    // We change to "use alt text"
    let altTextRadio = mwc.window.document.getElementById("altTextRadio");
    EventUtils.synthesizeMouseAtCenter(
      altTextRadio,
      {},
      altTextRadio.ownerGlobal
    );
    await new Promise(resolve => setTimeout(resolve));
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);
  wait_for_modal_dialog();
  wait_for_window_close();
  await new Promise(resolve => setTimeout(resolve));

  info("Will check that radio option really persists");

  // Check that the radio option still persists (be really sure)
  plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("altTextRadio").selected,
      "We should persist the previously selected value"
    );
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);
  wait_for_modal_dialog();
  wait_for_window_close();

  info("Will check we switch to 'no alt text'");

  // Get the inserted image, double-click it, make sure we switch to "no alt
  // text", despite the persisted value being "use alt text"
  plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "We shouldn't use the persisted value because the insert image has no alt text"
    );
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  wait_for_modal_dialog();
  wait_for_window_close();

  info("Will check using alt text");

  // Now use some alt text for the edit image dialog
  plan_for_modal_dialog("Mail:image", async function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "That value should persist still..."
    );
    let altTextRadio = mwc.window.document.getElementById("altTextRadio");
    EventUtils.synthesizeMouseAtCenter(
      altTextRadio,
      {},
      altTextRadio.ownerGlobal
    );

    let srcloc = mwc.window.document.getElementById("altTextInput");
    srcloc.focus();
    input_value(mwc, "some alt text");
    await new Promise(resolve => setTimeout(resolve));
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").acceptDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  wait_for_modal_dialog();
  wait_for_window_close();

  info("Will check next time we edit, we still have 'use alt text' selected");

  // Make sure next time we edit it, we still have "use alt text" selected.
  img = cwc.window.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("img");
  plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("altTextRadio").selected,
      "We edited the image to make it have alt text, we should keep it selected"
    );
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  wait_for_modal_dialog();
  wait_for_window_close();

  close_compose_window(cwc);
});
