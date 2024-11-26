/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

import {
  TreeDataAdapter,
  TreeDataRow,
} from "chrome://messenger/content/TreeDataAdapter.mjs";
// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/tree-view.mjs";

class TestCardRow extends customElements.get("tree-view-table-row") {
  static ROW_HEIGHT = 30;

  static COLUMNS = [
    {
      id: "testCol",
    },
  ];

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.cell = this.appendChild(document.createElement("td"));
    const container = this.cell.appendChild(document.createElement("div"));

    this.threader = container.appendChild(document.createElement("button"));
    this.threader.textContent = "↳";
    this.threader.classList.add("tree-button-thread");

    this.twisty = container.appendChild(document.createElement("div"));
    this.twisty.textContent = "v";
    this.twisty.classList.add("twisty");

    this.d2 = container.appendChild(document.createElement("div"));
    this.d2.classList.add("d2");
  }

  _fillRow() {
    super._fillRow();

    this.id = this.view.getRowProperties(this._index);
    this.classList.remove("level0", "level1", "level2");
    this.classList.add(`level${this.view.getLevel(this._index)}`);
    this.d2.textContent = this.view.getCellText(this._index, "text");
  }
}
customElements.define("test-row", TestCardRow, { extends: "tr" });

class TreeItem extends TreeDataRow {
  constructor(id, text) {
    super({ text });
    this.id = id;
  }

  getProperties() {
    return this.id;
  }

  appendRows(count) {
    for (let i = 1; i <= count; i++) {
      this.appendRow(new TreeItem(`${this.id}-${i}`, `Child #${i}`));
    }
  }
}

const testView = new TreeDataAdapter();
testView._rowMap.push(new TreeItem("row-1", "Item with no children"));
testView._rowMap.push(new TreeItem("row-2", "Item with no children"));
testView._rowMap.push(new TreeItem("row-3", "Item with children"));
testView._rowMap[2].appendRows(5);
testView._rowMap.push(new TreeItem("row-4", "Item with children"));
testView._rowMap[3].appendRows(30);
testView._rowMap.push(new TreeItem("row-5", "Item with no children"));
testView._rowMap.push(new TreeItem("row-6", "Item with no children"));
testView._rowMap.push(new TreeItem("row-7", "Item with no children"));
testView._rowMap.push(new TreeItem("row-8", "Item with no children"));
testView._rowMap.push(new TreeItem("row-9", "Item with children"));
testView._rowMap[8].appendRows(5);
testView._rowMap.push(new TreeItem("row-10", "Item with no children"));
testView._rowMap.push(new TreeItem("row-11", "Item with no children"));
testView._rowMap.push(new TreeItem("row-12", "Item with no children"));
testView._rowMap.push(new TreeItem("row-13", "Item with no children"));
testView._rowMap.push(new TreeItem("row-14", "Item with children"));
testView._rowMap[13].appendRows(15);
testView._rowMap.push(new TreeItem("row-15", "Item with no children"));

testView.toggleOpenState(13);

const tree = document.getElementById("testTree");
tree.table.setBodyID("testBody");
tree.setAttribute("rows", "test-row");
tree.table.setColumns(TestCardRow.COLUMNS);
tree.addEventListener("select", () => {
  console.log("select event, selected indices:", tree.selectedIndices);
});
tree.view = testView;
