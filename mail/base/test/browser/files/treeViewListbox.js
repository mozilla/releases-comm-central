class TestCardRow extends customElements.get("tree-view-listrow") {
  static ROW_HEIGHT = 50;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.d1 = this.appendChild(document.createElement("div"));
    this.d1.classList.add("d1");

    this.d2 = this.d1.appendChild(document.createElement("div"));
    this.d2.classList.add("d2");

    this.d3 = this.d1.appendChild(document.createElement("div"));
    this.d3.classList.add("d3");
  }

  get index() {
    return super.index;
  }

  set index(index) {
    super.index = index;
    this.d2.textContent = this.view.getCellText(index, {
      id: "GeneratedName",
    });
    this.d3.textContent = this.view.getCellText(index, {
      id: "PrimaryEmail",
    });
    this.dataset.value = this.view.values[index];
  }
}
customElements.define("test-listrow", TestCardRow);

class TestView {
  values = [];

  constructor(start, count) {
    for (let i = start; i < start + count; i++) {
      this.values.push(i);
    }
  }

  get rowCount() {
    return this.values.length;
  }

  getCellText(index, column) {
    return `${column.id} ${this.values[index]}`;
  }

  isContainer() {
    return false;
  }

  isContainerOpen() {
    return false;
  }

  selectionChanged() {}

  setTree() {}
}

window.addEventListener("load", () => {
  let list = document.getElementById("testList");
  list.addEventListener("select", event => {
    console.log("select event, selected indicies:", list.selectedIndicies);
  });
  list.view = new TestView(0, 50);
});
