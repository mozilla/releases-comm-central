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
  const state = createFilledAccountConfig();

  subview.setState(state);

  // The current state of the form should be updated.
  Assert.deepEqual(
    subview.captureState(),
    state,
    "The current state should have been updated"
  );

  // The form inputs should have the correct values.

  const incomingInputs = {
    type: "imap",
    hostname: subview.querySelector("#manualIncomingHostname").value,
    port: subview.querySelector("#manualIncomingPort").valueAsNumber,
    socketType: subview.querySelector("#manualIncomingConnectionSecurity")
      .value,
    auth: subview.querySelector("#manualIncomingAuthMethod").value,
    username: subview.querySelector("#manualIncomingUsername").value,
  };
  const outgoingInputs = {
    type: "smtp",
    hostname: subview.querySelector("#manualOutgoingHostname").value,
    port: subview.querySelector("#manualOutgoingPort").valueAsNumber,
    socketType: subview.querySelector("#manualOutgoingConnectionSecurity")
      .value,
    auth: subview.querySelector("#manualOutgoingAuthMethod").value,
    username: subview.querySelector("#manualOutgoingUsername").value,
  };

  Assert.deepEqual(
    state.incoming,
    incomingInputs,
    "The form incoming input values should be set correctly in setState"
  );

  Assert.deepEqual(
    state.outgoing,
    outgoingInputs,
    "The form outgoing input values should be set correctly in setState"
  );

  // The usernames are the same so the same username checkbox should be checked
  // and the outgoing username should be hidden.
  Assert.ok(
    subview.querySelector("#sameUsername").checked,
    "The same username checkbox should be checked"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(subview.querySelector("#manualOutgoingUsername")),
    "Outgoing username input should be hidden"
  );

  // If we change the outgoing username, setting the state should show the
  // outgoing username and the same username checkbox should not be checked.
  state.outgoing.username = "new username";
  subview.setState(state);
  Assert.ok(
    !subview.querySelector("#sameUsername").checked,
    "The same username checkbox should not be checked"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      subview.querySelector("#manualOutgoingUsername")
    ),
    "Outgoing username input should be visible"
  );

  subview.resetState();
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

  subview.resetState();
});

add_task(function test_resetState() {
  const state = createFilledAccountConfig();
  subview.setState(state);

  // The set state would check the checkbox, hide the outgoing username
  // and fill the form fields. Reset state should reset everything.

  subview.resetState();
  Assert.ok(
    !subview.querySelector("#sameUsername").checked,
    "The same username checkbox should not be checked"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(
      subview.querySelector("#manualOutgoingUsername")
    ),
    "Outgoing username input should be visible"
  );
  Assert.equal(
    subview.querySelector("#manualIncomingUsername").value,
    "",
    "The incoming username value should be empty"
  );
  Assert.ok(
    subview.querySelector("#manualOutgoingUsername").required,
    "Outgoing username input should be required"
  );
});

add_task(function test_setStateImapTitle() {
  const state = createFilledAccountConfig();
  subview.setState(state);

  Assert.equal(
    subview.getAttribute("title-id"),
    "account-hub-manual-config-imap-title",
    "IMAP config should set the correct title"
  );

  const title = subview.shadowRoot.querySelector("#title");
  Assert.equal(
    document.l10n.getAttributes(title).id,
    "account-hub-manual-config-imap-title",
    "Header title l10n id should match"
  );

  subview.resetState();
});

add_task(function test_setStateSetsPop3Title() {
  const state = createFilledAccountConfig();
  state.incoming.type = "pop3";
  subview.setState(state);

  Assert.equal(
    subview.getAttribute("title-id"),
    "account-hub-manual-config-pop3-title",
    "POP3 config should set the correct title"
  );

  const title = subview.shadowRoot.querySelector("#title");
  Assert.equal(
    document.l10n.getAttributes(title).id,
    "account-hub-manual-config-pop3-title",
    "Header title l10n id should match"
  );
  subview.resetState();
});

add_task(function test_setStateClearsTitleForUnknownIncomingType() {
  const state = new AccountConfig();
  state.incoming.type = "exchange";
  subview.setState(state);

  Assert.ok(
    !subview.hasAttribute("title-id"),
    "Unknown incoming type should clear the title-id attribute"
  );

  const title = subview.shadowRoot.querySelector("#title");
  Assert.equal(
    document.l10n.getAttributes(title).id,
    null,
    "Unknown incoming type should clear the header title l10n id"
  );
  subview.resetState();
});

add_task(async function test_captureStateUsesCurrentValues() {
  const state = createFilledAccountConfig();
  state.outgoing.username = "smtp-user";
  subview.setState(state);

  subview.querySelector("#manualIncomingHostname").value = "IMAP.EXAMPLE.COM";
  subview.querySelector("#manualIncomingUsername").value = "incoming-user";
  subview.querySelector("#manualIncomingPort").value = "993";
  subview.querySelector("#manualOutgoingHostname").value = "SMTP.EXAMPLE.COM";
  subview.querySelector("#manualOutgoingUsername").value = "outgoing-user";
  subview.querySelector("#manualOutgoingPort").value = "465";

  Assert.ok(await subview.validate(), "The edited config should be valid");

  const config = subview.captureState();
  Assert.equal(
    config.incoming.hostname,
    "imap.example.com",
    "Incoming hostname should be captured and sanitized"
  );
  Assert.equal(
    config.incoming.username,
    "incoming-user",
    "Incoming username should be captured"
  );
  Assert.equal(config.incoming.port, 993, "Incoming port should be captured");
  Assert.equal(
    config.outgoing.hostname,
    "smtp.example.com",
    "Outgoing hostname should be captured and sanitized"
  );
  Assert.equal(
    config.outgoing.username,
    "outgoing-user",
    "Outgoing username should be captured"
  );
  Assert.equal(config.outgoing.port, 465, "Outgoing port should be captured");

  subview.resetState();
});

add_task(async function test_validateShowsClickableErrorSummary() {
  const state = createFilledAccountConfig();
  subview.setState(state);

  const incomingHostname = subview.querySelector("#manualIncomingHostname");
  const incomingUsername = subview.querySelector("#manualIncomingUsername");
  const incomingPort = subview.querySelector("#manualIncomingPort");
  incomingHostname.value = "";
  incomingUsername.value = "";
  incomingPort.value = "0";

  Assert.ok(
    !(await subview.validate()),
    "The form should be invalid with missing incoming details"
  );

  const header =
    subview.shadowRoot.querySelector("account-hub-header").shadowRoot;
  const notification = header.querySelector("#emailFormNotification");
  Assert.ok(!notification.hidden, "The error notification should be visible");
  Assert.ok(notification.open, "The error notification should be expanded");
  Assert.equal(
    document.l10n.getAttributes(
      header.querySelector("#emailFormNotificationTitle .localized-title")
    ).id,
    "account-hub-manual-config-error-summary",
    "The error notification should use the manual config error title"
  );
  Assert.equal(
    header
      .querySelector("#emailFormNotificationSummary")
      .getAttribute("aria-describedby"),
    "emailFormNotificationText",
    "The alert summary should describe the error list"
  );

  const errorLinks = Array.from(
    header.querySelectorAll(".manual-config-error-list a")
  );
  Assert.deepEqual(
    errorLinks.map(link => link.textContent),
    ["Hostname", "Username", "Port"],
    "The error summary should list the invalid fields"
  );

  const hostnameInput = incomingHostname.querySelector("input");
  Assert.equal(
    hostnameInput.getAttribute("aria-invalid"),
    "true",
    "The invalid input should be marked invalid"
  );
  Assert.equal(
    hostnameInput.getAttribute("aria-describedby"),
    "manualIncomingHostnameInputErrorMessage",
    "The invalid input should be described by its error message"
  );

  errorLinks[0].click();
  await TestUtils.waitForCondition(
    () => browser.contentWindow.document.activeElement == hostnameInput,
    "The invalid field should be focused"
  );
  Assert.equal(
    browser.contentWindow.document.activeElement,
    hostnameInput,
    "Clicking the error summary link should focus the invalid field"
  );

  let configUpdatedCount = 0;
  const countConfigUpdated = () => {
    configUpdatedCount++;
  };
  subview.addEventListener("config-updated", countConfigUpdated);

  try {
    const errorSummary = header.querySelector(".manual-config-error-list");
    const configUpdated = BrowserTestUtils.waitForEvent(
      subview,
      "config-updated"
    );
    for (const value of ["bad_h", "bad_ho", "bad_host"]) {
      incomingHostname.value = value;
      incomingHostname.dispatchEvent(new Event("input", { bubbles: true }));
    }
    Assert.equal(
      configUpdatedCount,
      0,
      "Input should wait for the debounce before updating the config"
    );
    await configUpdated;
    Assert.equal(
      configUpdatedCount,
      1,
      "Multiple input events should be coalesced into one config update"
    );
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(resolve => setTimeout(resolve, 150));
    Assert.equal(
      configUpdatedCount,
      1,
      "No additional config updates should fire after the debounce settles"
    );
    Assert.equal(
      header.querySelector(".manual-config-error-list"),
      errorSummary,
      "The error summary should not be re-rendered when the invalid field list is unchanged"
    );
  } finally {
    subview.removeEventListener("config-updated", countConfigUpdated);
    subview.resetState();
  }
});


add_task(async function test_adjustSSLToPort() {
  const incomingPort = subview.querySelector("#manualIncomingPort");
  const incomingConnectionSecurity = subview.querySelector(
    "#manualIncomingConnectionSecurity"
  );
  const outgoingPort = subview.querySelector("#manualOutgoingPort");
  const outgoingConnectionSecurity = subview.querySelector(
    "#manualOutgoingConnectionSecurity"
  );

  const config = new AccountConfig();

  // IMAP Testing.
  config.incoming.type = "imap";
  subview.setState(config);

  Assert.notEqual(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.SSL,
    "Incoming socket should not be SSL when the state is set"
  );

  await fireInputEvent(incomingPort, "input", 993);
  Assert.equal(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.SSL,
    "Incoming socket should be SSL"
  );

  await fireInputEvent(incomingPort, "input", 143);
  Assert.equal(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    "Incoming socket be STARTTLS"
  );

  // POP3 Testing.
  config.incoming.type = "pop3";
  subview.setState(config);

  await fireInputEvent(incomingPort, "input", 995);
  Assert.equal(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.SSL,
    "Incoming socket should be SSL"
  );

  await fireInputEvent(incomingPort, "input", 110);
  Assert.equal(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    "Incoming socket should be STARTTLS"
  );

  // Outgoing testing.
  Assert.notEqual(
    incomingConnectionSecurity.value,
    Ci.nsMsgSocketType.SSL,
    "Outgoing socket should not be SSL when the state is set"
  );

  await fireInputEvent(outgoingPort, "input", 465);
  Assert.equal(
    outgoingConnectionSecurity.value,
    Ci.nsMsgSocketType.SSL,
    "Outgoing socket should be SSL"
  );

  await fireInputEvent(outgoingPort, "input", 587);
  Assert.equal(
    outgoingConnectionSecurity.value,
    Ci.nsMsgSocketType.alwaysSTARTTLS,
    "Outgoing socket should be STARTTLS"
  );

  subview.resetState();
});

add_task(async function test_adjustPortToSSLAndProtocol() {
  const incomingPort = subview.querySelector("#manualIncomingPort");
  const incomingConnectionSecurity = subview.querySelector(
    "#manualIncomingConnectionSecurity"
  );
  const outgoingPort = subview.querySelector("#manualOutgoingPort");
  const outgoingConnectionSecurity = subview.querySelector(
    "#manualOutgoingConnectionSecurity"
  );

  const config = new AccountConfig();
  config.incoming.type = "imap";
  subview.setState(config);

  await fireInputEvent(
    incomingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.SSL
  );
  Assert.equal(
    incomingPort.value,
    993,
    "Incoming port value should match SSL connection security"
  );

  await fireInputEvent(
    incomingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.alwaysSTARTTLS
  );
  Assert.equal(
    incomingPort.value,
    143,
    "Incoming port value should match STARTTLS connection security"
  );

  config.incoming.type = "pop3";
  subview.setState(config);

  await fireInputEvent(
    incomingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.SSL
  );
  Assert.equal(
    incomingPort.value,
    995,
    "Incoming port value should match SSL connection security"
  );

  await fireInputEvent(
    incomingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.alwaysSTARTTLS
  );
  Assert.equal(
    incomingPort.value,
    110,
    "Incoming port value should match STARTTLS connection security"
  );

  await fireInputEvent(
    outgoingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.SSL
  );
  Assert.equal(
    outgoingPort.value,
    465,
    "Outgoing port value should match SSL connection security"
  );

  await fireInputEvent(
    outgoingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.alwaysSTARTTLS
  );
  Assert.equal(
    outgoingPort.value,
    587,
    "Outgoing port value should match SSL connection security"
  );

  subview.resetState();
});

add_task(async function test_showPlainSecurityError() {
  const incomingConnectionSecurity = subview.querySelector(
    "#manualIncomingConnectionSecurity"
  );
  const outgoingConnectionSecurity = subview.querySelector(
    "#manualOutgoingConnectionSecurity"
  );

  const config = new AccountConfig();
  subview.setState(config);

  await fireInputEvent(
    incomingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.plain
  );

  await fireInputEvent(
    outgoingConnectionSecurity,
    "change",
    Ci.nsMsgSocketType.plain
  );

  Assert.ok(
    incomingConnectionSecurity.hasAttribute("warning"),
    "Incoming socket should have warning label"
  );
  Assert.ok(
    outgoingConnectionSecurity.hasAttribute("warning"),
    "Outgoing socket should have warning label"
  );

  subview.resetState();
});

/**
 * Sets value of input and fires event supplied in parameter.
 *
 * @param {HTMLInputElement} input - The input to be updated.
 * @param {string} eventName - Type of event to be fired.
 * @param {number} value - Value to be applied to input.
 */
async function fireInputEvent(input, eventName, value) {
  input.value = value;
  input.dispatchEvent(new Event(eventName, { bubbles: true }));

  // Timeout needed because there is a debounce on the config change
  // when typing.
  if (eventName === "input") {
    // eslint-disable-next-line mozilla/no-arbitrary-setTimeout
    await new Promise(r => setTimeout(r, 100));
  }
}

/**
 * Returns a filled imap AccountConfig object.
 *
 * @returns {AccountConfig}
 */
function createFilledAccountConfig() {
  const config = new AccountConfig();
  config.incoming = {
    type: "imap",
    hostname: "test.test",
    port: 143,
    socketType: Ci.nsMsgSocketType.plain,
    auth: Ci.nsMsgAuthMethod.OAuth2,
    username: "user",
  };
  config.outgoing = {
    type: "smtp",
    hostname: "test.test",
    port: 587,
    socketType: Ci.nsMsgSocketType.plain,
    auth: Ci.nsMsgAuthMethod.OAuth2,
    username: "user",
  };

  return config;
}
