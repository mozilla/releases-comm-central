/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* globals MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  /**
   * Extends the built-in `toolbar` element to allow it to be customized.
   *
   * @augments {MozXULElement}
   */
  class CustomizableToolbar extends MozXULElement {
    connectedCallback() {
      if (this.delayConnectedCallback() || this._hasConnected) {
        return;
      }
      this._hasConnected = true;

      this._toolbox = null;
      this._newElementCount = 0;

      // Search for the toolbox palette in the toolbar binding because
      // toolbars are constructed first.
      const toolbox = this.toolbox;
      if (!toolbox) {
        return;
      }

      if (!toolbox.palette) {
        // Look to see if there is a toolbarpalette.
        let node = toolbox.firstElementChild;
        while (node) {
          if (node.localName == "toolbarpalette") {
            break;
          }
          node = node.nextElementSibling;
        }

        if (!node) {
          return;
        }

        // Hold on to the palette but remove it from the document.
        toolbox.palette = node;
        toolbox.removeChild(node);
      }

      // Build up our contents from the palette.
      const currentSet =
        this.getAttribute("currentset") || this.getAttribute("defaultset");

      if (currentSet) {
        this.currentSet = currentSet;
      }
    }

    /**
     * Get the toolbox element connected to this toolbar.
     *
     * @returns {Element?} The toolbox element or null.
     */
    get toolbox() {
      if (this._toolbox) {
        return this._toolbox;
      }

      const toolboxId = this.getAttribute("toolboxid");
      if (toolboxId) {
        const toolbox = document.getElementById(toolboxId);
        if (!toolbox) {
          const tbName = this.hasAttribute("toolbarname")
            ? ` (${this.getAttribute("toolbarname")})`
            : "";

          throw new Error(
            `toolbar ID ${this.id}${tbName}: toolboxid attribute '${toolboxId}' points to a toolbox that doesn't exist`
          );
        }
        this._toolbox = toolbox;
        return this._toolbox;
      }

      this._toolbox =
        this.parentNode && this.parentNode.localName == "toolbox"
          ? this.parentNode
          : null;

      return this._toolbox;
    }

    /**
     * Sets the current set of items in the toolbar.
     *
     * @param {string} val - Comma-separated list of IDs or "__empty".
     * @returns {string} Comma-separated list of IDs or "__empty".
     */
    set currentSet(val) {
      if (val == this.currentSet) {
        return;
      }

      // Build a cache of items in the toolbarpalette.
      const palette = this.toolbox ? this.toolbox.palette : null;
      const paletteChildren = palette ? palette.children : [];

      const paletteItems = {};

      for (const item of paletteChildren) {
        paletteItems[item.id] = item;
      }

      const ids = val == "__empty" ? [] : val.split(",");
      const children = this.children;
      let nodeidx = 0;
      const added = {};

      // Iterate over the ids to use on the toolbar.
      for (const id of ids) {
        // Iterate over the existing nodes on the toolbar. nodeidx is the
        // spot where we want to insert items.
        let found = false;
        for (let i = nodeidx; i < children.length; i++) {
          const curNode = children[i];
          if (this._idFromNode(curNode) == id) {
            // The node already exists. If i equals nodeidx, we haven't
            // iterated yet, so the item is already in the right position.
            // Otherwise, insert it here.
            if (i != nodeidx) {
              this.insertBefore(curNode, children[nodeidx]);
            }

            added[curNode.id] = true;
            nodeidx++;
            found = true;
            break;
          }
        }
        if (found) {
          // Move on to the next id.
          continue;
        }

        // The node isn't already on the toolbar, so add a new one.
        const nodeToAdd = paletteItems[id] || this._getToolbarItem(id);
        if (nodeToAdd && !(nodeToAdd.id in added)) {
          added[nodeToAdd.id] = true;
          this.insertBefore(nodeToAdd, children[nodeidx] || null);
          nodeToAdd.setAttribute("removable", "true");
          nodeidx++;
        }
      }

      // Remove any leftover removable nodes.
      for (let i = children.length - 1; i >= nodeidx; i--) {
        const curNode = children[i];

        const curNodeId = this._idFromNode(curNode);
        // Skip over fixed items.
        if (curNodeId && curNode.getAttribute("removable") == "true") {
          if (palette) {
            palette.appendChild(curNode);
          } else {
            this.removeChild(curNode);
          }
        }
      }
    }

    /**
     * Gets the current set of items in the toolbar.
     *
     * @returns {string} Comma-separated list of IDs or "__empty".
     */
    get currentSet() {
      let node = this.firstElementChild;
      const currentSet = [];
      while (node) {
        const id = this._idFromNode(node);
        if (id) {
          currentSet.push(id);
        }
        node = node.nextElementSibling;
      }

      return currentSet.join(",") || "__empty";
    }

    /**
     * Return the ID for a given toolbar item node, with special handling for
     * some cases.
     *
     * @param {Element} node - Return the ID of this node.
     * @returns {string} The ID of the node.
     */
    _idFromNode(node) {
      if (node.getAttribute("skipintoolbarset") == "true") {
        return "";
      }
      const specialItems = {
        toolbarseparator: "separator",
        toolbarspring: "spring",
        toolbarspacer: "spacer",
      };
      return specialItems[node.localName] || node.id;
    }

    /**
     * Returns a toolbar item based on the given ID.
     *
     * @param {string} id - The ID for the new toolbar item.
     * @returns {Element?} The toolbar item corresponding to the ID, or null.
     */
    _getToolbarItem(id) {
      // Handle special cases.
      if (["separator", "spring", "spacer"].includes(id)) {
        const newItem = document.createXULElement("toolbar" + id);
        // Due to timers resolution Date.now() can be the same for
        // elements created in small timeframes.  So ids are
        // differentiated through a unique count suffix.
        newItem.id = id + Date.now() + ++this._newElementCount;
        if (id == "spring") {
          newItem.flex = 1;
        }
        return newItem;
      }

      const toolbox = this.toolbox;
      if (!toolbox) {
        return null;
      }

      // Look for an item with the same id, as the item may be
      // in a different toolbar.
      const item = document.getElementById(id);
      if (
        item &&
        item.parentNode &&
        item.parentNode.localName == "toolbar" &&
        item.parentNode.toolbox == toolbox
      ) {
        return item;
      }

      if (toolbox.palette) {
        // Attempt to locate an item with a matching ID within the palette.
        let paletteItem = toolbox.palette.firstElementChild;
        while (paletteItem) {
          if (paletteItem.id == id) {
            return paletteItem;
          }
          paletteItem = paletteItem.nextElementSibling;
        }
      }
      return null;
    }

    /**
     * Insert an item into the toolbar.
     *
     * @param {string} id - The ID of the item to insert.
     * @param {Element?} beforeElt - Optional element to insert the item before.
     * @param {Element?} wrapper - Optional wrapper element.
     * @returns {Element} The inserted item.
     */
    insertItem(id, beforeElt, wrapper) {
      const newItem = this._getToolbarItem(id);
      if (!newItem) {
        return null;
      }

      let insertItem = newItem;
      // Make sure added items are removable.
      newItem.setAttribute("removable", "true");

      // Wrap the item in another node if so inclined.
      if (wrapper) {
        wrapper.appendChild(newItem);
        insertItem = wrapper;
      }

      // Insert the palette item into the toolbar.
      if (beforeElt) {
        this.insertBefore(insertItem, beforeElt);
      } else {
        this.appendChild(insertItem);
      }
      return newItem;
    }

    /**
     * Determine whether the current set of toolbar items has custom
     * interactive items or not.
     *
     * @param {string} currentSet - Comma-separated list of IDs or "__empty".
     * @returns {boolean} Whether the current set has custom interactive items.
     */
    hasCustomInteractiveItems(currentSet) {
      if (currentSet == "__empty") {
        return false;
      }

      const defaultOrNoninteractive = (this.getAttribute("defaultset") || "")
        .split(",")
        .concat(["separator", "spacer", "spring"]);

      return currentSet
        .split(",")
        .some(item => !defaultOrNoninteractive.includes(item));
    }
  }

  customElements.define("customizable-toolbar", CustomizableToolbar, {
    extends: "toolbar",
  });
}
