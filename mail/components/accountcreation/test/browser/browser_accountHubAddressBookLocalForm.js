/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let subView;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookLocalForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  subView = tab.browser.contentWindow.document.querySelector(
    "address-book-local-form"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_localNameIcons() {
  Assert.ok(
    BrowserTestUtils.isVisible(subView),
    "The local subview should be visible"
  );

  const success = subView.querySelector("#nameSuccess");
  const warning = subView.querySelector("#nameWarning");
  const message = subView.querySelector("#nameErrorMessage");

  Assert.ok(
    BrowserTestUtils.isHidden(success),
    "The success icon should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(warning),
    "The warning icon should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(message),
    "The error message should be hidden"
  );

  const input = subView.querySelector("#addressBookName");
  input.focus();

  EventUtils.sendString("test");

  Assert.ok(
    BrowserTestUtils.isVisible(success),
    "The success icon should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(warning),
    "The warning icon should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(message),
    "The error message should be hidden"
  );

  input.select();

  EventUtils.sendKey("back_space", input.ownerGlobal);

  input.blur();

  Assert.ok(
    BrowserTestUtils.isHidden(success),
    "The success icon should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(warning),
    "The warning icon should be visible"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(message),
    "The error message should be visible"
  );
});

add_task(async function test_captureState() {
  const input = subView.querySelector("#addressBookName");
  input.focus();

  EventUtils.sendString("test");

  let state = subView.captureState();

  Assert.deepEqual(
    state,
    { name: "test" },
    "captureState should reflect current data"
  );

  input.select();

  EventUtils.sendKey("back_space", input.ownerGlobal);

  state = subView.captureState();

  Assert.deepEqual(
    state,
    { name: "" },
    "captureState should reflect current data"
  );
});
