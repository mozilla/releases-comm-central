/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Assert } from "resource://testing-common/Assert.sys.mjs";
import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";
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
