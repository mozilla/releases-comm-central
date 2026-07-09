/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let checkElement,
  toggleElement,
  browser,
  checkInput,
  checkLabel,
  toggleElelment;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubCheckbox.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  checkElement =
    tab.browser.contentWindow.document.querySelector("#checkCheckbox");
  checkInput = checkElement.querySelector("input");
  checkLabel = checkElement.querySelector("label");
  toggleElement =
    tab.browser.contentWindow.document.querySelector("#toggleCheckbox");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_correctlyAppliesL10nAttributes() {
  Assert.equal(
    document.l10n.getAttributes(checkLabel).id,
    checkElement.getAttribute("l10n-label-id"),
    "Should display correct text in label"
  );

  Assert.deepEqual(
    checkInput.ariaLabelledByElements,
    [checkLabel],
    "The input should have the label element as it's aria-label"
  );
});

add_task(function test_idsCorrectlyAppliedToElements() {
  Assert.equal(
    checkInput.id,
    "checkCheckboxInput",
    "Should add correct id to input element"
  );
  Assert.equal(
    checkLabel.htmlFor,
    checkInput.id,
    "Should add for attribute to label element"
  );
});

add_task(function test_setGetValue() {
  Assert.ok(checkInput.checked, "Checked attribute should check the input");
  Assert.equal(
    checkElement.checked,
    checkInput.checked,
    "Check element checked should match input checked"
  );

  checkElement.checked = true;

  Assert.equal(
    checkElement.checked,
    checkInput.checked,
    "Check element checked should match input checked"
  );
});

add_task(function test_toggleClasses() {
  Assert.equal(
    toggleElement.getAttribute("checkbox-type"),
    "toggle",
    "The checkbox type should be toggle"
  );

  Assert.equal(
    toggleElement.querySelector("div").className,
    "toggle-group",
    "The checkbox div wrapper should have the correct class"
  );

  Assert.ok(
    toggleElement.querySelector("input").classList.contains("toggle-checkbox"),
    "The toggle checkbox input should have the correct class"
  );
  Assert.ok(
    !toggleElement.querySelector("input").classList.contains("check-button"),
    "The toggle checkbox input should not contain the check button class"
  );

  Assert.ok(
    toggleElement.querySelector("label").classList.contains("toggle-label"),
    "The toggle checkbox input label should have the correct class"
  );
  Assert.ok(
    !toggleElement.querySelector("label").classList.contains("checkbox-label"),
    "The toggle checkbox label should not be a label for a check button"
  );
});

add_task(function test_checkboxClasses() {
  Assert.equal(
    checkElement.getAttribute("checkbox-type"),
    "check",
    "The checkbox type should be check"
  );

  Assert.equal(
    checkElement.querySelector("div").className,
    "checkbox-group",
    "The checkbox div wrapper should have the correct class"
  );

  Assert.ok(
    checkInput.classList.contains("check-button"),
    "The checkbox input should have the correct class"
  );
  Assert.ok(
    !checkInput.classList.contains("toggle-checkbox"),
    "The checkbox input should not contain the toggle class"
  );

  Assert.ok(
    checkLabel.classList.contains("checkbox-label"),
    "The checkbox input label should have the correct class"
  );
  Assert.ok(
    !checkLabel.classList.contains("toggle-label"),
    "The checkbox label should not be a label for a toggle button"
  );
});

add_task(function test_ariaControlsElements() {
  const divElement = browser.contentWindow.document.querySelector("#testDiv");
  checkElement.setAriaControlsElements(divElement);

  Assert.deepEqual(
    checkInput.ariaControlsElements,
    [divElement],
    "The check input should have have aria controls over div element"
  );

  checkElement.setAriaExpanded(true);
  Assert.equal(
    checkInput.ariaExpanded,
    "true",
    "The check input should be expanded"
  );

  checkElement.setAriaExpanded(false);
  Assert.equal(
    checkInput.ariaExpanded,
    "false",
    "The check input should be collapsed"
  );
});
