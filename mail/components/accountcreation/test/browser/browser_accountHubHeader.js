/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const tabmail = document.getElementById("tabmail");
let header;

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
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

add_task(async function test_showsTitleAndSubheader() {
  const title = header.shadowRoot.querySelector("#accountHubHeaderTitle");
  const subheader = header.shadowRoot.querySelector(
    "#accountHubHeaderSubheader"
  );

  const titleSlot = title.querySelector("slot[name='title']");
  const assignedToTitleSlot = titleSlot.assignedElements()[0];

  const subHeaderSlot = subheader.querySelector('slot[name="subheader"]');
  const assignedToSubHeaderSlot = subHeaderSlot.assignedElements()[0];

  Assert.strictEqual(
    assignedToTitleSlot.tagName,
    "span",
    "Title slot should have a <span> assigned to it"
  );
  Assert.strictEqual(
    assignedToTitleSlot.id,
    "title",
    'Title slot should have an element with id="title" assigned to it'
  );
  Assert.strictEqual(
    assignedToSubHeaderSlot.tagName,
    "span",
    "Subheader slot should have a <span> assigned to it"
  );
  Assert.strictEqual(
    assignedToSubHeaderSlot.id,
    "subheader",
    'Subheader slot should have an element with id="subheader" assigned to it'
  );

  Assert.equal(
    assignedToTitleSlot.textContent,
    "Test Title",
    "Title should be set correctly"
  );
  Assert.equal(
    assignedToSubHeaderSlot.textContent,
    "Test Subheader",
    "Subheader should be set correctly"
  );
});

add_task(async function test_subheader_hidden_by_default() {
  const subheader = header.shadowRoot.querySelector(
    "#accountHubHeaderSubheader"
  );

  Assert.ok(
    BrowserTestUtils.isHidden(subheader),
    "Subheader should be hidden by default"
  );

  header.showSubheader();
  Assert.ok(
    BrowserTestUtils.isVisible(subheader),
    "Subheader should be shown when showSubheader is called"
  );
});
