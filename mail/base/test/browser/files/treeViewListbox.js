class TestCardRow extends customElements.get("tree-view-listrow") {
  static ROW_HEIGHT = 50;

  static styles = `
    div.d0 {
      height: 36px;
      padding: 7px;
      display: flex;
      align-items: center;
    }
    div.d1 {
      flex: 1;
    }
    div.d1 > div.d2 {
      line-height: 18px;
    }
    div.d1 > div.d3 {
      line-height: 18px;
      font-size: 13.333px;
    }
    :focus {
      outline: 3px solid orangered;
    }
  `;

  static get fragment() {
    if (!this.hasOwnProperty("_fragment")) {
      this._fragment = document.createElement("div");
      this._fragment.classList.add("d0");

      let d1 = document.createElement("div");
      d1.classList.add("d1");
      this._fragment.appendChild(d1);

      let d2 = document.createElement("div");
      d2.classList.add("d2");
      d1.appendChild(d2);

      let d3 = document.createElement("div");
      d3.classList.add("d3");
      d1.appendChild(d3);
    }
    return document.importNode(this._fragment, true);
  }

  constructor() {
    super();
    this.d2 = this.shadowRoot.querySelector(".d2");
    this.d3 = this.shadowRoot.querySelector(".d3");
    this.b1 = this.shadowRoot.querySelector(".b1");
    this.b2 = this.shadowRoot.querySelector(".b2");
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

  setTree() {}
}

window.addEventListener("load", () => {
  let list = document.getElementById("testList");
  list.addEventListener("select", event => {
    console.log("select event, selected indicies:", list.selectedIndicies);
  });
  list.view = new TestView(0, 50);
});
