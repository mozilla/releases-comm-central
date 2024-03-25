/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the image insertion dialog functionality.
 */

"use strict";

var { close_compose_window, open_compose_new_mail } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/ComposeHelpers.sys.mjs"
  );
var { input_value } = ChromeUtils.importESModule(
  "resource://testing-common/mail/KeyboardHelpers.sys.mjs"
);

var { click_menus_in_sequence, promise_modal_dialog } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );

add_task(async function test_image_insertion_dialog_persist() {
  const cwc = await open_compose_new_mail();

  // First focus on the editor element
  cwc.document.getElementById("messageEditor").focus();

  // Now open the image window
  let dialogPromise = promise_modal_dialog("Mail:image", async function (mwc) {
    // Insert the url of the image.
    const srcloc = mwc.document.getElementById("srcInput");
    srcloc.focus();

    const file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
    input_value(mwc, Services.io.newFileURI(file).spec);

    // Don't add alternate text
    const noAlt = mwc.document.getElementById("noAltTextRadio");
    EventUtils.synthesizeMouseAtCenter(noAlt, {}, noAlt.ownerGlobal);
    await new Promise(resolve => setTimeout(resolve));
    mwc.document.documentElement.querySelector("dialog").acceptDialog();
  });

  const insertMenu = cwc.document.getElementById("InsertPopupButton");
  const insertMenuPopup = cwc.document.getElementById("InsertPopup");

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);

  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  let img = cwc.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("img");
  Assert.ok(!!img, "editor should contain an image");

  info("Will check that radio option persists");

  // Check that the radio option persists
  dialogPromise = promise_modal_dialog("Mail:image", async function (mwc) {
    Assert.ok(
      mwc.document.getElementById("noAltTextRadio").selected,
      "We should persist the previously selected value"
    );
    // We change to "use alt text"
    const altTextRadio = mwc.document.getElementById("altTextRadio");
    EventUtils.synthesizeMouseAtCenter(
      altTextRadio,
      {},
      altTextRadio.ownerGlobal
    );
    await new Promise(resolve => setTimeout(resolve));
    mwc.document.documentElement.querySelector("dialog").cancelDialog();
  });

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);
  await dialogPromise;
  await new Promise(resolve => setTimeout(resolve));

  info("Will check that radio option really persists");

  // Check that the radio option still persists (be really sure)
  dialogPromise = promise_modal_dialog("Mail:image", function (mwc) {
    Assert.ok(
      mwc.document.getElementById("altTextRadio").selected,
      "We should persist the previously selected value"
    );
    // Accept the dialog
    mwc.document.documentElement.querySelector("dialog").cancelDialog();
  });

  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);
  await dialogPromise;

  info("Will check we switch to 'no alt text'");

  // Get the inserted image, double-click it, make sure we switch to "no alt
  // text", despite the persisted value being "use alt text"
  dialogPromise = promise_modal_dialog("Mail:image", function (mwc) {
    Assert.ok(
      mwc.document.getElementById("noAltTextRadio").selected,
      "We shouldn't use the persisted value because the insert image has no alt text"
    );
    mwc.document.documentElement.querySelector("dialog").cancelDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  await dialogPromise;

  info("Will check using alt text");

  // Now use some alt text for the edit image dialog
  dialogPromise = promise_modal_dialog("Mail:image", async function (mwc) {
    Assert.ok(
      mwc.document.getElementById("noAltTextRadio").selected,
      "That value should persist still..."
    );
    const altTextRadio = mwc.document.getElementById("altTextRadio");
    EventUtils.synthesizeMouseAtCenter(
      altTextRadio,
      {},
      altTextRadio.ownerGlobal
    );

    const srcloc = mwc.document.getElementById("altTextInput");
    srcloc.focus();
    input_value(mwc, "some alt text");
    await new Promise(resolve => setTimeout(resolve));
    // Accept the dialog
    mwc.document.documentElement.querySelector("dialog").acceptDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  await dialogPromise;

  info("Will check next time we edit, we still have 'use alt text' selected");

  // Make sure next time we edit it, we still have "use alt text" selected.
  img = cwc.document
    .getElementById("messageEditor")
    .contentDocument.querySelector("img");
  dialogPromise = promise_modal_dialog("Mail:image", function (mwc) {
    Assert.ok(
      mwc.document.getElementById("altTextRadio").selected,
      "We edited the image to make it have alt text, we should keep it selected"
    );
    // Accept the dialog
    mwc.document.documentElement.querySelector("dialog").cancelDialog();
  });
  EventUtils.synthesizeMouseAtCenter(img, { clickCount: 2 }, img.ownerGlobal);
  await dialogPromise;

  await close_compose_window(cwc);
});
