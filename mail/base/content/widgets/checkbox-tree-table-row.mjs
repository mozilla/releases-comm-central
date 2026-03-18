/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

const { TreeViewTableRow } = ChromeUtils.importESModule(
  "chrome://messenger/content/tree-view.mjs",
  { global: "current" }
);
const { UIDensity } = ChromeUtils.importESModule(
  "resource:///modules/UIDensity.sys.mjs"
);

/**
 * Rows containing an icon, a label, and a checkbox. For use in a BaseTreeView.
 */
class CheckboxTreeTableRow extends TreeViewTableRow {
  static ROW_HEIGHTS = {
    [UIDensity.MODE_COMPACT]: 18,
    [UIDensity.MODE_NORMAL]: 22,
    [UIDensity.MODE_TOUCH]: 32,
  };
  static ROW_HEIGHT = this.ROW_HEIGHTS[UIDensity.prefValue];

  static #rowFragment;
  static get rowFragment() {
    if (this.#rowFragment) {
      return this.#rowFragment;
    }
    this.#rowFragment = document.createDocumentFragment();
    const cell = this.#rowFragment.appendChild(document.createElement("td"));

    const container = cell.appendChild(document.createElement("div"));
    container.classList.add("container");

    const twistyButton = container.appendChild(
      document.createElement("button")
    );
    twistyButton.type = "button";
    twistyButton.classList.add("button", "button-flat", "twisty");

    const label = container.appendChild(document.createElement("label"));
    label.appendChild(document.createElement("img")).classList.add("icon");
    label.appendChild(document.createElement("span"));
    label.appendChild(document.createElement("input")).type = "checkbox";

    return this.#rowFragment;
  }

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }

    super.connectedCallback();
    this.classList.add("table-layout");
    this.append(this.constructor.rowFragment.cloneNode(true));

    this.addEventListener("keydown", event => {
      if (event.key == "ArrowUp") {
        // Jump to the previous row, if there is one.
        this.previousElementSibling?.querySelector("input")?.focus();
        event.preventDefault();
      } else if (event.key == "ArrowDown") {
        // Jump to the next row, if there is one.
        this.nextElementSibling?.querySelector("input")?.focus();
        event.preventDefault();
      }
    });
  }

  fillRow() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    const viewRow = this.view.rowAt(this._index);
    const twistyButton = this.querySelector("button.twisty");
    const container = this.querySelector("div.container");
    const span = container.querySelector("span");
    const checkbox = container.querySelector(`input[type="checkbox"]`);
    if (Services.appinfo.accessibilityEnabled || Cu.isInAutomation) {
      twistyButton.ariaRowIndex = checkbox.ariaRowIndex = this._index + 1;
      twistyButton.ariaLevel = checkbox.ariaLevel = viewRow.level + 1;
      twistyButton.ariaSetSize = checkbox.ariaSetSize = viewRow.setSize;
      twistyButton.ariaPosInSet = checkbox.ariaPosInSet = viewRow.posInSet + 1;
    }
    this.id = `${this.list.id}-row${this._index}`;

    const isGroup = viewRow.children.length > 0;
    this.classList.toggle("children", isGroup);

    const isGroupOpen = viewRow.open;
    twistyButton.ariaExpanded = isGroup ? isGroupOpen : null;
    this.classList.toggle("collapsed", !isGroupOpen);

    this.dataset.properties = [...viewRow.properties].join(" ");

    twistyButton.ariaLabel = viewRow.texts.name;
    if (!this._twistyAnimating) {
      const twistyIcon = document.createElement("img");
      twistyIcon.classList.add("twisty-icon");
      twistyButton.replaceChildren(twistyIcon);
    }
    delete this._twistyAnimating;

    container.style.paddingInlineStart = viewRow.level * 16 + 3 + "px";
    span.textContent = viewRow.texts.name;

    checkbox.hidden = viewRow.hasProperty("uncheckable");
    checkbox.checked = viewRow.hasProperty("checked");
    checkbox.onchange = () => {
      viewRow.toggleProperty("checked", checkbox.checked);
      this.dataset.properties = [...viewRow.properties].join(" ");
    };
  }
}
customElements.define("checkbox-tree-table-row", CheckboxTreeTableRow, {
  extends: "tr",
});
