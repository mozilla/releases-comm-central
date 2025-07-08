/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let step;
let subHeaderTextStep;
let header;
let headerWithSubheaderText;
add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/accountcreation/test/browser/files/accountHubStep.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  [step, subHeaderTextStep] =
    tab.browser.contentWindow.document.querySelectorAll("account-hub-step");
  header = step.shadowRoot.querySelector("account-hub-header");
  headerWithSubheaderText =
    subHeaderTextStep.shadowRoot.querySelector("account-hub-header");

  registerCleanupFunction(() => {
    tabmail.closeOtherTabs(tabmail.tabInfo[0]);
  });
});

add_task(async function test_titleHasFluentId() {
  const titleFluentId = header.l10n.getAttributes(
    header.querySelector("#title")
  ).id;

  const stepTitleFluentId = step.getAttribute("title-id");

  Assert.equal(
    titleFluentId,
    "account-hub-title",
    "Header should have fluentId of account-hub-title"
  );

  Assert.equal(
    titleFluentId,
    stepTitleFluentId,
    "Header title fluentId should match step title-id attribute"
  );
});

add_task(async function test_subheaderHasSubheaderId() {
  const subheaderFluentId = header.l10n.getAttributes(
    header.querySelector("#subheader")
  ).id;

  const stepSubheaderFluentId = step.getAttribute("subheader-id");

  Assert.equal(
    subheaderFluentId,
    "account-hub-title",
    "Subheader should have a fluentId of account-hub-title"
  );

  Assert.equal(
    subheaderFluentId,
    stepSubheaderFluentId,
    "Subheader fluentId should match step subheader-id attribute"
  );
});

add_task(async function test_rendersSubheaderTextCorrectly() {
  const subheaderText =
    headerWithSubheaderText.querySelector("#subheader").textContent;

  const subheaderTextAttribute =
    subHeaderTextStep.getAttribute("subheader-text");

  Assert.equal(
    subheaderText,
    "Test Subheader",
    "Subheader should render the text from subheader-text attribute"
  );

  Assert.equal(
    subheaderTextAttribute,
    subheaderText,
    "Step subheader text attribute should match subheader text content"
  );
});
