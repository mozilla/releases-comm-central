/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let header;
let tab;

add_setup(async function () {
  tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubHeader.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  header =
    tab.browser.contentWindow.document.querySelector("account-hub-header");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_showWelcomeOnFirstRun() {
  Assert.ok(
    BrowserTestUtils.isHidden(header.shadowRoot.querySelector("#closeButton")),
    "Close button should be hidden on first run"
  );
  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-name")
      .getAttribute("data-l10n-id"),
    "account-hub-welcome",
    "Should show correct welcome message on firstRun"
  );
  Assert.equal(
    header.shadowRoot
      .querySelector(".branding-header-title")
      .getAttribute("data-l10n-id"),
    "account-hub-welcome-brand",
    "Should show correct welcome branding title on firstRun"
  );
  Assert.ok(
    header.shadowRoot
      .querySelector(".branding-header-name")
      .hasAttribute("aria-hidden"),
    "Should not expose name to screen reader"
  );
  Assert.ok(
    header.shadowRoot
      .querySelector(".branding-header-title")
      .hasAttribute("aria-hidden"),
    "Should not expose title to screen reader"
  );

  Assert.ok(
    BrowserTestUtils.isVisible(
      header.shadowRoot.querySelector(".account-hub-welcome-text")
    ),
    "Should show a11y friendly welcome text"
  );
});
