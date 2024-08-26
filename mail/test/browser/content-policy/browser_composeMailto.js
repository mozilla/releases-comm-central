/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { close_compose_window, compose_window_ready } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ComposeHelpers.sys.mjs"
);
var { open_content_tab_with_url } = ChromeUtils.importESModule(
  "resource://testing-common/mail/ContentTabHelpers.sys.mjs"
);
var { input_value } = ChromeUtils.importESModule(
  "resource://testing-common/mail/KeyboardHelpers.sys.mjs"
);
var { click_menus_in_sequence, promise_modal_dialog, promise_new_window } =
  ChromeUtils.importESModule(
    "resource://testing-common/mail/WindowHelpers.sys.mjs"
  );

var gCwc;
var gNewTab;
var gPreCount;

var url =
  "http://mochi.test:8888/browser/comm/mail/test/browser/content-policy/html/";

add_task(async function test_openComposeFromMailToLink() {
  const tabmail = document.getElementById("tabmail");
  // Open a content tab with the mailto link in it.
  // To open a tab we're going to have to cheat and use tabmail so we can load
  // in the data of what we want.
  gPreCount = tabmail.tabContainer.allTabs.length;
  gNewTab = await open_content_tab_with_url(url + "mailtolink.html");

  const composePromise = promise_new_window("msgcompose");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#mailtolink",
    {},
    gNewTab.browser
  );
  const cwc = await compose_window_ready(composePromise);
  await close_compose_window(cwc);
});

add_task(async function test_openComposeFromMailToLinkWithMarkup() {
  const composePromise = promise_new_window("msgcompose");
  await BrowserTestUtils.synthesizeMouseAtCenter(
    "#mailtolink_strong",
    {},
    gNewTab.browser
  );
  gCwc = await compose_window_ready(composePromise);
});

add_task(async function test_checkInsertImage() {
  // First focus on the editor element
  gCwc.document.getElementById("messageEditor").focus();

  // Now open the image window
  const dialogPromise = promise_modal_dialog(
    "Mail:image",
    async function (mwc) {
      // Insert the url of the image.
      const srcloc = mwc.document.getElementById("srcInput");
      srcloc.focus();

      input_value(mwc, url + "pass.png");
      await new Promise(resolve => setTimeout(resolve));

      const noAlt = mwc.document.getElementById("noAltTextRadio");
      // Don't add alternate text
      EventUtils.synthesizeMouseAtCenter(noAlt, {}, noAlt.ownerGlobal);

      // Accept the dialog
      mwc.document.querySelector("dialog").acceptDialog();
    }
  );

  const insertMenu = gCwc.document.getElementById("InsertPopupButton");
  const insertMenuPopup = gCwc.document.getElementById("InsertPopup");
  EventUtils.synthesizeMouseAtCenter(insertMenu, {}, insertMenu.ownerGlobal);
  await click_menus_in_sequence(insertMenuPopup, [{ id: "InsertImageItem" }]);
  await dialogPromise;

  // Test that the image load has not been denied
  const childImages = gCwc.document
    .getElementById("messageEditor")
    .contentDocument.getElementsByTagName("img");

  Assert.equal(childImages.length, 1, "Should be one image in the document");

  await TestUtils.waitForCondition(() => childImages[0].complete);

  // Should be the only image, so just check the first.
  Assert.ok(
    childImages[0].naturalHeight > 0,
    "Loading of image (naturalHeight) in a compose window should work"
  );
  Assert.ok(
    childImages[0].naturalWidth > 0,
    "Loading of image (naturalWidth) in a compose window should work"
  );
});

add_task(async function test_closeComposeWindowAndTab() {
  await close_compose_window(gCwc);
  const tabmail = document.getElementById("tabmail");

  tabmail.closeTab(gNewTab);

  if (tabmail.tabContainer.allTabs.length != gPreCount) {
    throw new Error("The content tab didn't close");
  }

  Assert.report(
    false,
    undefined,
    undefined,
    "Test ran to completion successfully"
  );
});
