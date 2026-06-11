/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let customElement, browser, input, label;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubInput.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  customElement =
    tab.browser.contentWindow.document.querySelector("account-hub-input");
  input = customElement.querySelector("input");
  label = customElement.querySelector("label");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_correctlyAppliesL10nAttributes() {
  const errorMessageElement = customElement.querySelector("span");
  Assert.equal(
    document.l10n.getAttributes(label).id,
    customElement.getAttribute("l10n-label-id"),
    "Should display correct text in label"
  );

  Assert.deepEqual(
    input.ariaLabelledByElements,
    [label],
    "The input should have the label element as it's aria-label"
  );

  Assert.equal(
    document.l10n.getAttributes(errorMessageElement).id,
    "account-hub-hostname-error-text",
    "Should apply correct fluent ID to error message element"
  );
});

add_task(function test_idsCorrectlyAppliedToElements() {
  Assert.equal(
    input.id,
    "incomingHostnameInput",
    "Should add correct id to input element"
  );
  Assert.equal(
    label.htmlFor,
    input.id,
    "Should add for attribute to label element"
  );
  Assert.equal(
    customElement.querySelector("span").id,
    `${input.id}ErrorMessage`,
    "Should add correct ID to error message element"
  );
});

add_task(function test_inputAttributes() {
  Assert.equal(
    customElement.getAttribute("type"),
    input.type,
    "Input element type should match custom element type"
  );
  Assert.equal(
    customElement.getAttribute("classes"),
    input.className,
    "Input element class should match custom element classes attribute"
  );
  Assert.equal(
    customElement.getAttribute("placeholder"),
    input.placeholder,
    "Input element placeholder should match custom element placeholder attribute"
  );
});

add_task(function test_setGetValue() {
  Assert.equal(
    customElement.value,
    input.value,
    "Custom element value should match input value"
  );

  customElement.value = "abc1243";

  Assert.equal(
    customElement.value,
    input.value,
    "Custom element value should match input value"
  );

  input.value = "1234abc";

  Assert.equal(
    customElement.value,
    input.value,
    "Custom element value should match input value"
  );
});

add_task(function test_setErrorState() {
  customElement.setErrorState("error");

  Assert.equal(
    input.ariaInvalid,
    "true",
    "The input should have aria-invalid set as true"
  );

  const errorMessage = customElement.querySelector(`#${input.id}ErrorMessage`);

  Assert.deepEqual(
    input.ariaDescribedByElements,
    [errorMessage],
    "The input should have the error message element set for aria-describedby"
  );

  Assert.equal(
    errorMessage.role,
    "alert",
    "The error message should have the alert role set"
  );

  customElement.setErrorState("");

  Assert.equal(
    input.ariaInvalid,
    "false",
    "The input should have aria-invalid set as false"
  );

  Assert.deepEqual(
    input.ariaDescribedByElements,
    [],
    "The input should not have any elements set for aria-describedby"
  );

  Assert.ok(
    !errorMessage.role,
    "The error message should not have role attribute"
  );
});
