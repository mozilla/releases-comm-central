/* globals PROTO_TREE_VIEW */

class TestCardRow extends customElements.get("tree-view-listrow") {
  static ROW_HEIGHT = 30;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.twisty = this.appendChild(document.createElement("div"));
    this.twisty.classList.add("twisty");

    this.d2 = this.appendChild(document.createElement("div"));
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
customElements.define("test-listrow", TestCardRow);

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

let testView = new PROTO_TREE_VIEW();
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

window.addEventListener("load", () => {
  let list = document.getElementById("testList");
  list.addEventListener("select", event => {
    console.log("select event, selected indicies:", list.selectedIndicies);
  });
  list.view = testView;
});
