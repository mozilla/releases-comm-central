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
var wh = ChromeUtils.import(
  "resource://testing-common/mozmill/WindowHelpers.jsm"
);

add_task(function test_image_insertion_dialog_persist() {
  let cwc = open_compose_new_mail();

  // First focus on the editor element
  cwc.e("content-frame").focus();

  // Now open the image window
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    // Insert the url of the image.
    let srcloc = mwc.window.document.getElementById("srcInput");
    srcloc.focus();

    let file = new FileUtils.File(getTestFilePath("data/tb-logo.png"));
    input_value(mwc, Services.io.newFileURI(file).spec);
    mwc.sleep(0);

    // Don't add alternate text
    mwc.click(mwc.e("noAltTextRadio"));

    mwc.window.document.documentElement.querySelector("dialog").acceptDialog();
  });
  cwc.click(cwc.e("insertImage"));
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();

  // Check that the radio option persists
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "We should persist the previously selected value"
    );
    // We change to "use alt text"
    mwc.click(mwc.e("altTextRadio"));
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  cwc.click(cwc.e("insertImage"));
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();

  // Check that the radio option still persists (be really sure)
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("altTextRadio").selected,
      "We should persist the previously selected value"
    );
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  cwc.click(cwc.e("insertImage"));
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();
  cwc.sleep(1000);

  // Get the inserted image, double-click it, make sure we switch to "no alt
  // text", despite the persisted value being "use alt text"
  let img = cwc.e("content-frame").contentDocument.querySelector("img");
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "We shouldn't use the persisted value because the insert image has no alt text"
    );
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  cwc.doubleClick(img);
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();
  // It's not clear why we have to wait here to avoid test failures,
  // see bug 1246094.
  cwc.sleep(1000);

  // Now use some alt text for the edit image dialog
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("noAltTextRadio").selected,
      "That value should persist still..."
    );
    mwc.click(mwc.e("altTextRadio"));

    let srcloc = mwc.window.document.getElementById("altTextInput");
    srcloc.focus();
    input_value(mwc, "some alt text");
    mwc.sleep(0);
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").acceptDialog();
  });
  cwc.doubleClick(img);
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();
  // It's not clear why we have to wait here to avoid test failures,
  // see bug 1246094.
  cwc.sleep(1000);

  // Make sure next time we edit it, we still have "use alt text" selected.
  img = cwc.e("content-frame").contentDocument.querySelector("img");
  wh.plan_for_modal_dialog("Mail:image", function insert_image(mwc) {
    Assert.ok(
      mwc.window.document.getElementById("altTextRadio").selected,
      "We edited the image to make it have alt text, we should keep it selected"
    );
    // Accept the dialog
    mwc.window.document.documentElement.querySelector("dialog").cancelDialog();
  });
  cwc.doubleClick(img);
  wh.wait_for_modal_dialog();
  wh.wait_for_window_close();

  close_compose_window(cwc);
});
