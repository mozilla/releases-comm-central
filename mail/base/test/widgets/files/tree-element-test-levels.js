/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals PROTO_TREE_VIEW */

// FIXME: Wrap the whole method around the document load listener to prevent the
// undefined state of the "tree-view-table-row" element. This is due to the .mjs
// nature of the class file.
window.addEventListener("load", () => {
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

    get index() {
      return super.index;
    }

    set index(index) {
      super.index = index;
      this.id = this.view.getRowProperties(index);
      this.classList.remove("level0", "level1", "level2");
      this.classList.add(`level${this.view.getLevel(index)}`);
      this.d2.textContent = this.view.getCellText(index, { id: "text" });
    }
  }
  customElements.define("test-row", TestCardRow, { extends: "tr" });

  class TreeItem {
    _children = [];

    constructor(id, text, open = false, level = 0) {
      this._id = id;
      this._text = text;
      this._open = open;
      this._level = level;
    }

    getText() {
      return this._text;
    }

    get open() {
      return this._open;
    }

    get level() {
      return this._level;
    }

    get children() {
      return this._children;
    }

    getProperties() {
      return this._id;
    }

    addChild(treeItem) {
      treeItem._parent = this;
      treeItem._level = this._level + 1;
      this.children.push(treeItem);
    }
  }

  const testView = new PROTO_TREE_VIEW();
  testView._rowMap.push(new TreeItem("row-1", "Item with no children"));
  testView._rowMap.push(new TreeItem("row-2", "Item with children"));
  testView._rowMap.push(new TreeItem("row-3", "Item with grandchildren"));
  testView._rowMap[1].addChild(new TreeItem("row-2-1", "First child"));
  testView._rowMap[1].addChild(new TreeItem("row-2-2", "Second child"));
  testView._rowMap[2].addChild(new TreeItem("row-3-1", "First child"));
  testView._rowMap[2].children[0].addChild(
    new TreeItem("row-3-1-1", "First grandchild")
  );
  testView._rowMap[2].children[0].addChild(
    new TreeItem("row-3-1-2", "Second grandchild")
  );
  testView.toggleOpenState(1);
  testView.toggleOpenState(4);
  testView.toggleOpenState(5);

  const tree = document.getElementById("testTree");
  tree.table.setBodyID("testBody");
  tree.setAttribute("rows", "test-row");
  tree.table.setColumns(TestCardRow.COLUMNS);
  tree.addEventListener("select", () => {
    console.log("select event, selected indices:", tree.selectedIndices);
  });
  tree.view = testView;
});
