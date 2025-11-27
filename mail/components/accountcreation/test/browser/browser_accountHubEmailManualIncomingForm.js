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
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailManualIncomingForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-manual-incoming-form"
  );
  EventUtils.synthesizeMouseAtCenter(subview, {}, browser.contentWindow);

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_switchBetweenIMAPAndEWS() {
  const config = new AccountConfig();
  config.incoming.type = "imap";
  subview.setState(config);

  const protocolSelector = subview.querySelector("#incomingProtocol");
  const ewsURLField = subview.querySelector("#incomingEwsUrl");
  const incomingAuthMethod = subview.querySelector("#incomingAuthMethod");
  const usernameField = subview.querySelector("#incomingUsername");

  Assert.equal(
    protocolSelector.value,
    "1",
    "IMAP should be the selected protocol"
  );
  Assert.ok(
    BrowserTestUtils.isHidden(ewsURLField),
    "Should not show EWS URL field"
  );
  Assert.equal(
    incomingAuthMethod.value,
    "0",
    "Should be on autodetect for auth method"
  );

  info("Set a username");
  let configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => usernameField.value == "test@example.com"
  );

  let focusEvent = BrowserTestUtils.waitForEvent(usernameField, "focus");
  EventUtils.synthesizeMouseAtCenter(usernameField, {}, browser.contentWindow);
  await focusEvent;

  info("Typing username...");
  EventUtils.sendString("test@example.com", browser.contentWindow);
  let { detail: configUpdatedEvent } = await configUpdatedEventPromise;

  Assert.ok(
    !configUpdatedEvent.completed,
    "Username should not complete config"
  );

  info("Switch to EWS");
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );
  protocolSelector.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(protocolSelector.menupopup, "shown");
  protocolSelector.menupopup.activateItem(
    protocolSelector.querySelector("#incomingProtocolEWS")
  );
  await BrowserTestUtils.waitForPopupEvent(
    protocolSelector.menupopup,
    "hidden"
  );
  ({ detail: configUpdatedEvent } = await configUpdatedEventPromise);

  Assert.ok(!configUpdatedEvent.completed, "Config should be incomplete");
  Assert.ok(
    BrowserTestUtils.isVisible(ewsURLField),
    "Should show EWS URL field"
  );
  Assert.equal(
    incomingAuthMethod.value,
    "3",
    "Should replace autodetect with cleartext auth"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(usernameField),
    "Username field should stay visible"
  );
  Assert.equal(
    usernameField.value,
    "test@example.com",
    "Username should carry over"
  );

  info("Focus EWS URL field");
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => ewsURLField.value == "https://example.com/"
  );
  focusEvent = BrowserTestUtils.waitForEvent(ewsURLField, "focus");
  EventUtils.synthesizeMouseAtCenter(ewsURLField, {}, browser.contentWindow);
  await focusEvent;
  EventUtils.sendString("https://example.com/", browser.contentWindow);
  ({ detail: configUpdatedEvent } = await configUpdatedEventPromise);

  Assert.ok(
    configUpdatedEvent.completed,
    "Should indicate that the form is complete"
  );

  info("Switch back to IMAP");
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );
  protocolSelector.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(protocolSelector.menupopup, "shown");
  protocolSelector.menupopup.activateItem(
    protocolSelector.querySelector("#incomingProtocolIMAP")
  );
  await BrowserTestUtils.waitForPopupEvent(
    protocolSelector.menupopup,
    "hidden"
  );
  ({ detail: configUpdatedEvent } = await configUpdatedEventPromise);

  Assert.ok(
    !configUpdatedEvent.completed,
    "Switching back to IMAP should make the config incomplete"
  );
  Assert.ok(
    BrowserTestUtils.isVisible(usernameField),
    "Username field should stay visible"
  );
  Assert.equal(
    usernameField.value,
    "test@example.com",
    "Username should carry over"
  );

  subview.resetState();
});

add_task(async function test_getEWSConfig() {
  const config = new AccountConfig();
  config.incoming.type = "ews";
  config.incoming.ewsURL = "https://example.com/";
  config.incoming.username = "test@example.com";
  config.incoming.auth = 3;

  const configuUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );
  subview.setState(config);
  const { detail: configUpdatedEvent } = await configuUpdatedEventPromise;

  Assert.ok(configUpdatedEvent.completed, "Should have a complete form");

  const state = subview.captureState();

  Assert.ok(!state.edited, "Should indicate that the config is unedited");
  Assert.equal(state.config.incoming.type, "ews", "Should be an EWS config");
  Assert.equal(
    state.config.incoming.ewsURL,
    "https://example.com/",
    "Should include EWS url"
  );

  subview.resetState();
});

add_task(async function test_settingStateLeavesConfigIntact() {
  const config = new AccountConfig();
  config.incoming.type = "imap";
  subview.setState(config);

  const protocolSelector = subview.querySelector("#incomingProtocol");

  Assert.equal(
    protocolSelector.value,
    "1",
    "IMAP should be the selected protocol"
  );

  info("Switch to EWS");
  const configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );
  protocolSelector.openMenu(true);
  await BrowserTestUtils.waitForPopupEvent(protocolSelector.menupopup, "shown");
  protocolSelector.menupopup.activateItem(
    protocolSelector.querySelector("#incomingProtocolEWS")
  );
  await BrowserTestUtils.waitForPopupEvent(
    protocolSelector.menupopup,
    "hidden"
  );
  const { detail: configUpdatedEvent } = await configUpdatedEventPromise;

  Assert.ok(!configUpdatedEvent.completed, "Config should be incomplete");

  const updatedConfig = subview.captureState();
  Assert.equal(
    updatedConfig.config.incoming.type,
    "ews",
    "Should have EWS in the new config"
  );
  Assert.equal(
    config.incoming.type,
    "imap",
    "Initial config should still be for IMAP"
  );

  subview.setState(config);

  Assert.equal(
    protocolSelector.value,
    "1",
    "Setting the state again should select IMAP again"
  );

  subview.resetState();
});
