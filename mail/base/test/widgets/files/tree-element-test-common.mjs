/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

// eslint-disable-next-line import/no-unassigned-import
import "chrome://messenger/content/tree-view.mjs";

class TestCardRow extends customElements.get("tree-view-table-row") {
  static ROW_HEIGHT = 50;

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

  _fillRow() {
    super._fillRow();

    this.d2.textContent = this.view.getCellText(this._index, "GeneratedName");
    this.d3.textContent = this.view.getCellText(this._index, "PrimaryEmail");
    this.dataset.value = this.view.values[this._index];
  }
}
customElements.define("test-row", TestCardRow, { extends: "tr" });

class AlternativeCardRow extends customElements.get("tree-view-table-row") {
  static ROW_HEIGHT = 80;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();

    this.cell = this.appendChild(document.createElement("td"));
  }

  _fillRow() {
    super._fillRow();

    this.cell.textContent = this.view.getCellText(this._index, "GeneratedName");
  }
}
customElements.define("alternative-row", AlternativeCardRow, {
  extends: "tr",
});

export class TestView {
  values = [];

  constructor(start, count) {
    for (let i = start; i < start + count; i++) {
      this.values.push(i);
    }
  }

  get rowCount() {
    return this.values.length;
  }

  getCellText(index, columnID) {
    return `${columnID} ${this.values[index]}`;
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
