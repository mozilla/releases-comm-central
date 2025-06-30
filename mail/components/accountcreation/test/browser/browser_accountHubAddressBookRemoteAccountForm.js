/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let username;
let server;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubAddressBookRemoteAccountForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "address-book-remote-account-form"
  );
  username = subview.querySelector("#username");
  server = subview.querySelector("#davServer");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_captureEmptyState() {
  Assert.deepEqual(
    subview.captureState(),
    { username: "", server: "" },
    "Should get an empty state by default"
  );
  Assert.equal(
    username.ariaInvalid,
    "true",
    "Username should be invalid with empty fields"
  );
  Assert.equal(
    server.ariaInvalid,
    "true",
    "Server should be invalid without value"
  );
  Assert.ok(
    server.required,
    "Should need a server when we can't guess from username"
  );
});

add_task(function test_setState() {
  username.value = "content";
  subview.setState();
  Assert.equal(
    subview.ownerDocument.activeElement,
    username,
    "Username input should be focused"
  );
  Assert.equal(username.value, "", "Should clear any residual state");
  Assert.deepEqual(
    subview.captureState(),
    { username: "", server: "" },
    "Should get an empty state"
  );
});

add_task(async function test_captureStateAndReset() {
  subview.setState();
  const updatedInvalid = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => username.value === "test"
  );
  EventUtils.sendString("test", subview.ownerGlobal);
  const invalidUpdateEvent = await updatedInvalid;

  Assert.ok(
    !invalidUpdateEvent.detail.completed,
    "Event should indicate the form is incomplete"
  );
  Assert.equal(
    username.ariaInvalid,
    "false",
    "Username should be valid with a value"
  );
  Assert.ok(server.required, "Server should still be required");

  EventUtils.synthesizeKey("KEY_Tab", {}, subview.ownerGlobal);
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => server.value === "https://example.com"
  );
  EventUtils.sendString("https://example.com", subview.ownerGlobal);
  const updateEvent = await updated;

  Assert.ok(updateEvent.detail.completed, "Should have a valid config update");
  Assert.deepEqual(
    subview.captureState(),
    {
      username: "test",
      server: "https://example.com",
    },
    "Should get the entered data in the captured state"
  );
  Assert.equal(username.ariaInvalid, "false", "Username should still be valid");
  Assert.equal(server.ariaInvalid, "false", "Server should be valid now");
  Assert.ok(server.required, "Server should be required");

  subview.resetState();
});

add_task(async function test_resetState() {
  const emptyConfig = {
    username: "",
    server: "",
  };

  server.value = "https://example.com";
  subview.setState();
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => username.value === "foo"
  );
  EventUtils.sendString("foo", subview.ownerGlobal);
  await updated;

  Assert.notDeepEqual(
    subview.captureState(),
    emptyConfig,
    "Should have something in the config"
  );

  subview.resetState();

  Assert.deepEqual(
    subview.captureState(),
    emptyConfig,
    "Reset should clear out the state"
  );
  Assert.equal(username.value, "", "Reset should clear username input");
  Assert.equal(
    username.ariaInvalid,
    "true",
    "Username should be invalid after clear"
  );
  Assert.equal(server.value, "", "Reset should clear server input");
  Assert.equal(
    server.ariaInvalid,
    "true",
    "Server should be invalid after clear"
  );
  Assert.ok(server.required, "Server should be required after clear");
});

add_task(async function test_captureStateWithHostGuessing() {
  subview.setState();
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => username.value === "test@example.com"
  );

  EventUtils.sendString("test@example.com");
  const updatedEvent = await updated;

  Assert.ok(
    updatedEvent.detail.completed,
    "Should indicate the form is complete"
  );
  Assert.deepEqual(
    subview.captureState(),
    {
      username: "test@example.com",
      server: "example.com",
    },
    "Should get guessed server based on username"
  );
  Assert.equal(username.ariaInvalid, "false", "Username should be valid");
  Assert.equal(
    server.ariaInvalid,
    "false",
    "Server should be valid because we guessed a value from username"
  );
  Assert.ok(!server.required, "Should not need server when guessing");

  subview.resetState();
});

add_task(async function test_emailWithoutDomainDoesntProvideHost() {
  subview.setState();
  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => username.value === "local@"
  );

  EventUtils.sendString("local@");
  const updatedEvent = await updated;

  Assert.ok(
    !updatedEvent.detail.completed,
    "Email without hostname shouldn't be valid"
  );
  Assert.deepEqual(
    subview.captureState(),
    {
      username: "local@",
      server: "",
    },
    "Should have a partial state with missing localpart"
  );
  Assert.equal(username.ariaInvalid, "false", "Username should be valid");
  Assert.equal(
    server.ariaInvalid,
    "true",
    "Should require server when domain in username is empty"
  );
  Assert.ok(server.required, "Server should still be required");

  subview.resetState();
});

add_task(async function test_captureStateURLFieldPreferred() {
  subview.setState();

  const updated = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    server.value === "https://unrelated.invalid"
  );
  EventUtils.sendString("test@example.com", subview.ownerGlobal);
  EventUtils.synthesizeKey("KEY_Tab", {}, subview.onwerGlobal);
  EventUtils.sendString("https://unrelated.invalid", subview.ownerGlobal);
  await updated;

  Assert.deepEqual(
    subview.captureState(),
    {
      username: "test@example.com",
      server: "https://unrelated.invalid",
    },
    "Should prefer server field contents over domain guessed from username"
  );

  subview.resetState();
});
