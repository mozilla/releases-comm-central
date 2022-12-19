/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

let tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});
let browser;
let testDocument;

const waitForRender = () => {
  return new Promise(resolve => {
    window.requestAnimationFrame(resolve);
  });
};
const getTabButton = tab => tab.shadowRoot.querySelector("button");

add_setup(async function() {
  let tab = tabmail.openTab("contentTab", {
    url:
      "chrome://mochitests/content/browser/comm/mail/components/unifiedtoolbar/test/browser/files/unifiedToolbarTab.xhtml",
  });

  await BrowserTestUtils.browserLoaded(tab.browser);
  tab.browser.focus();
  browser = tab.browser;
  testDocument = tab.browser.contentWindow.document;
});

add_task(function test_tabElementInitialization() {
  const activeTab = testDocument.querySelector("unified-toolbar-tab[selected]");
  is(
    activeTab.getAttribute("role"),
    "presentation",
    "The custom element is just for show"
  );
  ok(
    !activeTab.hasAttribute("aria-controls"),
    "aria-controls removed from custom element"
  );
  ok(activeTab.hasAttribute("selected"), "Active tab kept itself selected");
  const tabButton = getTabButton(activeTab);
  is(tabButton.getAttribute("role"), "tab", "Active tab is marked as tab");
  is(tabButton.tabIndex, 0, "Active tab is in the focus ring");
  is(
    tabButton.getAttribute("aria-selected"),
    "true",
    "Tab is marked as selected"
  );
  ok(
    tabButton.hasAttribute("aria-controls"),
    "aria-controls got given to button"
  );

  const otherTab = testDocument.querySelector(
    "unified-toolbar-tab:not([selected])"
  );
  is(
    otherTab.getAttribute("role"),
    "presentation",
    "The custom element is just for show on the other tab"
  );
  ok(
    !otherTab.hasAttribute("aria-controls"),
    "aria-controls removed from the other tab"
  );
  ok(!otherTab.hasAttribute("selected"), "Other tab didn't select itself");
  const otherButton = getTabButton(otherTab);
  is(otherButton.getAttribute("role"), "tab", "Other tab is marked as tab");
  is(otherButton.tabIndex, -1, "Other tab is not in the focus ring");
  ok(
    !otherButton.hasAttribute("aria-selected"),
    "Other tab isn't marked as selected"
  );
  ok(
    otherButton.hasAttribute("aria-controls"),
    "aria-controls got given to other button"
  );
});

add_task(async function test_switchingTabWithMouse() {
  const tab1 = testDocument.querySelector("unified-toolbar-tab:nth-child(1)");
  const tab1Button = getTabButton(tab1);
  const tab2 = testDocument.querySelector("unified-toolbar-tab:nth-child(2)");
  const tab2Button = getTabButton(tab2);
  const tabPane1 = testDocument.getElementById("tabPane");
  const tabPane2 = testDocument.getElementById("otherTabPane");

  tab2Button.click();
  ok(tab2.hasAttribute("selected"), "Other tab is selected");
  is(tab2Button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.hasAttribute("selected"), "First tab is not selected");
  is(tab1Button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane2),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane1), "Tab pane for first tab is hidden");

  tab1Button.click();
  ok(tab1.hasAttribute("selected"), "First tab is selected");
  is(tab1Button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.hasAttribute("selected"), "Other tab is not selected");
  is(tab2Button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane1),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane2), "Tab pane for other tab is hidden");
});

add_task(async function test_switchingTabWithKeyboard() {
  const tab1 = testDocument.querySelector("unified-toolbar-tab:nth-child(1)");
  const tab1Button = getTabButton(tab1);
  const tab2 = testDocument.querySelector("unified-toolbar-tab:nth-child(2)");
  const tab2Button = getTabButton(tab2);
  const tabPane1 = testDocument.getElementById("tabPane");
  const tabPane2 = testDocument.getElementById("otherTabPane");

  tab1.focus();
  is(testDocument.activeElement, tab1, "Initially first tab is active");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, browser);
  is(testDocument.activeElement, tab2, "Second tab is focused");
  is(tab2.shadowRoot.activeElement, tab2Button, "Button within tab is focused");
  await BrowserTestUtils.synthesizeKey(" ", {}, browser);
  ok(tab2.hasAttribute("selected"), "Other tab is selected");
  is(tab2Button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.hasAttribute("selected"), "First tab is not selected");
  is(tab1Button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane2),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane1), "Tab pane for first tab is hidden");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, browser);
  is(testDocument.activeElement, tab1, "Previous tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_End", {}, browser);
  is(testDocument.activeElement, tab2, "Last tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Home", {}, browser);
  is(testDocument.activeElement, tab1, "First tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  ok(tab1.hasAttribute("selected"), "First tab is selected");
  is(tab1Button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.hasAttribute("selected"), "Other tab is not selected");
  is(tab2Button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane1),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane2), "Tab pane for other tab is hidden");
});

add_task(async function test_switchingTabWithKeyboardRTL() {
  testDocument.dir = "rtl";
  await waitForRender();
  const tab1 = testDocument.querySelector("unified-toolbar-tab:nth-child(1)");
  const tab1Button = getTabButton(tab1);
  const tab2 = testDocument.querySelector("unified-toolbar-tab:nth-child(2)");
  const tab2Button = getTabButton(tab2);
  const tabPane1 = testDocument.getElementById("tabPane");
  const tabPane2 = testDocument.getElementById("otherTabPane");
  tab1.focus();
  is(testDocument.activeElement, tab1, "Initially first tab is active");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, browser);
  is(testDocument.activeElement, tab2, "Second tab is selected");
  is(tab2.shadowRoot.activeElement, tab2Button, "Button within tab is focused");
  await BrowserTestUtils.synthesizeKey(" ", {}, browser);
  ok(tab2.hasAttribute("selected"), "Other tab is selected");
  is(tab2Button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.hasAttribute("selected"), "First tab is not selected");
  is(tab1Button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane2),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane1), "Tab pane for first tab is hidden");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, browser);
  is(testDocument.activeElement, tab1, "Previous tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  ok(tab1.hasAttribute("selected"), "First tab is selected");
  is(tab1Button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.hasAttribute("selected"), "Other tab is not selected");
  is(tab2Button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tabPane1),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tabPane2), "Tab pane for other tab is hidden");

  testDocument.dir = "ltr";
});
