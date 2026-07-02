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

    // Listen for any 'change' event bubbling up from inside this row.
    this.addEventListener("change", event => {
      if (event.target.type === "checkbox") {
        this.#handleCheckboxToggle(event.target.checked);
      }
    });

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

    // Now update dataset so CSS catches the properties.
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
    const selfChecked = viewRow.hasProperty("checked");

    if (isGroup && !isGroupOpen) {
      // Collapsed node: display aggregate state of the subtree.
      const checkedState = this.#initializeDescendants(viewRow);

      const anyChecked = selfChecked || checkedState != "none";
      const allChecked = selfChecked && checkedState == "all";

      checkbox.checked = allChecked;
      checkbox.indeterminate = !allChecked && anyChecked;
    } else {
      // Expanded or leaf node.
      checkbox.checked = selfChecked;
      checkbox.indeterminate = false;
    }
  }

  #handleCheckboxToggle(isChecked) {
    const viewRow = this.view.rowAt(this._index);
    if (!viewRow) {
      return;
    }

    // Always explicitly toggle the row the user actually clicked.
    viewRow.toggleProperty("checked", isChecked);

    // Only cascade down if the row is collapsed.
    if (!viewRow.open) {
      this.#cascadeDown(viewRow, isChecked);

      // Because we just forced all descendants to match `isChecked`,
      // we must manually update this specific row's summary cache.
      if (viewRow.children && viewRow.children.length > 0) {
        viewRow.toggleProperty("descendants-all-checked", isChecked);
        viewRow.toggleProperty("descendants-some-checked", false);
        viewRow.toggleProperty("descendants-none-checked", !isChecked);
      }
    }

    // Ripple the calculation up so parents know descendants changed.
    if (viewRow.parent) {
      this.#evaluateUpward(viewRow.parent);
    }

    // Force a fast visual repaint of the visible rows.
    if (this.parentElement) {
      for (const tr of this.parentElement.children) {
        if (typeof tr.fillRow === "function") {
          tr.fillRow();
        }
      }
    }
  }

  /**
   * Forces all descendants to match the parent's explicit state.
   *
   * @param {TreeDataRow} dataRow
   * @param {boolean} isChecked
   */
  #cascadeDown(dataRow, isChecked) {
    if (!dataRow.children) {
      return;
    }
    for (const child of dataRow.children) {
      if (child && !child.hasProperty("uncheckable")) {
        child.toggleProperty("checked", isChecked);

        // Keep the cache accurate so upward ripples aren't corrupted.
        if (child.children && child.children.length > 0) {
          child.toggleProperty("descendants-all-checked", isChecked);
          child.toggleProperty("descendants-some-checked", false);
          child.toggleProperty("descendants-none-checked", !isChecked);
        }
      }
      this.#cascadeDown(child, isChecked);
    }
  }

  /**
   * Compute the aggregate checked state of `dataRow`'s immediate children.
   * Used by both #initializeDescendants (deep, once-per-node) and
   * #evaluateUpward (shallow, on every toggle).
   *
   * @param {TreeDataRow} dataRow
   * @returns {{ allChecked: boolean, someChecked: boolean, checkableChildren: number }}
   */
  #computeChildAggregate(dataRow) {
    let allChecked = true;
    let someChecked = false;
    let checkableChildren = 0;

    for (const child of dataRow.children) {
      if (child && !child.hasProperty("uncheckable")) {
        checkableChildren++;

        const explicitlyChecked = child.hasProperty("checked");
        const childAll = child.hasProperty("descendants-all-checked");
        const childSome = child.hasProperty("descendants-some-checked");

        if (explicitlyChecked || childAll || childSome) {
          someChecked = true;
        }
        if (!explicitlyChecked || (child.children.length > 0 && !childAll)) {
          allChecked = false;
        }
      }
    }

    return { allChecked, someChecked, checkableChildren };
  }

  /**
   * Ensure descendant checked state is computed for `dataRow` and return
   * the aggregate state of its subtree.
   *
   * @param {TreeDataRow} dataRow
   * @returns {"all"|"some"|"none"}
   */
  #initializeDescendants(dataRow) {
    // If already evaluated, return the cached state.
    if (dataRow.hasProperty("descendants-all-checked")) {
      return "all";
    }
    if (dataRow.hasProperty("descendants-some-checked")) {
      return "some";
    }
    if (dataRow.hasProperty("descendants-none-checked")) {
      return "none";
    }

    if (!dataRow.children || dataRow.children.length === 0) {
      return "none";
    }

    // Recurse into checkable children first so their descendants-* caches
    // are populated before we compute this row's aggregate.
    for (const child of dataRow.children) {
      if (child && !child.hasProperty("uncheckable")) {
        this.#initializeDescendants(child);
      }
    }

    const { allChecked, someChecked, checkableChildren } =
      this.#computeChildAggregate(dataRow);

    if (checkableChildren === 0) {
      dataRow.addProperty("descendants-none-checked");
      return "none";
    }

    if (allChecked) {
      dataRow.addProperty("descendants-all-checked");
      return "all";
    }
    if (someChecked) {
      dataRow.addProperty("descendants-some-checked");
      return "some";
    }
    dataRow.addProperty("descendants-none-checked");
    return "none";
  }

  /**
   * Ripples evaluation up the tree after a checkbox click.
   * Only checks immediate children (their caches are already accurate) and
   * bails out early if the parent's aggregate state didn't change.
   *
   * @param {TreeDataRow} dataRow
   */
  #evaluateUpward(dataRow) {
    if (!dataRow || !dataRow.children) {
      return;
    }

    const { allChecked, someChecked, checkableChildren } =
      this.#computeChildAggregate(dataRow);

    if (checkableChildren === 0) {
      return;
    }

    let newState;
    if (allChecked) {
      newState = "all";
    } else if (someChecked) {
      newState = "some";
    } else {
      newState = "none";
    }

    let oldState;
    if (dataRow.hasProperty("descendants-all-checked")) {
      oldState = "all";
    } else if (dataRow.hasProperty("descendants-some-checked")) {
      oldState = "some";
    } else {
      oldState = "none";
    }

    // Short-circuit: if the parent's state didn't change, stop the ripple.
    // The grandparents do not need to be re-evaluated.
    if (newState === oldState) {
      return;
    }

    dataRow.toggleProperty("descendants-all-checked", newState === "all");
    dataRow.toggleProperty("descendants-some-checked", newState === "some");
    dataRow.toggleProperty("descendants-none-checked", newState === "none");

    if (dataRow.parent) {
      this.#evaluateUpward(dataRow.parent);
    }
  }
}
customElements.define("checkbox-tree-table-row", CheckboxTreeTableRow, {
  extends: "tr",
});
