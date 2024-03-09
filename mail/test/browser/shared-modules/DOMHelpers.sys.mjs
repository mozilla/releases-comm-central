/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  mc: "resource://testing-common/mozmill/FolderDisplayHelpers.sys.mjs",
});

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * This function takes either a string or an elementlibs.Elem, and returns
 * whether it is hidden or not (simply by poking at its hidden property). It
 * doesn't try to do anything smart, like is it not into view, or whatever.
 *
 * @param aElt The element to query.
 * @returns Whether the element is visible or not.
 */
function element_visible(aElt) {
  let e;
  if (typeof aElt == "string") {
    e = lazy.mc.document.getElementById(aElt);
  } else {
    e = aElt;
  }
  return !e.hidden;
}

/**
 * Assert that en element's visible.
 *
 * @param aElt The element, an ID or an elementlibs.Elem
 * @param aWhy The error message in case of failure
 */
export function assert_element_visible(aElt, aWhy) {
  Assert.ok(element_visible(aElt), aWhy);
}

/**
 * Returns if a element is visible by traversing all parent elements and check
 * that all are visible.
 *
 * @param aElem The element to be checked
 */
export function element_visible_recursive(aElem) {
  if (aElem.hidden || aElem.collapsed) {
    return false;
  }
  const parent = aElem.parentNode;
  if (parent == null) {
    return true;
  }

  // #tabpanelcontainer and its parent #tabmail-tabbox have the same selectedPanel.
  // Don't ask me why, it's just the way it is.
  if (
    "selectedPanel" in parent &&
    parent.selectedPanel != aElem &&
    aElem.id != "tabpanelcontainer"
  ) {
    return false;
  }
  return element_visible_recursive(parent);
}

/**
 * Assert that en element's not visible.
 *
 * @param aElt The element, an ID or an elementlibs.Elem
 * @param aWhy The error message in case of failure
 */
export function assert_element_not_visible(aElt, aWhy) {
  Assert.ok(!element_visible(aElt), aWhy);
}

/**
 * Wait for and return an element matching a particular CSS selector.
 *
 * @param aParent the node to begin searching from
 * @param aSelector the CSS selector to search with
 */
export async function promise_element(aParent, aSelector) {
  let target = null;
  await TestUtils.waitForCondition(function () {
    target = aParent.querySelector(aSelector);
    return target != null;
  }, "Timed out waiting for a target for selector: " + aSelector);

  return target;
}

/**
 * Given some starting node aStart, ensure that aStart and the aNum next
 * siblings of aStart are nodes of type aNodeType.
 *
 * @param aNodeType the type of node to look for, example: "br".
 * @param aStart the first node to check.
 * @param aNum the number of sibling br nodes to check for.
 */
export function assert_next_nodes(aNodeType, aStart, aNum) {
  let node = aStart;
  for (let i = 0; i < aNum; ++i) {
    node = node.nextSibling;
    if (node.localName != aNodeType) {
      throw new Error(
        "The node should be followed by " +
          aNum +
          " nodes of " +
          "type " +
          aNodeType
      );
    }
  }
  return node;
}

/**
 * Given some starting node aStart, ensure that aStart and the aNum previous
 * siblings of aStart are nodes of type aNodeType.
 *
 * @param aNodeType the type of node to look for, example: "br".
 * @param aStart the first node to check.
 * @param aNum the number of sibling br nodes to check for.
 */
export function assert_previous_nodes(aNodeType, aStart, aNum) {
  let node = aStart;
  for (let i = 0; i < aNum; ++i) {
    node = node.previousSibling;
    if (node.localName != aNodeType) {
      throw new Error(
        "The node should be preceded by " +
          aNum +
          " nodes of " +
          "type " +
          aNodeType
      );
    }
  }
  return node;
}

/**
 * Checks if an element and all its ancestors are visible.
 *
 * @param {Window} aWin - The window containing the element.
 * @param {string} aId - The ID of the element.
 * @returns {boolean} If the element is visible.
 */
export function check_element_visible(aWin, aId) {
  let element = aWin.document.getElementById(aId);
  if (!element) {
    return false;
  }

  while (element) {
    if (
      element.hidden ||
      element.collapsed ||
      element.clientWidth == 0 ||
      element.clientHeight == 0 ||
      aWin.getComputedStyle(element).display == "none"
    ) {
      return false;
    }
    element = element.parentElement;
  }
  return true;
}

/**
 * Wait for a particular element to become fully visible.
 *
 * @param {Window} aWin - The window of the element.
 * @param {string} aId - ID of the element to wait for.
 */
export async function promise_element_visible(aWin, aId) {
  await TestUtils.waitForCondition(function () {
    return check_element_visible(aWin, aId);
  }, "Timed out waiting for element with ID=" + aId + " to become visible");
}

/**
 * Wait for a particular element to become fully invisible.
 *
 * @param {Window} aWin - The window of the element.
 * @param {string} aId - ID of the element to wait for.
 */
export async function promise_element_invisible(aWin, aId) {
  await TestUtils.waitForCondition(function () {
    return !check_element_visible(aWin, aId);
  }, "Timed out waiting for element with ID=" + aId + " to become invisible");
}
