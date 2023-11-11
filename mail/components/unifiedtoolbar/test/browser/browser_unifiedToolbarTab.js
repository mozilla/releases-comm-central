/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const tabmail = document.getElementById("tabmail");
registerCleanupFunction(() => {
  tabmail.closeOtherTabs(tabmail.tabInfo[0]);
});
let browser;
let testDocument;

const getTabButton = tab => tab.shadowRoot.querySelector("button");
/**
 * Get the relevant elements for the tab at the given index.
 *
 * @param {number} tabIndex
 * @returns {{tab: UnifiedToolbarTab, button: HTMLButtonElement, pane: HTMLElement}}
 */
const getTabElements = tabIndex => {
  const tab = testDocument.querySelector(
    `unified-toolbar-tab:nth-child(${tabIndex})`
  );
  const button = getTabButton(tab);
  const pane = tab.pane;
  return { tab, button, pane };
};

add_setup(async function () {
  const tab = tabmail.openTab("contentTab", {
    url: "chrome://mochitests/content/browser/comm/mail/components/unifiedtoolbar/test/browser/files/unifiedToolbarTab.xhtml",
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

add_task(async function test_paneGetter() {
  const tab1 = getTabElements(1);
  const tabPane = testDocument.getElementById("tabPane");
  const tab2 = getTabElements(2);
  const otherTabPane = testDocument.getElementById("otherTabPane");

  is(
    tab1.button.getAttribute("aria-controls"),
    tabPane.id,
    "Tab 1 controls tab 1 pane"
  );
  is(
    tab2.button.getAttribute("aria-controls"),
    otherTabPane.id,
    "Tab 2 controls tab 2 pane"
  );

  Assert.strictEqual(
    tab1.tab.pane,
    tabPane,
    "Tab 1 pane getter returns #tabPane"
  );
  Assert.strictEqual(
    tab2.tab.pane,
    otherTabPane,
    "Tab 2 pane getter returns #otherTabPane"
  );
});

add_task(async function test_unselect() {
  const tab = getTabElements(1);

  tab.tab.unselect();

  ok(!tab.button.hasAttribute("aria-selected"), "Tab not marked as selected");
  is(tab.button.tabIndex, -1, "Tab not in focus ring");
  ok(!tab.tab.hasAttribute("selected"), "Tab not marked selected");
  ok(tab.pane.hidden, "Tab pane hidden");
});

add_task(async function test_select() {
  const tab1 = getTabElements(1);
  const tab2 = getTabElements(2);

  let tabswitchPromise = BrowserTestUtils.waitForEvent(
    testDocument.body,
    "tabswitch"
  );
  tab1.tab.select();

  await tabswitchPromise;
  ok(tab1.tab.hasAttribute("selected"), "Tab 1 selected");
  is(
    tab1.button.getAttribute("aria-selected"),
    "true",
    "Tab 1 marked as selected"
  );
  is(tab1.button.tabIndex, 0, "Tab 1 keyboard selectable");
  ok(!tab1.pane.hidden, "Tab pane for tab 1 visible");

  tabswitchPromise = BrowserTestUtils.waitForEvent(tab2.tab, "tabswitch");
  tab2.tab.select();

  await tabswitchPromise;
  ok(tab2.tab.hasAttribute("selected"), "Tab 2 selected");
  is(
    tab2.button.getAttribute("aria-selected"),
    "true",
    "Tab 2 has a11y selection"
  );
  is(tab2.button.tabIndex, 0, "Tab 2 keyboard selectable");
  ok(!tab2.pane.hidden, "Tab pane for tab 2 visible");

  ok(!tab1.tab.hasAttribute("selected"), "Tab 1 unselected");
  ok(!tab1.button.hasAttribute("aria-selected"), "Tab 1 marked as unselected");
  is(tab1.button.tabIndex, -1, "Tab 1 not in focus ring");
  ok(tab1.pane.hidden, "Tab pane for tab 1 hidden");
});

add_task(async function test_switchingTabWithMouse() {
  const tab1 = getTabElements(1);
  const tab2 = getTabElements(2);

  tab2.button.click();
  ok(tab2.tab.hasAttribute("selected"), "Other tab is selected");
  is(tab2.button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.tab.hasAttribute("selected"), "First tab is not selected");
  is(tab1.button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab2.pane),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab1.pane), "Tab pane for first tab is hidden");

  tab1.button.click();
  ok(tab1.tab.hasAttribute("selected"), "First tab is selected");
  is(tab1.button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.tab.hasAttribute("selected"), "Other tab is not selected");
  is(tab2.button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab1.pane),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab2.pane), "Tab pane for other tab is hidden");
});

add_task(async function test_switchingTabWithKeyboard() {
  const tab1 = getTabElements(1);
  const tab2 = getTabElements(2);

  tab1.tab.focus();
  is(testDocument.activeElement, tab1.tab, "Initially first tab is active");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, browser);
  is(testDocument.activeElement, tab2.tab, "Second tab is focused");
  is(
    tab2.tab.shadowRoot.activeElement,
    tab2.button,
    "Button within tab is focused"
  );
  await BrowserTestUtils.synthesizeKey(" ", {}, browser);
  ok(tab2.tab.hasAttribute("selected"), "Other tab is selected");
  is(tab2.button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.tab.hasAttribute("selected"), "First tab is not selected");
  is(tab1.button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab2.pane),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab1.pane), "Tab pane for first tab is hidden");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, browser);
  is(testDocument.activeElement, tab1.tab, "Previous tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_End", {}, browser);
  is(testDocument.activeElement, tab2.tab, "Last tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Home", {}, browser);
  is(testDocument.activeElement, tab1.tab, "First tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  ok(tab1.tab.hasAttribute("selected"), "First tab is selected");
  is(tab1.button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.tab.hasAttribute("selected"), "Other tab is not selected");
  is(tab2.button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab1.pane),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab2.pane), "Tab pane for other tab is hidden");
});

add_task(async function test_switchingTabWithKeyboardRTL() {
  testDocument.dir = "rtl";
  await waitForRender();
  const tab1 = getTabElements(1);
  const tab2 = getTabElements(2);

  tab1.tab.focus();
  is(testDocument.activeElement, tab1.tab, "Initially first tab is active");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowLeft", {}, browser);
  is(testDocument.activeElement, tab2.tab, "Second tab is selected");
  is(
    tab2.tab.shadowRoot.activeElement,
    tab2.button,
    "Button within tab is focused"
  );
  await BrowserTestUtils.synthesizeKey(" ", {}, browser);
  ok(tab2.tab.hasAttribute("selected"), "Other tab is selected");
  is(tab2.button.tabIndex, 0, "Other tab is in focus ring");
  ok(!tab1.tab.hasAttribute("selected"), "First tab is not selected");
  is(tab1.button.tabIndex, -1, "First tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab2.pane),
    "Tab pane for selected tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab1.pane), "Tab pane for first tab is hidden");

  await BrowserTestUtils.synthesizeKey("KEY_ArrowRight", {}, browser);
  is(testDocument.activeElement, tab1.tab, "Previous tab is selected");
  await BrowserTestUtils.synthesizeKey("KEY_Enter", {}, browser);
  ok(tab1.tab.hasAttribute("selected"), "First tab is selected");
  is(tab1.button.tabIndex, 0, "First tab is in focus ring");
  ok(!tab2.tab.hasAttribute("selected"), "Other tab is not selected");
  is(tab2.button.tabIndex, -1, "Other tab is not in focus ring");
  ok(
    BrowserTestUtils.is_visible(tab1.pane),
    "Tab pane for first tab is visible"
  );
  ok(BrowserTestUtils.is_hidden(tab2.pane), "Tab pane for other tab is hidden");

  testDocument.dir = "ltr";
});
