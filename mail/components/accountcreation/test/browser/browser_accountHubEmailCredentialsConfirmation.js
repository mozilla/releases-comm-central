/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser, subview, hostname, username, socketType;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailCredentialsConfirmation.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-credentials-confirmation"
  );
  hostname = subview.querySelector("#hostname");
  username = subview.querySelector("#username");
  socketType = subview.querySelector("#socketType");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  const credentials = {
    host: "host",
    username: "email",
    scheme: "http",
  };
  subview.setState(credentials);
  Assert.equal(
    hostname.textContent,
    credentials.host,
    "The hostname should be set"
  );
  Assert.equal(
    username.textContent,
    credentials.username,
    "The username should be set"
  );
  Assert.equal(
    subview.l10n.getAttributes(socketType).id,
    "account-hub-ssl-noencryption",
    "Socket type should have the correct string set"
  );
  Assert.equal(
    socketType.textContent,
    "",
    "Socket type textContent should be empty"
  );

  Assert.equal(
    subview.l10n.getAttributes(subview.querySelector("#confirmationQuestion"))
      .args.domain,
    credentials.host,
    "Credentials confirmation question should have the correct host"
  );

  credentials.scheme = "https";
  subview.setState(credentials);
  Assert.equal(
    socketType.textContent,
    "SSL/TLS",
    "The socket type should be set"
  );
  Assert.ok(
    !socketType.hasAttribute("data-l10n-id"),
    "The socket type fluent string should be removed"
  );
  subview.resetState();
});

add_task(async function test_resetState() {
  const credentials = {
    host: "host",
    username: "email",
    scheme: "http",
  };
  subview.setState(credentials);
  subview.resetState();
  Assert.equal(hostname.textContent, "", "The hostname should be cleared");
  Assert.equal(username.textContent, "", "The username should be cleared");
  Assert.ok(
    !socketType.hasAttribute("data-l10n-id"),
    "The socket type fluent string should be removed"
  );
  Assert.equal(
    socketType.textContent,
    "",
    "Socket type textContent should be empty"
  );
});
