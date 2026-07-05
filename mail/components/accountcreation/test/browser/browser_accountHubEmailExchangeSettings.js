/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let browser;
let subview;
let serviceURL;
let serviceURLInput;

const { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubEmailExchangeSettings.xhtml",
  });

  browser = tab.browser;
  await BrowserTestUtils.browserLoaded(browser);
  browser.focus();
  subview = browser.contentWindow.document.querySelector(
    "email-exchange-settings"
  );
  serviceURL = subview.querySelector("#serviceURL");
  serviceURLInput = serviceURL.querySelector("input");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(function test_setState() {
  const config = new AccountConfig();
  subview.setState(config);
  Assert.equal(
    serviceURLInput,
    subview.ownerDocument.activeElement,
    "Service URL input should be focused"
  );
  Assert.equal(serviceURL.value, "", "Service URL input value should be empty");
});

add_task(async function test_captureState() {
  const graphUrl = "https://graph.microsoft.com/v1.0";

  const config = new AccountConfig();
  subview.setState(config);

  EventUtils.sendString(graphUrl);

  let state = subview.captureState();

  Assert.equal(
    state.incoming.exchangeURL,
    graphUrl,
    "captureState should reflect current data"
  );

  serviceURLInput.select();
  EventUtils.synthesizeKey("KEY_Backspace", {}, browser.contentWindow);

  state = subview.captureState();

  Assert.equal(
    state.incoming.exchangeURL,
    "",
    "captureState should reflect current data"
  );
});

add_task(async function test_serviceURLValidation() {
  const validationCases = [
    ["invalid", false],
    ["https://example.com/", true],
    ["http://localhost:10000/EWS/Exchange.asmx", true],
    ["https://outlook.office365.com/EWS/Exchange.asmx", true],
    ["https://outlook.office365.com/ews/exchange.asmx", true],
    ["https://graph.microsoft.com/", true],
    ["https://graph.microsoft.com/v1.0", true],
    ["ftp://example.com/", false],
  ];

  for (const [url, isValid] of validationCases) {
    serviceURLInput.select();
    EventUtils.synthesizeKey("KEY_Backspace", {}, browser.contentWindow);

    const updatedInput = BrowserTestUtils.waitForEvent(
      subview,
      "config-updated",
      false,
      () => serviceURL.value === url
    );
    EventUtils.sendString(url, subview.documentGlobal);
    const updatedEvent = await updatedInput;

    Assert.equal(
      updatedEvent.detail.completed,
      isValid,
      `${url} should ${isValid ? "complete" : "not complete"} the form`
    );
  }
});

add_task(async function test_serviceURLRestoredBySetState() {
  const graphUrl = "https://graph.microsoft.com/v1.0";

  const config = new AccountConfig();
  config.incoming.exchangeURL = graphUrl;
  subview.setState(config);

  Assert.equal(
    serviceURL.value,
    graphUrl,
    "setState should restore the saved service URL"
  );
  Assert.deepEqual(
    subview.captureState().incoming.exchangeURL,
    graphUrl,
    "captureState should return the restored service URL"
  );
});
