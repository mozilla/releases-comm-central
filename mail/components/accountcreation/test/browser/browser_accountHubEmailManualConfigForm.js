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
