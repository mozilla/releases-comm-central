/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/checkbox-tree-table-row.mjs";

/**
 * Helper to create a checkable row.
 *
 * @param {string} rowName
 * @param {boolean} checked
 * @param {string[]} [extraProperties=[]]
 * @returns {TreeDataRow}
 */
function makeRow(rowName, checked, extraProperties = []) {
  const props = checked ? ["checked", ...extraProperties] : extraProperties;
  return new TreeDataRow({ name: rowName }, undefined, props);
}

/**
 * Create the test adapter with the fixture rows and attach it to the tree.
 * Called from the test page so that each page load gets a fresh adapter.
 */
function setupTestTree() {
  const adapter = new TreeDataAdapter();

  // Folder A: collapsed, self checked, 1 of 2 children checked → indeterminate.
  // (Design: checked requires *both* self and all descendants checked.)
  const folderA = makeRow("Folder A", true);
  adapter.appendRow(folderA);
  const itemA1 = makeRow("Item A1", true);
  folderA.appendRow(itemA1);
  const itemA2 = makeRow("Item A2", false);
  folderA.appendRow(itemA2);

  // Folder B: collapsed, self checked and all children checked → checked.
  const folderB = makeRow("Folder B", true);
  adapter.appendRow(folderB);
  const itemB1 = makeRow("Item B1", true);
  folderB.appendRow(itemB1);
  const itemB2 = makeRow("Item B2", true);
  folderB.appendRow(itemB2);

  // Folder C: expanded, shows its own explicit state (unchecked).
  const folderC = makeRow("Folder C", false);
  adapter.appendRow(folderC);
  folderC._open = true;
  const itemC1 = makeRow("Item C1", true);
  folderC.appendRow(itemC1);
  const itemC2 = makeRow("Item C2", false);
  folderC.appendRow(itemC2);

  // Item D: leaf, checked.
  adapter.appendRow(makeRow("Item D", true));

  // Item E: leaf, unchecked.
  adapter.appendRow(makeRow("Item E", false));

  // Uncheckable: collapsed, has children but never shows a checkbox.
  const uncheckable = makeRow("Uncheckable", false, ["uncheckable"]);
  adapter.appendRow(uncheckable);
  const itemF1 = makeRow("Item F1", true);
  uncheckable.appendRow(itemF1);

  // Folder G: collapsed, self unchecked, 0 of 2 children checked → unchecked.
  const folderG = makeRow("Folder G", false);
  adapter.appendRow(folderG);
  const itemG1 = makeRow("Item G1", false);
  folderG.appendRow(itemG1);
  const itemG2 = makeRow("Item G2", false);
  folderG.appendRow(itemG2);

  // Folder H: collapsed, self unchecked, 1 of 2 children checked → indeterminate.
  const folderH = makeRow("Folder H", false);
  adapter.appendRow(folderH);
  const itemH1 = makeRow("Item H1", true);
  folderH.appendRow(itemH1);
  const itemH2 = makeRow("Item H2", false);
  folderH.appendRow(itemH2);

  // Folder I: collapsed, 3 levels deep, self and all descendants checked → checked.
  const folderI = makeRow("Folder I", true);
  adapter.appendRow(folderI);
  const subfolderI1 = makeRow("Subfolder I1", true);
  folderI.appendRow(subfolderI1);
  const itemI1a = makeRow("Item I1a", true);
  subfolderI1.appendRow(itemI1a);
  const itemI1b = makeRow("Item I1b", true);
  subfolderI1.appendRow(itemI1b);
  const itemI2 = makeRow("Item I2", true);
  folderI.appendRow(itemI2);

  const tree = document.getElementById("testTree");
  tree.setAttribute("rows", "checkbox-tree-table-row");
  tree.view = adapter;
}

setupTestTree();
