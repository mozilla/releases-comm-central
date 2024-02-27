/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals MozElements, MozXULElement */

"use strict";

// Wrap in a block to prevent leaking to window scope.
{
  const MozPopupElement = MozElements.MozElementMixin(XULPopupElement);

  /**
   * The MozGlodacompleteRichResultPopup class creates the panel
   * to append all the results for the gloda search autocomplete.
   *
   * @augments {MozPopupElement}
   */
  class MozGlodacompleteRichResultPopup extends MozPopupElement {
    constructor() {
      super();

      this.addEventListener("popupshowing", event => {
        // If normalMaxRows wasn't already set by the input, then set it here
        // so that we restore the correct number when the popup is hidden.

        // Null-check this.mInput; see bug 1017914
        if (this._normalMaxRows < 0 && this.mInput) {
          this._normalMaxRows = this.mInput.maxRows;
        }

        this.mPopupOpen = true;
      });

      this.addEventListener("popupshown", event => {
        if (this._adjustHeightOnPopupShown) {
          delete this._adjustHeightOnPopupShown;
          this.adjustHeight();
        }
      });

      this.addEventListener("popuphiding", event => {
        let isListActive = true;
        if (this.selectedIndex == -1) {
          isListActive = false;
        }
        this.mInput.controller.stopSearch();
        this.mPopupOpen = false;

        // Reset the maxRows property to the cached "normal" value (if there's
        // any), and reset normalMaxRows so that we can detect whether it was set
        // by the input when the popupshowing handler runs.

        // Null-check this.mInput; see bug 1017914
        if (this.mInput && this._normalMaxRows > 0) {
          this.mInput.maxRows = this._normalMaxRows;
        }
        this._normalMaxRows = -1;
        // If the list was being navigated and then closed, make sure
        // we fire accessible focus event back to textbox

        // Null-check this.mInput; see bug 1017914
        if (isListActive && this.mInput) {
          this.mInput.mIgnoreFocus = true;
          this.mInput._focus();
          this.mInput.mIgnoreFocus = false;
        }
      });

      this.attachShadow({ mode: "open" });

      const slot = document.createElement("slot");
      slot.part = "content";
      this.shadowRoot.appendChild(slot);
    }

    connectedCallback() {
      if (this.delayConnectedCallback()) {
        return;
      }
      this.textContent = "";

      this.mInput = null;

      this.mPopupOpen = false;

      this._currentIndex = 0;

      /**
       * This is the default number of rows that we give the autocomplete
       * popup when the textbox doesn't have a "maxrows" attribute
       * for us to use.
       */
      this.defaultMaxRows = 6;

      /**
       * In some cases (e.g. when the input's dropmarker button is clicked),
       * the input wants to display a popup with more rows. In that case, it
       * should increase its maxRows property and store the "normal" maxRows
       * in this field. When the popup is hidden, we restore the input's
       * maxRows to the value stored in this field.
       *
       * This field is set to -1 between uses so that we can tell when it's
       * been set by the input and when we need to set it in the popupshowing
       * handler.
       */
      this._normalMaxRows = -1;

      this._previousSelectedIndex = -1;

      this.mLastMoveTime = Date.now();

      this.mousedOverIndex = -1;

      this.richlistbox = document.createXULElement("richlistbox");
      this.richlistbox.setAttribute("flex", "1");
      this.richlistbox.classList.add("autocomplete-richlistbox");

      this.appendChild(this.richlistbox);

      if (!this.listEvents) {
        this.listEvents = {
          handleEvent: event => {
            if (!this.parentNode) {
              return;
            }

            switch (event.type) {
              case "mouseup":
                // Don't call onPopupClick for the scrollbar buttons, thumb,
                // slider, etc. If we hit the richlistbox and not a
                // richlistitem, we ignore the event.
                if (
                  event.target.closest("richlistbox, richlistitem").localName ==
                  "richlistitem"
                ) {
                  this.onPopupClick(event);
                }
                break;
              case "mousemove": {
                if (Date.now() - this.mLastMoveTime <= 30) {
                  return;
                }

                const item = event.target.closest("richlistbox, richlistitem");

                // If we hit the richlistbox and not a richlistitem, we ignore
                // the event.
                if (item.localName == "richlistbox") {
                  return;
                }

                const index = this.richlistbox.getIndexOfItem(item);

                this.mousedOverIndex = index;

                if (item.selectedByMouseOver) {
                  this.richlistbox.selectedIndex = index;
                }

                this.mLastMoveTime = Date.now();
                break;
              }
            }
          },
        };
        this.richlistbox.addEventListener("mouseup", this.listEvents);
        this.richlistbox.addEventListener("mousemove", this.listEvents);
      }
    }

    // nsIAutoCompletePopup
    get input() {
      return this.mInput;
    }

    get overrideValue() {
      return null;
    }

    get popupOpen() {
      return this.mPopupOpen;
    }

    get maxRows() {
      return (this.mInput && this.mInput.maxRows) || this.defaultMaxRows;
    }

    set selectedIndex(val) {
      if (val != this.richlistbox.selectedIndex) {
        this._previousSelectedIndex = this.richlistbox.selectedIndex;
      }
      this.richlistbox.selectedIndex = val;
      // Since ensureElementIsVisible may cause an expensive Layout flush,
      // invoke it only if there may be a scrollbar, so if we could fetch
      // more results than we can show at once.
      // maxResults is the maximum number of fetched results, maxRows is the
      // maximum number of rows we show at once, without a scrollbar.
      if (this.mPopupOpen && this.maxResults > this.maxRows) {
        // when clearing the selection (val == -1, so selectedItem will be
        // null), we want to scroll back to the top.  see bug #406194
        this.richlistbox.ensureElementIsVisible(
          this.richlistbox.selectedItem || this.richlistbox.firstElementChild
        );
      }
    }

    get selectedIndex() {
      return this.richlistbox.selectedIndex;
    }

    get maxResults() {
      // This is how many richlistitems will be kept around.
      // Note, this getter may be overridden, or instances
      // can have the nomaxresults attribute set to have no
      // limit.
      if (this.getAttribute("nomaxresults") == "true") {
        return Infinity;
      }

      return 20;
    }

    get matchCount() {
      return Math.min(this.mInput.controller.matchCount, this.maxResults);
    }

    get overflowPadding() {
      return Number(this.getAttribute("overflowpadding"));
    }

    set view(val) {}

    get view() {
      return this.mInput.controller;
    }

    closePopup() {
      if (this.mPopupOpen) {
        this.hidePopup();
        this.style.removeProperty("--panel-width");
      }
    }

    getNextIndex(aReverse, aAmount, aIndex, aMaxRow) {
      if (aMaxRow < 0) {
        return -1;
      }

      let newIdx = aIndex + (aReverse ? -1 : 1) * aAmount;
      if (
        (aReverse && aIndex == -1) ||
        (newIdx > aMaxRow && aIndex != aMaxRow)
      ) {
        newIdx = aMaxRow;
      } else if ((!aReverse && aIndex == -1) || (newIdx < 0 && aIndex != 0)) {
        newIdx = 0;
      }

      if (
        (newIdx < 0 && aIndex == 0) ||
        (newIdx > aMaxRow && aIndex == aMaxRow)
      ) {
        aIndex = -1;
      } else {
        aIndex = newIdx;
      }

      return aIndex;
    }

    onPopupClick(aEvent) {
      this.input.controller.handleEnter(true, aEvent);
    }

    onSearchBegin() {
      this.mousedOverIndex = -1;

      if (typeof this._onSearchBegin == "function") {
        this._onSearchBegin();
      }
    }

    openAutocompletePopup(aInput, aElement) {
      // until we have "baseBinding", (see bug #373652) this allows
      // us to override openAutocompletePopup(), but still call
      // the method on the base class
      this._openAutocompletePopup(aInput, aElement);
    }

    _openAutocompletePopup(aInput, aElement) {
      if (!this.mPopupOpen) {
        // It's possible that the panel is hidden initially
        // to avoid impacting startup / new window performance
        aInput.popup.hidden = false;

        this.mInput = aInput;
        // clear any previous selection, see bugs 400671 and 488357
        this.selectedIndex = -1;

        const width = aElement.getBoundingClientRect().width;
        this.style.setProperty(
          "--panel-width",
          (width > 100 ? width : 100) + "px"
        );
        // invalidate() depends on the width attribute
        this._invalidate();

        this.openPopup(aElement, "after_start", 0, 0, false, false);
      }
    }

    invalidate(reason) {
      // Don't bother doing work if we're not even showing
      if (!this.mPopupOpen) {
        return;
      }

      this._invalidate(reason);
    }

    _invalidate(reason) {
      setTimeout(() => this.adjustHeight(), 0);

      // remove all child nodes because we never want to reuse them.
      while (this.richlistbox.hasChildNodes()) {
        this.richlistbox.lastChild.remove();
      }

      this._currentIndex = 0;
      this._appendCurrentResult();
    }

    _collapseUnusedItems() {
      const existingItemsCount = this.richlistbox.children.length;
      for (let i = this.matchCount; i < existingItemsCount; ++i) {
        const item = this.richlistbox.children[i];

        item.collapsed = true;
        if (typeof item._onCollapse == "function") {
          item._onCollapse();
        }
      }
    }

    adjustHeight() {
      // Figure out how many rows to show
      const rows = this.richlistbox.children;
      const numRows = Math.min(this.matchCount, this.maxRows, rows.length);

      // Default the height to 0 if we have no rows to show
      let height = 0;
      if (numRows) {
        const firstRowRect = rows[0].getBoundingClientRect();
        if (this._rlbPadding == undefined) {
          const style = window.getComputedStyle(this.richlistbox);
          const paddingTop = parseInt(style.paddingTop) || 0;
          const paddingBottom = parseInt(style.paddingBottom) || 0;
          this._rlbPadding = paddingTop + paddingBottom;
        }

        // The class `forceHandleUnderflow` is for the item might need to
        // handle OverUnderflow or Overflow when the height of an item will
        // be changed dynamically.
        for (let i = 0; i < numRows; i++) {
          if (rows[i].classList.contains("forceHandleUnderflow")) {
            rows[i].handleOverUnderflow();
          }
        }

        const lastRowRect = rows[numRows - 1].getBoundingClientRect();
        // Calculate the height to have the first row to last row shown
        height = lastRowRect.bottom - firstRowRect.top + this._rlbPadding;
      }

      const currentHeight = this.richlistbox.getBoundingClientRect().height;
      if (height <= currentHeight) {
        this._collapseUnusedItems();
      }
      this.richlistbox.style.removeProperty("height");
      // We need to get the ceiling of the calculated value to ensure that the box fully contains
      // all of its contents and doesn't cause a scrollbar since nsIBoxObject only expects a
      // `long`. e.g. if `height` is 99.5 the richlistbox would render at height 99px with a
      // scrollbar for the extra 0.5px.
      this.richlistbox.height = Math.ceil(height);
    }

    _appendCurrentResult() {
      const controller = this.mInput.controller;
      const glodaCompleter = Cc[
        "@mozilla.org/autocomplete/search;1?name=gloda"
      ].getService(Ci.nsIAutoCompleteSearch).wrappedJSObject;

      // Process maxRows per chunk to improve performance and user experience
      for (let i = 0; i < this.maxRows; i++) {
        if (this._currentIndex >= this.matchCount) {
          return;
        }

        // trim the leading/trailing whitespace
        const trimmedSearchString = controller.searchString.trim();
        const result = glodaCompleter.curResult;

        const item = document.createXULElement("richlistitem", {
          is: result.getStyleAt(this._currentIndex),
        });

        // set these attributes before we set the class
        // so that we can use them from the constructor
        const row = result.getObjectAt(this._currentIndex);
        item.setAttribute("text", trimmedSearchString);
        item.setAttribute("type", result.getStyleAt(this._currentIndex));

        item.row = row;

        // set the class at the end so we can use the attributes
        // in the xbl constructor
        item.className = "autocomplete-richlistitem";
        this.richlistbox.appendChild(item);
        this._currentIndex++;
      }

      // yield after each batch of items so that typing the url bar is responsive
      setTimeout(() => this._appendCurrentResult(), 0);
    }

    selectBy(aReverse, aPage) {
      try {
        const amount = aPage ? 5 : 1;

        // because we collapsed unused items, we can't use this.richlistbox.getRowCount(), we need to use the matchCount
        this.selectedIndex = this.getNextIndex(
          aReverse,
          amount,
          this.selectedIndex,
          this.matchCount - 1
        );
        if (this.selectedIndex == -1) {
          this.input._focus();
        }
      } catch (ex) {
        // do nothing - occasionally timer-related js errors happen here
        // e.g. "this.selectedIndex has no properties", when you type fast and hit a
        // navigation key before this popup has opened
      }
    }

    disconnectedCallback() {
      if (this.listEvents) {
        this.richlistbox.removeEventListener("mouseup", this.listEvents);
        this.richlistbox.removeEventListener("mousemove", this.listEvents);
        delete this.listEvents;
      }
    }
  }

  MozXULElement.implementCustomInterface(MozGlodacompleteRichResultPopup, [
    Ci.nsIAutoCompletePopup,
  ]);
  customElements.define(
    "glodacomplete-rich-result-popup",
    MozGlodacompleteRichResultPopup,
    { extends: "panel" }
  );
}
