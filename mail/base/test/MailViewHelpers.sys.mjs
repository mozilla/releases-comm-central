/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
import { ContentTask } from "resource://testing-common/ContentTask.sys.mjs";
import { TestUtils } from "resource://testing-common/TestUtils.sys.mjs";

/**
 * Helper method to switch to a cards view with vertical layout.
 *
 * @param {Document} doc - The DOM document.
 */
export async function ensure_cards_view(doc) {
  const about3Pane = doc.getElementById("tabmail").currentAbout3Pane;
  const { threadTree } = about3Pane;

  if (threadTree.getAttribute("rows") == "thread-card") {
    return;
  }

  const switchedToCards = BrowserTestUtils.waitForAttribute(
    "rows",
    threadTree,
    "thread-card"
  );

  Services.prefs.setIntPref("mail.pane_config.dynamic", 2);
  Services.prefs.setIntPref("mail.threadpane.listview", 0);

  await switchedToCards;
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
}

/**
 * Helper method to switch to a table view with classic layout.
 *
 * @param {Document} doc - The DOM document.
 */
export async function ensure_table_view(doc) {
  const about3Pane = doc.getElementById("tabmail").currentAbout3Pane;
  const { threadTree } = about3Pane;

  if (threadTree.getAttribute("rows") == "thread-row") {
    return;
  }

  const switchedToTable = BrowserTestUtils.waitForAttribute(
    "rows",
    threadTree,
    "thread-row"
  );

  Services.prefs.setIntPref("mail.pane_config.dynamic", 0);
  Services.prefs.setIntPref("mail.threadpane.listview", 1);

  await switchedToTable;
  await new Promise(resolve => about3Pane.requestAnimationFrame(resolve));
}

/**
 * Clicks a row or cell. The tree provides keyboard access to the row,
 * so skip the checks for a separate accessible or tab stop on the hit target.
 *
 * @param {Element} target - The row or a part of the row to click.
 * @param {object} event - Options passed to `synthesizeMouseAtCenter`.
 * @param {Window} win - The window that receives the mouse event.
 * @param {object} eventUtils - The mouse event helper used by the caller.
 * @param {object} [accessibilityUtils] - The click checker. Defaults to the
 *   current browser test's checker.
 * @returns {boolean} Whether the event handler prevented the default action.
 */
export function synthesize_managed_row_click(
  target,
  event,
  win,
  eventUtils,
  accessibilityUtils
) {
  // The browser harness sets this scope for each test and clears it at teardown.
  const scope = ContentTask._testScope;
  const checker = accessibilityUtils ?? scope?.AccessibilityUtils;
  checker?.setEnv({ mustHaveAccessibleRule: false, focusableRule: false });
  const prevented = eventUtils.synthesizeMouseAtCenter(target, event, win);
  checker?.resetEnv();

  return prevented;
}

/**
 * Confirm that a thread row exposes the expected tree semantics before a test
 * intentionally suppresses a descendant click target false positive.
 *
 * @param {HTMLTableRowElement} row - The thread row being clicked.
 * @param {object} accessibilityUtils - The test's AccessibilityUtils object.
 */
export async function prepare_thread_row_descendant_click(
  row,
  accessibilityUtils
) {
  if (!accessibilityUtils?.setEnv) {
    return;
  }

  await TestUtils.waitForCondition(
    () => row.parentElement?.getAttribute("role") == "treegrid",
    "thread row should be inside the treegrid"
  );
  await TestUtils.waitForCondition(
    () => row.getAttribute("role") == "row",
    "thread row should expose row semantics"
  );
  if (accessibilityUtils.resetEnv() === undefined) {
    assertAccessibleRole(
      row,
      Ci.nsIAccessibleRole.ROLE_ROW,
      "thread row should be accessible as a row"
    );
  }

  // The row is the accessible target. The synthesized mouse event can still
  // hit an implementation-only descendant inside the row layout.
  accessibilityUtils.setEnv({ mustHaveAccessibleRule: false });
}

function assertAccessibleRole(node, expectedRole, message) {
  const accessible = getAccessibleForNode(node);
  Assert.ok(accessible, `${message}: accessible object should exist`);
  Assert.equal(accessible?.role, expectedRole, message);
}

function getAccessibleForNode(node) {
  const accessibilityService = Cc[
    "@mozilla.org/accessibilityService;1"
  ].getService(Ci.nsIAccessibilityService);

  const accessible = accessibilityService.getAccessibleFor(node);
  if (accessible) {
    return accessible;
  }

  // The Accessible doesn't exist yet. This can happen because a11y tree
  // mutations happen during refresh driver ticks. Stop the refresh driver from
  // doing its regular ticks and force two refresh driver ticks: the first to
  // let layout update and notify a11y, and the second to let a11y process
  // updates.
  const win = node.ownerDocument.documentGlobal;
  win.windowUtils.advanceTimeAndRefresh(100);
  win.windowUtils.advanceTimeAndRefresh(100);
  win.windowUtils.restoreNormalRefresh();
  return accessibilityService.getAccessibleFor(node);
}
