/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

const tabmail = document.getElementById("tabmail");
let browser;
let subview;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailManualConfigForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-manual-config-form"
  );
  EventUtils.synthesizeMouseAtCenter(subview, {}, browser.contentWindow);

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  const state = new AccountConfig();

  subview.setState(state);

  // The current state of the form should be updated.
  Assert.deepEqual(
    subview.captureState(),
    state,
    "The current state should have been updated"
  );
});

add_task(async function test_showHideOutgoingUsername() {
  const sameUsernameCheckbox = subview.querySelector("#sameUsername");
  const outgoingUsername = subview.querySelector("#manualOutgoingUsername");
  sameUsernameCheckbox.scrollIntoView({ block: "start", behavior: "instant" });

  Assert.ok(
    BrowserTestUtils.isVisible(outgoingUsername),
    "The outgoing username should be visible"
  );

  // The outgoing username should be hidden and not required if the checkbox is
  // checked.
  let changeEvent = BrowserTestUtils.waitForEvent(
    sameUsernameCheckbox,
    "change"
  );
  let hiddenPromise = BrowserTestUtils.waitForAttribute(
    "hidden",
    outgoingUsername
  );
  EventUtils.synthesizeMouseAtCenter(
    sameUsernameCheckbox.querySelector("input"),
    {},
    browser.contentWindow
  );
  await changeEvent;
  await hiddenPromise;

  Assert.ok(
    BrowserTestUtils.isHidden(outgoingUsername),
    "The outgoing username should be hidden"
  );
  Assert.ok(
    !outgoingUsername.required,
    "The outgoing username should not longer be required"
  );

  // The outgoing username should be visible and required if the checkbox isn't
  // checked.
  changeEvent = BrowserTestUtils.waitForEvent(sameUsernameCheckbox, "change");
  hiddenPromise = BrowserTestUtils.waitForAttributeRemoval(
    "hidden",
    outgoingUsername
  );
  EventUtils.synthesizeMouseAtCenter(
    sameUsernameCheckbox.querySelector("input"),
    {},
    browser.contentWindow
  );
  await changeEvent;
  await hiddenPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(outgoingUsername),
    "The outgoing username should be visible"
  );
  Assert.ok(
    outgoingUsername.required,
    "The outgoing username should be required"
  );
});
