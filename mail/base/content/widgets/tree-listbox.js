/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  /**
   * Provides keyboard and mouse interaction to a (possibly nested) list.
   * It is intended for lists with a small number (up to 1000?) of items.
   * Only one item can be selected at a time. Maintenance of the items in the
   * list is not managed here. Styling of the list is not managed here.
   *
   * The following class names apply to list items:
   * - selected: Indicates the currently selected list item.
   * - children: If the list item has descendants.
   * - collapsed: If the list item's descendants are hidden.
   *
   * List items can provide their own twisty element, which will operate when
   * clicked on if given the class name "twisty".
   *
   * Note that behaviour is undefined if there are no rows. This may need to
   * be fixed in future but no current use case ever has no rows.
   */
  class TreeListbox extends HTMLUListElement {
    /**
     * The index of the selected row. This should always have a value between
     * 0 and `rowCount - 1`. It is set to 0 in `connectedCallback`.
     *
     * @type {integer}
     */
    _selectedIndex;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this.setAttribute("is", "tree-listbox");
      this.setAttribute("role", "listbox");
      this.setAttribute(
        "aria-keyshortcuts",
        "Up Down Left Right PageUp PageDown Home End"
      );
      this.tabIndex = 0;

      /**
       * Adds the 'option' role and 'children' class to `ancestor` if
       * appropriate and any descendants that are list items.
       */
      function initRows(ancestor) {
        let descendants = ancestor.querySelectorAll("li");

        if (ancestor.localName == "li") {
          ancestor.setAttribute("role", "option");
          if (descendants.length > 0) {
            ancestor.classList.add("children");
          }
        }

        for (let i = 0; i < descendants.length - 1; i++) {
          let row = descendants[i];
          row.setAttribute("role", "option");
          if (i + 1 < descendants.length && row.contains(descendants[i + 1])) {
            row.classList.add("children");
          }
        }
      }
      initRows(this);

      // There should always be a selected item. How this works for lists
      // without any items is at this stage undefined.
      this.selectedIndex = 0;

      this.addEventListener("click", event => {
        if (event.button !== 0) {
          return;
        }

        let row = event.target.closest("li");
        if (!row) {
          return;
        }

        if (
          row.classList.contains("children") &&
          event.target.closest(".twisty")
        ) {
          let rowIndex = this.rows.indexOf(row);
          let didCollapse = row.classList.toggle("collapsed");
          if (didCollapse && row.querySelector("ul > li.selected")) {
            // The selected row was hidden. Select the visible ancestor of it.
            this.selectedIndex = rowIndex;
          } else if (this.selectedIndex > rowIndex) {
            // Rows above the selected row have appeared or disappeared.
            // Update the index of the selected row, but don't fire a 'select'
            // event.
            this._selectedIndex = this.rows.indexOf(
              this.querySelector("li.selected")
            );
          }
          return;
        }

        this.selectedIndex = this.rows.findIndex(r => r == row);
      });

      this.addEventListener("keydown", event => {
        if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
          return;
        }

        switch (event.key) {
          case "ArrowUp":
            this.selectedIndex = this._clampIndex(this.selectedIndex - 1);
            break;
          case "ArrowDown":
            this.selectedIndex = this._clampIndex(this.selectedIndex + 1);
            break;
          case "Home":
            this.selectedIndex = 0;
            break;
          case "End":
            this.selectedIndex = this.rowCount - 1;
            break;
          case "PageUp": {
            // Get the top of the selected row, and remove the page height.
            let selectedBox = this.getRowAtIndex(
              this.selectedIndex
            ).getBoundingClientRect();
            let y = selectedBox.top - this.clientHeight;

            // Find the last row below there.
            let rows = this.rows;
            let i = this.selectedIndex - 1;
            while (i > 0 && rows[i].getBoundingClientRect().top >= y) {
              i--;
            }
            this.selectedIndex = i;
            break;
          }
          case "PageDown": {
            // Get the top of the selected row, and add the page height.
            let selectedBox = this.getRowAtIndex(
              this.selectedIndex
            ).getBoundingClientRect();
            let y = selectedBox.top + this.clientHeight;

            // Find the last row below there.
            let rows = this.rows;
            let i = this.rowCount - 1;
            while (
              i > this.selectedIndex &&
              rows[i].getBoundingClientRect().top >= y
            ) {
              i--;
            }
            this.selectedIndex = i;
            break;
          }
          case "ArrowLeft": {
            let selected = this.getRowAtIndex(this.selectedIndex);
            let parent = selected.parentNode.closest(".children");
            if (
              parent &&
              (!selected.classList.contains("children") ||
                selected.classList.contains("collapsed"))
            ) {
              this.selectedIndex = this.rows.indexOf(parent);
              break;
            }
            if (selected.classList.contains("children")) {
              selected.classList.toggle("collapsed", true);
            }
            break;
          }
          case "ArrowRight": {
            let selected = this.getRowAtIndex(this.selectedIndex);
            if (selected.classList.contains("children")) {
              if (selected.classList.contains("collapsed")) {
                selected.classList.remove("collapsed");
              } else {
                this.selectedIndex = this.rows.indexOf(
                  selected.querySelector("li")
                );
              }
            }
            break;
          }
          default:
            return;
        }

        event.preventDefault();
      });

      let observer = new MutationObserver(mutations => {
        for (let mutation of mutations) {
          let ancestor = mutation.target.closest("li");

          for (let node of mutation.addedNodes) {
            if (node.localName == "li") {
              initRows(node);
              if (ancestor) {
                ancestor.classList.add("children");
              }
            }
          }

          if (!ancestor) {
            continue;
          }

          for (let node of mutation.removedNodes) {
            if (
              node.localName == "ul" ||
              (node.localName == "li" && !mutation.target.querySelector("li"))
            ) {
              ancestor.classList.remove("children");
              ancestor.classList.remove("collapsed");
            }
          }
        }
      });
      observer.observe(this, { subtree: true, childList: true });
    }

    /**
     * Every visible row. Rows with collapsed ancestors are not included.
     *
     * @type {HTMLLIElement[]}
     */
    get rows() {
      return [...this.querySelectorAll("li")].filter(
        r => !r.parentNode.closest(".collapsed")
      );
    }

    /**
     * The number of visible rows.
     *
     * @type {integer}
     */
    get rowCount() {
      return this.rows.length;
    }

    /**
     * Clamps `index` to a value between 0 and `rowCount - 1`.
     *
     * @param {integer} index
     * @return {integer}
     */
    _clampIndex(index) {
      if (index >= this.rowCount) {
        return this.rowCount - 1;
      }
      if (index < 0) {
        return 0;
      }
      return index;
    }

    /**
     * Ensures that the row at `index` is on the screen.
     *
     * @param {integer} index
     */
    scrollToIndex(index) {
      this.getRowAtIndex(index)?.scrollIntoView({ block: "nearest" });
    }

    /**
     * Returns the row element at `index` or null if `index` is out of range.
     *
     * @param {integer} index
     * @return {HTMLLIElement?}
     */
    getRowAtIndex(index) {
      return this.rows[index];
    }

    /**
     * The index of the selected row. This should always have a value between
     * 0 and `rowCount - 1`. It is set to 0 in `connectedCallback`.
     *
     * @type {integer}
     */
    get selectedIndex() {
      return this._selectedIndex;
    }

    set selectedIndex(index) {
      index = this._clampIndex(index);
      if (index == this._selectedIndex) {
        return;
      }

      let current = this.querySelector(".selected");
      if (current) {
        current.classList.remove("selected");
        current.setAttribute("aria-selected", false);
      }

      let row = this.getRowAtIndex(index);
      row.classList.add("selected");
      row.setAttribute("aria-selected", true);
      this.setAttribute("aria-activedescendant", row.id);
      this.scrollToIndex(index);

      this._selectedIndex = index;
      if (current != row) {
        this.dispatchEvent(new CustomEvent("select"));
      }
    }
  }
  customElements.define("tree-listbox", TreeListbox, { extends: "ul" });
}
