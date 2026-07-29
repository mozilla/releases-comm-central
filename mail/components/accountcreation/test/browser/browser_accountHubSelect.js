/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let select, browser;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubSelect.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
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

  select.toggleAttribute("warning", false);
});

add_task(async function test_helpText() {
  const helpText = select.shadowRoot.querySelector(
    ".account-hub-form-small-comment"
  );

  select.setAttribute("help-text-class", "config-change-comment");
  select.setHelpText("account-hub-manual-config-security-changed", {
    oldValue: "SSL/TLS",
    newValue: "STARTTLS",
  });

  Assert.ok(BrowserTestUtils.isVisible(helpText), "Help text should be shown");
  Assert.ok(
    helpText.classList.contains("config-change-comment"),
    "Should apply the custom help text class"
  );
  Assert.deepEqual(
    document.l10n.getAttributes(helpText),
    {
      id: "account-hub-manual-config-security-changed",
      args: {
        oldValue: "SSL/TLS",
        newValue: "STARTTLS",
      },
    },
    "Should apply the help text l10n ID and args"
  );
  Assert.equal(
    select.select.getAttribute("aria-describedby"),
    helpText.id,
    "The select should be described by the help text"
  );
  Assert.equal(
    select.getOptionLabel("2"),
    "Two",
    "Should return an option label for a value"
  );

  select.clearHelpText();
  select.removeAttribute("help-text-class");

  Assert.ok(BrowserTestUtils.isHidden(helpText), "Help text should be hidden");
  Assert.ok(
    !select.select.hasAttribute("aria-describedby"),
    "The select should not be described by hidden help text"
  );
});

add_task(async function test_reflectsDisabled() {
  Assert.ok(!select.disabled, "Select should not be initially disabled");

  select.disabled = true;

  Assert.ok(select.disabled, "Select should be disabled");
});

add_task(async function test_mutatingOptionAttribute() {
  let popupPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  await EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  let popup = await popupPromise;

  const hiddenOption = select.shadowRoot.querySelector("#hiddenOption");

  Assert.ok(
    BrowserTestUtils.isHidden(hiddenOption),
    "Option with hidden attribute should be hidden"
  );

  popup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
  await SimpleTest.promiseFocus(browser.contentWindow);

  // Update option to be visible, which should make the option in the
  // custom select element visible.
  select.querySelector("#hiddenOption").hidden = false;
  await BrowserTestUtils.waitForAttributeRemoval("hidden", hiddenOption);

  popupPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  await EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  popup = await popupPromise;

  Assert.ok(
    BrowserTestUtils.isVisible(hiddenOption),
    "Option that had hidden attribute removed should be visible"
  );

  popup.hidePopup();
  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
});
