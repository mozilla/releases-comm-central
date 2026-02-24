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
  }

  fillRow() {
    if (this._animationFrame) {
      cancelAnimationFrame(this._animationFrame);
      this._animationFrame = null;
    }

    const viewRow = this.view.rowAt(this._index);
    const twistyButton = this.querySelector("button.twisty");
    const checkbox = this.querySelector(`input[type="checkbox"]`);
    if (Services.appinfo.accessibilityEnabled || Cu.isInAutomation) {
      this.ariaLevel =
        twistyButton.ariaLevel =
        checkbox.ariaLevel =
          viewRow.level + 1;
      this.ariaSetSize =
        twistyButton.ariaSetSize =
        checkbox.ariaSetSize =
          viewRow.setSize;
      this.ariaPosInSet =
        twistyButton.ariaPosInSet =
        checkbox.ariaPosInSet =
          viewRow.posInSet + 1;
    }
    this.id = `${this.list.id}-row${this._index}`;

    const isGroup = viewRow.children.length > 0;
    this.classList.toggle("children", isGroup);

    const isGroupOpen = viewRow.open;
    this.ariaExpanded = twistyButton.ariaExpanded = isGroup
      ? isGroupOpen
      : null;
    this.classList.toggle("collapsed", !isGroupOpen);

    this.dataset.properties = [...viewRow.properties].join(" ");

    twistyButton.ariaLabel = viewRow.texts.name;
    if (!this._twistyAnimating) {
      const twistyIcon = document.createElement("img");
      twistyIcon.classList.add("twisty-icon");
      twistyButton.replaceChildren(twistyIcon);
    }
    delete this._twistyAnimating;

    this.querySelector("div.container").style.paddingInlineStart =
      viewRow.level * 16 + 3 + "px";
    this.querySelector("span").textContent = viewRow.texts.name;

    checkbox.checked = viewRow.hasProperty("checked");
    checkbox.onchange = () => {
      viewRow.toggleProperty("checked", checkbox.checked);
      this.dataset.properties = [...viewRow.properties].join(" ");
    };

    this.querySelector("td").ariaLabel = viewRow.texts.name;
  }
}
customElements.define("checkbox-tree-table-row", CheckboxTreeTableRow, {
  extends: "tr",
});
