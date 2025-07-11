/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let directoryName;
let hostname;
let port;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookLdapAccountForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "address-book-ldap-account-form"
  );

  directoryName = subview.querySelector("#name");
  hostname = subview.querySelector("#hostname");
  port = subview.querySelector("#port");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  directoryName.value = "content";
  subview.setState();

  Assert.equal(
    subview.ownerDocument.activeElement,
    directoryName,
    "Name input should be focused"
  );
  Assert.equal(directoryName.value, "", "Name input value should be cleared");
  Assert.ok(
    !subview.classList.contains("stacked"),
    "The subview should not have the stacked class"
  );

  subview.resetState();
});

add_task(function test_setStateWithFontSize() {
  Services.prefs.setIntPref("mail.uifontsize", 17);
  subview.setState();

  Assert.ok(
    subview.classList.contains("stacked"),
    "The subview should have the stacked class"
  );

  Services.prefs.clearUserPref("mail.uifontsize");
  subview.setState();
});

add_task(async function test_resetState() {
  directoryName.value = "content";
  const updateEvent = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => directoryName.value === ""
  );
  subview.resetState();
  const invalidUpdateEvent = await updateEvent;

  Assert.ok(
    !invalidUpdateEvent.detail.completed,
    "Event should indicate the form is incomplete"
  );
  Assert.equal(directoryName.value, "", "Name input value should be cleared");

  subview.resetState();
});

add_task(async function test_formUpdatedFromInput() {
  subview.setState();

  let updateEvent = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => directoryName.value === "test"
  );
  EventUtils.sendString("test", subview.ownerGlobal);
  let invalidUpdateEvent = await updateEvent;

  Assert.ok(
    !invalidUpdateEvent.detail.completed,
    "Event should indicate the form is incomplete"
  );
  Assert.equal(
    directoryName.ariaInvalid,
    "false",
    "Name should be valid with a value"
  );

  // Move to hostname input.
  EventUtils.synthesizeKey("KEY_Tab", {}, subview.ownerGlobal);
  updateEvent = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => hostname.value === "example.com"
  );
  EventUtils.sendString("example.com", subview.ownerGlobal);
  invalidUpdateEvent = await updateEvent;

  Assert.equal(
    hostname.ariaInvalid,
    "false",
    "Hostname should be valid with a value"
  );
  Assert.equal(
    directoryName.ariaInvalid,
    "false",
    "Name should still be valid"
  );
  Assert.ok(
    !invalidUpdateEvent.detail.completed,
    "Event should indicate the form is incomplete"
  );

  // Move to port input.
  EventUtils.synthesizeKey("KEY_Tab", {}, subview.ownerGlobal);
  updateEvent = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => port.value === "389"
  );
  EventUtils.sendString("389", subview.ownerGlobal);
  const validUpdateEvent = await updateEvent;

  Assert.equal(port.ariaInvalid, "false", "Port should be valid with a value");
  Assert.equal(
    directoryName.ariaInvalid,
    "false",
    "Name should still be valid"
  );
  Assert.equal(hostname.ariaInvalid, "false", "Hostname should still be valid");
  Assert.ok(
    validUpdateEvent.detail.completed,
    "Event should indicate the form is complete"
  );

  subview.resetState();
});

add_task(async function test_invalidHost() {
  subview.setState();
  directoryName.value = "Test";
  port.valueAsNumber = 389;

  // Move to hostname input.
  EventUtils.synthesizeKey("KEY_Tab", {}, subview.ownerGlobal);
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => hostname.value === "local@"
  );
  EventUtils.sendString("local@");
  const updatedEvent = await updated;

  Assert.ok(
    !updatedEvent.detail.completed,
    "Form shouldn't be complete with an invalid host"
  );
  Assert.equal(hostname.ariaInvalid, "true", "Hostname shouldn't be valid");

  subview.resetState();
});

add_task(async function test_invalidPort() {
  subview.setState();
  directoryName.value = "Test";
  hostname.value = "example.com";

  // Move to port input.
  EventUtils.synthesizeMouseAtCenter(port, {}, subview.ownerGlobal);
  port.focus();
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => port.value === "-1"
  );
  EventUtils.sendString("-1");
  const updatedEvent = await updated;

  Assert.ok(
    !updatedEvent.detail.completed,
    "Form shouldn't be complete with an invalid port"
  );
  Assert.equal(port.ariaInvalid, "true", "Port shouldn't be valid");

  subview.resetState();
});

add_task(async function test_showHideAdvancedConfig() {
  subview.setState();
  const formBody = subview.querySelector("#ldapFormBody");
  Assert.ok(
    !formBody.classList.contains("advanced"),
    "The form should be the simple form"
  );
  const advancedConfigButton = subview.querySelector(
    "#advancedConfigurationLdap"
  );
  const simpleConfigButton = subview.querySelector("#simpleConfigurationLdap");

  EventUtils.synthesizeMouseAtCenter(
    advancedConfigButton,
    {},
    subview.ownerGlobal
  );
  await BrowserTestUtils.waitForMutationCondition(
    formBody,
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => formBody.classList.contains("advanced")
  );

  Assert.ok(
    BrowserTestUtils.isHidden(advancedConfigButton),
    "Advanced config button should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(simpleConfigButton),
    "Simple config button should be visible"
  );
  Assert.ok(
    formBody.classList.contains("advanced"),
    "The form should be the advanced form"
  );

  const advancedInputs = subview.querySelectorAll(".advanced-input");
  for (const input of advancedInputs) {
    Assert.ok(
      BrowserTestUtils.isVisible(input),
      `Advanced input ${input.querySelector("label").dataset.l10nId} should be visible`
    );
  }

  simpleConfigButton.scrollIntoView({
    behavior: "instant",
  });

  while (BrowserTestUtils.isHidden(advancedConfigButton)) {
    info("Trying to scroll simple button into view");
    EventUtils.synthesizeMouseAtCenter(
      simpleConfigButton,
      {},
      subview.ownerGlobal
    );
    subview.scrollBy({
      top: 900,
      behavior: "instant",
    });
    await TestUtils.waitForTick();
  }

  for (const input of advancedInputs) {
    Assert.ok(
      BrowserTestUtils.isHidden(input),
      `Advanced input ${input.querySelector("label").dataset.l10nId} should be hidden`
    );
  }

  subview.resetState();
});

add_task(async function test_maxResultsValidity() {
  subview.setState();
  directoryName.value = "Test";
  hostname.value = "example.com";
  port.valueAsNumber = 389;
  const advancedConfigButton = subview.querySelector(
    "#advancedConfigurationLdap"
  );
  const simpleConfigButton = subview.querySelector("#simpleConfigurationLdap");

  EventUtils.synthesizeMouseAtCenter(
    advancedConfigButton,
    {},
    subview.ownerGlobal
  );
  await BrowserTestUtils.waitForMutationCondition(
    subview.querySelector("#ldapFormBody"),
    {
      attributes: true,
      attributeFilter: ["class"],
    },
    () => subview.querySelector("#ldapFormBody").classList.contains("advanced")
  );
  Assert.ok(
    BrowserTestUtils.isHidden(advancedConfigButton),
    "Advanced config button should be hidden"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(simpleConfigButton),
    "Simple config button should be visible"
  );

  const maxResults = subview.querySelector("#maxResults");

  // Move to max results input.
  EventUtils.synthesizeMouseAtCenter(maxResults, {}, subview.ownerGlobal);

  let updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => maxResults.value === "-1"
  );
  EventUtils.sendString("-1");
  let updatedEvent = await updated;

  Assert.ok(
    !updatedEvent.detail.completed,
    "Form shouldn't be complete with an invalid maxResults"
  );
  Assert.equal(
    maxResults.ariaInvalid,
    "true",
    "Max results shouldn't be valid"
  );

  maxResults.value = "";

  updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => maxResults.value === "1"
  );
  EventUtils.sendString("1");
  updatedEvent = await updated;

  Assert.ok(updatedEvent.detail.completed, "Form should be complete");
  Assert.equal(maxResults.ariaInvalid, "false", "Max results should be valid");

  subview.resetState();
});
