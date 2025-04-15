/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { BrowserTestUtils } from "resource://testing-common/BrowserTestUtils.sys.mjs";

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
