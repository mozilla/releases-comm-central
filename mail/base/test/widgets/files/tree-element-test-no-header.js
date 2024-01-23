/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// FIXME: Wrap the whole method around the document load listener to prevent the
// undefined state of the "tree-view-table-row" element. This is due to the .mjs
// nature of the class file.
window.addEventListener("load", () => {
  class TestCardRow extends customElements.get("tree-view-table-row") {
    static ROW_HEIGHT = 50;

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

      this.d1 = container.appendChild(document.createElement("div"));
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
  customElements.define("test-row", TestCardRow, { extends: "tr" });

  const tree = document.getElementById("testTree");
  tree.setAttribute("rows", "test-row");
  tree.table.setColumns(TestCardRow.COLUMNS);
});
