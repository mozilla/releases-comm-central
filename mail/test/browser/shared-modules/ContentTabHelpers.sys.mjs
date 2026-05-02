/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import * as folderDisplayHelper from "resource://testing-common/mail/FolderDisplayHelpers.sys.mjs";

import * as wh from "resource://testing-common/mail/WindowHelpers.sys.mjs";

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";
import * as EventUtils from "resource://testing-common/mail/EventUtils.sys.mjs";

var FAST_TIMEOUT = 1000;
var FAST_INTERVAL = 100;

var mc = folderDisplayHelper.mc;

/**
 * Opens a content tab with the given URL.
 *
 * @param {string} aURL - The URL to load.
 * @param {string} [aLinkHandler=null] - See specialTabs.contentTabType.openTab.
 * @param {boolean} [aBackground=false] Whether the tab is opened in the background.
 *
 * @returns {object} The newly-opened tab.
 */
export async function open_content_tab_with_url(
  aURL,
  aLinkHandler = null,
  aBackground = false
) {
  const tabmail = mc.document.getElementById("tabmail");
  const preCount = tabmail.tabContainer.allTabs.length;
  tabmail.openTab("contentTab", {
    url: aURL,
    background: aBackground,
    linkHandler: aLinkHandler,
  });
  await TestUtils.waitForCondition(
    () => tabmail.tabContainer.allTabs.length == preCount + 1,
    "Timeout waiting for the content tab to open with URL: " + aURL,
    FAST_TIMEOUT,
    FAST_INTERVAL
  );

  // We append new tabs at the end, so check the last one.
  const expectedNewTab = tabmail.tabInfo[preCount];
  folderDisplayHelper.assert_selected_tab(expectedNewTab);
  await promise_content_tab_load(expectedNewTab, aURL);
  return expectedNewTab;
}

/**
 * Opens a content tab with a click on the given element. The tab is expected to
 * be opened in the foreground.
 *
 * @param {Element} aElem - The element to click or a function that causes the tab to open.
 * @param {string} aExpectedURL - The URL that is expected to be opened.
 * @param {string} [aTabType] - Optional tab type to expect.
 * @returns {TabInfo} The newly-opened tab.
 */
export async function open_content_tab_with_click(
  aElem,
  aExpectedURL,
  aTabType = "contentTab"
) {
  const preCount =
    mc.document.getElementById("tabmail").tabContainer.allTabs.length;
  if (typeof aElem != "function") {
    EventUtils.synthesizeMouseAtCenter(aElem, {}, aElem.ownerGlobal);
  } else {
    aElem();
  }

  await TestUtils.waitForCondition(
    () =>
      mc.document.getElementById("tabmail").tabContainer.allTabs.length ==
      preCount + 1,
    "Timeout waiting for the content tab to open",
    FAST_TIMEOUT,
    FAST_INTERVAL
  );

  // We append new tabs at the end, so check the last one.
  const expectedNewTab =
    mc.document.getElementById("tabmail").tabInfo[preCount];
  folderDisplayHelper.assert_selected_tab(expectedNewTab);
  folderDisplayHelper.assert_tab_mode_name(expectedNewTab, aTabType);
  await promise_content_tab_load(expectedNewTab, aExpectedURL);
  return expectedNewTab;
}

/**
 * Call this before triggering a page load that you are going to wait for using
 * |promise_content_tab_load|. This ensures that if a page is already displayed
 * in the given tab that state is sufficiently cleaned up so it doesn't trick us
 * into thinking that there is no need to wait.
 *
 * @param {TabInfo} [aTab] - Optional tab, defaulting to the current tab.
 */
export function plan_for_content_tab_load(aTab) {
  if (aTab === undefined) {
    aTab = mc.document.getElementById("tabmail").currentTabInfo;
  }
  aTab.pageLoaded = false;
}

/**
 * Waits for the given content tab to load completely with the given URL. This
 * is expected to be accompanied by a |plan_for_content_tab_load| right before
 * the action triggering the page load takes place.
 *
 * Note that you cannot call |plan_for_content_tab_load| if you're opening a new
 * tab. That is fine, because pageLoaded is initially false.
 *
 * @param {TabInfo} [aTab] - Optional tab, defaulting to the current tab.
 * @param {string} aURL - The URL being loaded in the tab.
 * @param {integer} [aTimeout] - Optional time to wait for the load.
 */
export async function promise_content_tab_load(aTab, aURL, aTimeout) {
  if (aTab === undefined) {
    aTab = mc.document.getElementById("tabmail").currentTabInfo;
  }

  function isLoadedChecker() {
    // Require that the progress listener think that the page is loaded.
    if (!aTab.pageLoaded) {
      return false;
    }
    // Also require that our tab infrastructure thinks that the page is loaded.
    return !aTab.busy;
  }

  await TestUtils.waitForCondition(
    isLoadedChecker,
    "Timeout waiting for the content tab page to load.",
    aTimeout
  );
  // The above may return immediately, meaning the event queue might not get a
  // chance. Give it a chance now.
  await TestUtils.waitForTick();
  // Finally, require that the tab's browser thinks that no page is being loaded.
  await wh.wait_for_browser_load(aTab.browser, aURL);
}

/**
 * Gets the element with the given ID from the content tab's displayed page.
 */
export function content_tab_e(aTab, aId) {
  return aTab.browser.contentDocument.getElementById(aId);
}

/**
 * Returns the current "display" style property of an element.
 */
export function get_content_tab_element_display(aTab, aElem) {
  const style = aTab.browser.contentWindow.getComputedStyle(aElem);
  return style.getPropertyValue("display");
}

/**
 * Asserts that the given element is hidden from view on the page.
 */
export function assert_content_tab_element_hidden(aTab, aElem) {
  const display = get_content_tab_element_display(aTab, aElem);
  Assert.equal(display, "none", "Element should be hidden");
}

/**
 * Asserts that the given element is visible on the page.
 */
export function assert_content_tab_element_visible(aTab, aElem) {
  const display = get_content_tab_element_display(aTab, aElem);
  Assert.notEqual(display, "none", "Element should be visible");
}

/**
 * Waits for the element's display property indicate it is visible.
 */
export async function promise_content_tab_element_display(aTab, aElem) {
  await TestUtils.waitForCondition(
    () => get_content_tab_element_display(aTab, aElem) != "none",
    "waiting for element to become visible"
  );
}

/**
 * Finds element in document fragment, containing only the specified text
 * as its textContent value.
 *
 * @param {Node} aRootNode - Root node of the node tree where search should start.
 * @param {string} aText - The string to search.
 */
export function get_element_by_text(aRootNode, aText) {
  // Check every node existing.
  const nodes = aRootNode.querySelectorAll("*");
  for (const node of nodes) {
    // We ignore surrounding whitespace.
    if (node.textContent.trim() == aText) {
      return node;
    }
  }

  return null;
}

/**
 * Finds element containing only the specified text in the content tab's page.
 */
function get_content_tab_element_by_text(aTab, aText) {
  const doc = aTab.browser.contentDocument.documentElement;
  return get_element_by_text(doc, aText);
}

/**
 * Asserts that the given text is present on the content tab's page.
 */
export function assert_content_tab_text_present(aTab, aText) {
  Assert.ok(
    get_content_tab_element_by_text(aTab, aText),
    `String "${aText}" should be on the content tab's page`
  );
}

/**
 * Asserts that the given text is absent on the content tab's page.
 */
export function assert_content_tab_text_absent(aTab, aText) {
  Assert.ok(
    !get_content_tab_element_by_text(aTab, aText),
    `String "${aText}" should not be on the content tab's page`
  );
}
