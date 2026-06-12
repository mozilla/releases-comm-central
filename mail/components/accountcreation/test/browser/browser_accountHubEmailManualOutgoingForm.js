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
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailManualOutgoingForm.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  subview = tab.browser.contentWindow.document.querySelector(
    "email-manual-outgoing-form"
  );

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

async function checkAuthMethods(select, protocol) {
  const authMethods = {
    0: "autodetect",
    1: "none",
    2: "normal password",
    3: "encrypted password",
    4: "Kerberos",
    5: "NTLM",
    6: "OAuth2",
  };
  const authMap = {
    smtp: ["0", "1", "2", "3", "4", "5"],
    smtpWithOauth: ["0", "1", "2", "3", "4", "5", "6"],
    all: Object.keys(authMethods),
  };

  await new Promise(resolve => window.requestAnimationFrame(resolve));

  const popupPromise = BrowserTestUtils.waitForSelectPopupShown(window);
  EventUtils.synthesizeMouseAtCenter(select, {}, browser.contentWindow);
  const popup = await popupPromise;

  for (const item of popup.querySelectorAll("menuitem")) {
    const hide = !authMap[protocol].includes(item.value);
    Assert.equal(
      hide,
      item.hidden,
      `${item.value} option should ${hide ? "NOT " : ""}be hidden when protocol is ${protocol}`
    );
  }

  popup.hidePopup();

  await BrowserTestUtils.waitForPopupEvent(popup, "hidden");
}

add_task(async function testOAuthMethodVisibility() {
  const config = new AccountConfig();
  config.incoming.type = "imap";
  config.outgoing.type = "smtp";
  subview.setState(config);

  const outgoingAuthMethod = subview.querySelector("#outgoingAuthMethod");
  const outgoingHostname = subview.querySelector("#outgoingHostname");

  info("Test smtp auth methods");
  await checkAuthMethods(outgoingAuthMethod, "smtp");

  let configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => outgoingHostname.value == "gmail.com"
  );

  await SimpleTest.promiseFocus(browser.contentWindow);
  let focusEvent = BrowserTestUtils.waitForEvent(outgoingHostname, "focus");
  EventUtils.synthesizeMouseAtCenter(
    outgoingHostname,
    {},
    browser.contentWindow
  );
  await focusEvent;

  info("Typing hostname...");
  EventUtils.sendString("gmail.com", browser.contentWindow);
  await configUpdatedEventPromise;
  await SimpleTest.promiseFocus(browser.contentWindow);

  info("Test smtp oauth auth option");
  await checkAuthMethods(outgoingAuthMethod, "smtpWithOauth");

  info("Select OAuth");
  await SimpleTest.promiseFocus(browser.contentWindow);
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated"
  );

  const authSelectorMethodPromise =
    BrowserTestUtils.waitForSelectPopupShown(window);
  EventUtils.synthesizeMouseAtCenter(
    outgoingAuthMethod,
    {},
    browser.contentWindow
  );

  const authMethodSelectorPopup = await authSelectorMethodPromise;
  const authMethodSelectorItems =
    authMethodSelectorPopup.querySelectorAll("menuitem");

  // #outgoingAuthMethodOAuth2.
  authMethodSelectorPopup.activateItem(authMethodSelectorItems[6]);
  await BrowserTestUtils.waitForPopupEvent(authMethodSelectorPopup, "hidden");
  await configUpdatedEventPromise;
  Assert.equal(
    outgoingAuthMethod.value,
    Ci.nsMsgAuthMethod.OAuth2,
    "The auth method should be set as OAuth2"
  );

  info("Update hostname...");
  configUpdatedEventPromise = BrowserTestUtils.waitForEvent(
    subview,
    "config-updated",
    false,
    () => outgoingHostname.value == ""
  );

  await SimpleTest.promiseFocus(browser.contentWindow);
  focusEvent = BrowserTestUtils.waitForEvent(outgoingHostname, "focus");
  EventUtils.synthesizeMouseAtCenter(
    outgoingHostname,
    {},
    browser.contentWindow
  );
  await focusEvent;

  outgoingHostname.select();
  EventUtils.synthesizeKey("KEY_Delete", {}, browser.contentWindow);
  await configUpdatedEventPromise;

  Assert.equal(
    outgoingAuthMethod.value,
    Ci.nsMsgAuthMethod.passwordCleartext,
    "The auth method should be set as Normal Password"
  );
});
