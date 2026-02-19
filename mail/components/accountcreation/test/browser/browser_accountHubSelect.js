/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let select;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubSelect.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  select =
    tab.browser.contentWindow.document.querySelector("account-hub-select");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_correctlyAppliesL10nAttributes() {
  Assert.equal(
    select.label.innerText,
    "Connection security",
    "Should display correct text in label"
  );
  Assert.equal(
    select.select.getAttribute("aria-label"),
    "Connection security",
    "Should display correct text in aria-label"
  );
  Assert.equal(
    select.shadowRoot.querySelector("#securityWarning").innerText,
    "Warning: Insecure mail server detected. This server lacks encryption, exposing your password and data. Contact your administrator to secure the connection or proceed at your own risk. See FAQ for more.",
    "Should show insert correct error text"
  );
});

add_task(async function test_idIsCorrectlyAppliedToElements() {
  Assert.equal(
    select.select.id,
    "testSelectSelect",
    "Should add correct id to select element"
  );
  Assert.equal(
    select.label.getAttribute("for"),
    "testSelectSelect",
    "Should add for attribute to label element"
  );
});

add_task(async function test_correctlyHandlesValue() {
  Assert.equal(
    select.value,
    select.select.value,
    "should return same value as inner select"
  );
  Assert.equal(select.select.value, "2", "should have correct initial value");
  Assert.equal(select.value, "2", "should return correct value");

  select.value = "1";

  Assert.equal(
    select.value,
    select.select.value,
    "should return same value as inner select after update"
  );
  Assert.equal(select.value, "1", "should return correct value after update");

  select.select.value = "2";

  Assert.equal(
    select.value,
    select.select.value,
    "should return same value as inner select after inner update"
  );
  Assert.equal(
    select.value,
    "2",
    "should return correct value after inner update"
  );
});

add_task(async function test_correctlyHandlesWarning() {
  const warning = select.shadowRoot.querySelector("#securityWarning");
  Assert.ok(
    BrowserTestUtils.isHidden(warning),
    "Warning element should be hidden"
  );

  select.toggleAttribute("warning", true);

  Assert.ok(
    BrowserTestUtils.isVisible(warning),
    "Warning element should be hidden"
  );
});

add_task(async function test_reflectsDisabled() {
  Assert.ok(!select.disabled, "Select should not be initially disabled");

  select.disabled = true;

  Assert.ok(select.disabled, "Select should be disabled");
});
