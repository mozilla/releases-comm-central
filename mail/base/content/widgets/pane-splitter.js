/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  /**
   * A widget for adjusting the size of its {@link PaneSplitter#resizeElement}.
   * By default, the splitter will resize the height of the resizeElement, but
   * this can be changed using the "resize-direction" attribute.
   *
   * If dragged, the splitter will set a CSS variable on the parent element,
   * which is named from the id of the element plus "width" or "height" as
   * appropriate (e.g. --splitter-width). The variable should be used to set the
   * border-area width or height of the resizeElement.
   *
   * Often, you will want to naturally limit the size of the resizeElement to
   * prevent it exceeding its min or max size bounds, and to remain within the
   * available space of its container. One way to do this is to use a grid
   * layout on the container and size the resizeElement's row with
   * "minmax(auto, --splitter-height)", or similar for the column when adjusting
   * the width.
   *
   * This splitter element fires a "splitter-resizing" event as dragging begins,
   * and "splitter-resized" when it ends.
   *
   * The resizeElement can be collapsed and expanded. Whilst collapsed, the
   * "collapsed-by-splitter" class will be added to the resizeElement and the
   * "--<id>-width" or "--<id>-height" CSS variable, will be be set to "0px".
   * The "splitter-collapsed" and "splitter-expanded" events are fired as
   * appropriate. If the splitter has a "collapse-width" or "collapse-height"
   * attribute, collapsing and expanding happens automatically when below the
   * given size.
   *
   * If the splitter is in a flexible sized container it can be resized with the
   * application with the "resize-with-window" option. If the splitter is in a
   * container with another flexible size element, the "resize-lock-ids" option
   * can be used to lock the size of other elements while resizing.
   */
  class PaneSplitter extends HTMLHRElement {
    static observedAttributes = [
      "resize-direction",
      "resize-id",
      "resize-with-window",
      "resize-lock-ids",
      "id",
    ];

    /**
     * Whether this splitter is currently being resized by another splitter.
     *
     * @type {boolean}
     */
    #externalResizing = false;

    /**
     * The parent element currently used for resize-with-window listeners.
     *
     * @type {?HTMLElement}
     */
    #resizeWithWindowParent = null;

    /**
     * Elements temporarily locked to their current size while this splitter is
     * resizing with the window.
     *
     * @type {Map<HTMLElement, string>}
     */
    #lockedElements = new Map();

    /**
     * Elements to keep locked while this splitter is being dragged.
     *
     * @type {Set<HTMLElement>}
     */
    #lockedElementsToPreserve = new Set();

    /**
     * The requestAnimationFrame handle for a pending lock retry.
     *
     * @type {number}
     */
    #lockRetryRequest = 0;

    /**
     * The number of consecutive lock retry attempts.
     *
     * @type {number}
     */
    #lockRetryCount = 0;

    /**
     * Whether a restored resize-with-window size is waiting for layout to settle.
     *
     * @type {boolean}
     */
    #pendingResizeWithWindowRestore = false;

    /**
     * The window currently observed while waiting for a restored size to settle.
     *
     * @type {?Window}
     */
    #resizeWithWindowRestoreWindow = null;

    /**
     * Whether the restored size should be forced when expanding.
     *
     * @type {boolean}
     */
    #forceSizeOnNextExpand = false;

    /**
     * Whether a resize-with-window restore should be skipped while disabling
     * resize-with-window behavior.
     *
     * @type {boolean}
     */
    #skipResizeWithWindowRestore = false;

    connectedCallback() {
      this.addEventListener("mousedown", this);
      // Try and find the _resizeElement from the resize-id attribute.
      this._updateResizeElement();
      this._updateStyling();
      this.#updateResizeWithWindow();
    }

    disconnectedCallback() {
      this.#removeResizeWithWindowListeners();
      this.#updateLockElements({ lock: false });
    }

    attributeChangedCallback(name) {
      switch (name) {
        case "resize-direction":
          this._updateResizeDirection();
          break;
        case "resize-id":
          this._updateResizeElement();
          break;
        case "resize-with-window":
          this.#updateResizeWithWindow();
          break;
        case "resize-lock-ids":
          this.#updateLockElements({
            lock: this.#resizeWithWindowActive && !this.isCollapsed,
          });
          break;
        case "id":
          this._updateStyling();
          break;
      }
    }

    /**
     * The direction the splitter resizes the controlled element. Resizing
     * horizontally changes its width, whilst resizing vertically changes its
     * height.
     *
     * This corresponds to the "resize-direction" attribute and defaults to
     * "vertical" when none is given.
     *
     * @type {"vertical"|"horizontal"}
     */
    get resizeDirection() {
      return this.getAttribute("resize-direction") ?? "vertical";
    }

    set resizeDirection(val) {
      this.setAttribute("resize-direction", val);
    }

    /**
     *  The css property corresponding to the resize-direction.
     *
     * @type {"height"|"width"}
     */
    get #resizeProperty() {
      return this.resizeDirection === "vertical" ? "height" : "width";
    }

    /**
     * If the splitter should resize the element with the window
     * This corresponds to the "resize-with-window" attribute and defaults to
     * "false" when none is given.
     *
     * @type {boolean}
     */
    get resizeWithWindow() {
      return this.hasAttribute("resize-with-window");
    }

    set resizeWithWindow(val) {
      this.toggleAttribute("resize-with-window", val);
    }

    /**
     * Whether this splitter currently has a preferred size to preserve while
     * resizing with the window.
     *
     * @type {boolean}
     */
    get #resizeWithWindowActive() {
      return this.resizeWithWindow && this[this.#resizeProperty] != null;
    }

    /**
     * Lock or unlock the size of elements specified by the resize-lock-ids
     * attribute.
     *
     * @param {object} options
     * @param {boolean} options.lock - Whether the elements should be locked.
     * @param {Set<HTMLElement>} [options.keepLockedElements] - Elements that
     *   should remain locked when unlocking.
     * @param {boolean} [options.retry=true] - Whether to retry if an element
     *   can't be locked yet.
     * @returns {boolean} Whether all elements were successfully locked.
     */
    #updateLockElements({
      lock,
      keepLockedElements = new Set(),
      retry = true,
    }) {
      if (!this.#pendingResizeWithWindowRestore || !lock) {
        this.#cancelLockRetry();
      }
      if (!lock) {
        this.#unlockElements({ keepLockedElements });
        if (!keepLockedElements.size) {
          this.#lockedElementsToPreserve.clear();
        }
        this.#lockRetryCount = 0;
        this.#pendingResizeWithWindowRestore = false;
        this.#removeResizeWithWindowRestoreListener();
        return true;
      }

      const ids =
        this.getAttribute("resize-lock-ids")
          ?.split(",")
          .map(id => id.trim())
          .filter(Boolean) ?? [];
      let needsRetry = false;
      const oldLockedElements = new Map(this.#lockedElements);
      const lockedElements = new Map();
      const sizes = [];
      this.#lockedElements.clear();
      const idSet = new Set(ids);

      for (const [element, property] of oldLockedElements) {
        if (property == this.#resizeProperty && idSet.has(element.id)) {
          continue;
        }

        element.style.removeProperty(property);
        oldLockedElements.delete(element);
      }

      for (const id of ids) {
        const element = this.ownerDocument.getElementById(id);
        if (!element) {
          needsRetry = true;
          continue;
        }

        const size = this.#getElementSize(element);
        if (!Number.isFinite(size) || size <= 0) {
          needsRetry = true;
          continue;
        }

        sizes.push([element, size]);
      }

      for (const [element, size] of sizes) {
        element.style.setProperty(
          this.#resizeProperty,
          `${size}px`,
          "important"
        );
        lockedElements.set(element, this.#resizeProperty);
        oldLockedElements.delete(element);
      }

      for (const [element, property] of oldLockedElements) {
        element.style.removeProperty(property);
      }
      this.#lockedElements = lockedElements;

      if (retry && needsRetry) {
        this.#scheduleLockRetry();
      }
      if (!needsRetry) {
        this.#lockRetryCount = 0;
      }
      return !needsRetry;
    }

    /**
     * Lock other elements at their current size, then make this splitter's
     * element take future resize changes.
     *
     * @param {object} [options]
     * @param {boolean} [options.retry=true] - Whether to retry if an element
     *   can't be locked yet.
     * @returns {boolean} Whether all elements were successfully locked.
     */
    #enableResizeWithWindow({ retry = true } = {}) {
      const shouldResizeWithWindow =
        this.#resizeWithWindowActive && !this.isCollapsed;
      const locked = this.#updateLockElements({
        lock: shouldResizeWithWindow,
        retry,
      });
      if (locked && shouldResizeWithWindow) {
        this.#setSize("100%");
      }
      return locked;
    }

    /**
     * Unlock the size of any elements locked by this splitter.
     *
     * @param {object} [options]
     * @param {Set<HTMLElement>} [options.keepLockedElements] - Elements that
     *   should remain locked.
     */
    #unlockElements({ keepLockedElements = new Set() } = {}) {
      for (const [element, property] of this.#lockedElements) {
        if (keepLockedElements.has(element)) {
          continue;
        }

        element.style.removeProperty(property);
        this.#lockedElements.delete(element);
      }
    }

    /**
     * Get lock targets that should stay locked while this splitter is dragged.
     *
     * @returns {Set<HTMLElement>} Elements that should stay locked.
     */
    #getLockedElementsToPreserve() {
      const lockedElementsToPreserve = new Set();
      if (this.resizeDirection != "horizontal") {
        return lockedElementsToPreserve;
      }

      const unlockedElement = this._beforeElement
        ? this.previousElementSibling
        : this.nextElementSibling;
      for (const element of this.#lockedElements.keys()) {
        if (element != unlockedElement) {
          lockedElementsToPreserve.add(element);
        }
      }
      return lockedElementsToPreserve;
    }

    /**
     * Retry locking elements after layout has had a chance to settle.
     */
    #scheduleLockRetry() {
      const win = this.ownerDocument.documentGlobal;
      if (!win || !this.isConnected) {
        this.#lockRetryCount = 0;
        this.#pendingResizeWithWindowRestore = false;
        this.#removeResizeWithWindowRestoreListener();
        return;
      }
      if (!this.#pendingResizeWithWindowRestore && this.#lockRetryCount >= 60) {
        this.#lockRetryCount = 0;
        return;
      }
      if (this.#lockRetryRequest) {
        return;
      }

      this.#lockRetryRequest = win.requestAnimationFrame(() => {
        this.#lockRetryRequest = 0;
        this.#lockRetryCount++;
        if (this.#pendingResizeWithWindowRestore) {
          this.#finishResizeWithWindowRestore();
          return;
        }

        if (!this.#enableResizeWithWindow({ retry: false })) {
          this.#scheduleLockRetry();
        }
      });
    }

    /**
     * Cancel any pending retry of lock element sizing.
     */
    #cancelLockRetry() {
      if (!this.#lockRetryRequest) {
        return;
      }

      this.ownerDocument.documentGlobal.cancelAnimationFrame(
        this.#lockRetryRequest
      );
      this.#lockRetryRequest = 0;
    }

    #addResizeWithWindowRestoreListener() {
      const win = this.ownerDocument.documentGlobal;
      if (!win || this.#resizeWithWindowRestoreWindow == win) {
        return;
      }

      this.#removeResizeWithWindowRestoreListener();
      win.addEventListener("resize", this);
      this.#resizeWithWindowRestoreWindow = win;
    }

    #removeResizeWithWindowRestoreListener() {
      if (!this.#resizeWithWindowRestoreWindow) {
        return;
      }

      this.#resizeWithWindowRestoreWindow.removeEventListener("resize", this);
      this.#resizeWithWindowRestoreWindow = null;
    }

    /**
     * Handles changes to the resize-with-window attribute.
     */
    #updateResizeWithWindow() {
      const val = this.resizeWithWindow;

      if (!this.parentNode || !val) {
        this.#removeResizeWithWindowListeners();
        this.#updateLockElements({ lock: false });
        if (!val) {
          this._updateStyling(true);
        }
        return;
      }

      if (this.#resizeWithWindowParent != this.parentNode) {
        this.#removeResizeWithWindowListeners();
        this.#resizeWithWindowParent = this.parentNode;
        this.#resizeWithWindowParent.addEventListener(
          "splitter-before-resize",
          this
        );
        this.#resizeWithWindowParent.addEventListener(
          "splitter-resize-end",
          this
        );
        this.ownerDocument.addEventListener("visibilitychange", this);
      }

      this._updateStyling();
      if (this.isCollapsed) {
        this.#updateLockElements({ lock: false });
      } else if (this.#resizeWithWindowActive) {
        this.#finishResizeWithWindowRestore();
      } else {
        this.#updateLockElements({ lock: false });
      }
    }

    #removeResizeWithWindowListeners() {
      this.#resizeWithWindowParent?.removeEventListener(
        "splitter-before-resize",
        this
      );
      this.#resizeWithWindowParent?.removeEventListener(
        "splitter-resize-end",
        this
      );
      this.ownerDocument.removeEventListener("visibilitychange", this);
      this.#resizeWithWindowParent = null;
    }

    _updateResizeDirection() {
      // The resize direction has changed. To be safe, make sure we're no longer
      // resizing.
      this.endResize();
      const forceSize =
        this.resizeWithWindow &&
        !this.isCollapsed &&
        this[this.#resizeProperty] != null;
      this._updateStyling(forceSize);
      if (forceSize) {
        this.#finishResizeWithWindowRestore();
      } else {
        this.#updateLockElements({
          lock: this.#resizeWithWindowActive && !this.isCollapsed,
        });
      }
    }

    _resizeElement = null;

    /**
     * The element that is being sized by the splitter. It must have a set id.
     *
     * If the "resize-id" attribute is set, it will be used to choose this
     * element by its id.
     *
     * @type {?HTMLElement}
     */
    get resizeElement() {
      // Make sure the resizeElement is up to date.
      this._updateResizeElement();
      return this._resizeElement;
    }

    set resizeElement(element) {
      if (!element?.id) {
        element = null;
      }
      this._updateResizeElement(element);
      // Set the resize-id attribute.
      // NOTE: This will trigger a second call to _updateResizeElement, but it
      // should end early because the resize-id matches the just set
      // _resizeElement.
      if (element) {
        this.setAttribute("resize-id", element.id);
      } else {
        this.removeAttribute("resize-id");
      }

      this.#updateResizeWithWindow();
    }

    /**
     * Update the _resizeElement property.
     *
     * @param {?HTMLElement} [element] - The resizeElement to set, or leave
     *   undefined to use the resize-id attribute to find the element.
     */
    _updateResizeElement(element) {
      if (element == undefined) {
        // Use the resize-id to find the element.
        const resizeId = this.getAttribute("resize-id");
        if (resizeId) {
          if (this._resizeElement?.id == resizeId) {
            // Avoid looking up the element since we already have it.
            return;
          }
          // Try and find the element.
          // NOTE: If we don't find the element now, then we still keep the same
          // resize-id attribute and we'll try again the next time this method
          // is called.
          element = this.ownerDocument.getElementById(resizeId);
        } else {
          element = null;
        }
      }
      if (element == this._resizeElement) {
        return;
      }

      // Make sure we stop resizing the current _resizeElement.
      this.endResize();
      if (this._resizeElement) {
        // Clean up previous element.
        this._resizeElement.classList.remove("collapsed-by-splitter");
      }
      this._resizeElement = element;
      this._beforeElement =
        element &&
        !!(
          this.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      // Are we already collapsed?
      this._isCollapsed = this._resizeElement?.classList.contains(
        "collapsed-by-splitter"
      );
      this._updateStyling();

      this.#updateResizeWithWindow();
    }

    _width = null;

    /**
     * The desired width of the resizeElement. This is used to set the
     * --<id>-width CSS variable on the parent when the resizeDirection is
     * "horizontal" and the resizeElement is not collapsed. If its value is
     * null, the same CSS variable is removed from the parent instead.
     *
     * Note, this value is persistent across collapse states, so the width
     * before collapsing can be returned to on expansion.
     *
     * Use this value in persistent storage.
     *
     * @type {?number}
     */
    get width() {
      return this._width;
    }

    set width(width) {
      this.#setDimension("width", width);
    }

    _height = null;

    /**
     * The desired height of the resizeElement. This is used to set the
     * -<id>-height CSS variable on the parent when the resizeDirection is
     *  "vertical" and the resizeElement is not collapsed. If its value is null,
     *  the same CSS variable is removed from the parent instead.
     *
     * Note, this value is persistent across collapse states, so the height
     * before collapsing can be returned to on expansion.
     *
     * Use this value in persistent storage.
     *
     * @type {?number}
     */
    get height() {
      return this._height;
    }

    set height(height) {
      this.#setDimension("height", height);
    }

    /**
     * Update a preferred size dimension.
     *
     * @param {"width"|"height"} property - The property to update.
     * @param {?number|string} size - The preferred size.
     */
    #setDimension(property, size) {
      size = this.#normalizeSize(size);
      const field = `_${property}`;
      if (size == this[field]) {
        return;
      }
      this[field] = size;

      const forceSize = this.resizeWithWindow && size != null;
      const isResizing = !!this._dragStartInfo;
      if (forceSize && this.isCollapsed) {
        this.#forceSizeOnNextExpand = true;
      }

      this._updateStyling(forceSize);
      if (
        forceSize &&
        !this.#skipResizeWithWindowRestore &&
        !this.isCollapsed &&
        !isResizing
      ) {
        this.#finishResizeWithWindowRestore();
      } else if (
        this.#resizeWithWindowActive &&
        !this.isCollapsed &&
        !isResizing
      ) {
        this.#enableResizeWithWindow();
      } else if (
        this.resizeWithWindow &&
        property == this.#resizeProperty &&
        size == null
      ) {
        this.#updateLockElements({ lock: false });
      }
    }

    /**
     * Convert persisted or assigned size values to numbers.
     *
     * @param {?number|string} size - The size to normalize.
     * @returns {?number}
     */
    #normalizeSize(size) {
      if (size === null || size === undefined || size === "") {
        return null;
      }

      const number = Number(size);
      return Number.isFinite(number) ? number : null;
    }

    /**
     * Update the width or height of the splitter, depending on its
     * resizeDirection.
     *
     * If a trySize is given, the width or height of the splitter will be set to
     * the given value, before being set to the actual size of the
     * resizeElement. This acts as an automatic bounding process, without
     * knowing the details of the layout and its constraints.
     *
     * If no trySize is given, then the width and height will be set to the
     * actual size of the resizeElement.
     *
     * @param {?number} [trySize] - The size to try and achieve.
     */
    _updateSize(trySize) {
      if (trySize != undefined) {
        this[this.#resizeProperty] = Math.round(trySize);
      }

      // Now that the width or height has been updated, fetch the size the
      // element actually took after CSS layout constraints were applied.
      this[this.#resizeProperty] = this.#getElementSize(this.resizeElement);
    }

    /**
     * Get the actual size of an element, regardless of the current
     * width or height property values. This causes a reflow, and it gets
     * called on every mousemove event while dragging, so it's very expensive
     * but practically unavoidable.
     *
     * @param {HTMLElement} element - the element to get the size of
     * @returns {number} - The border area size of the resizeElement.
     */

    #getElementSize(element) {
      return element?.getBoundingClientRect()[this.#resizeProperty];
    }

    /**
     * Collapses the controlled pane.
     */
    collapse() {
      this.#toggleCollapse(true);
    }

    /**
     * Expands the controlled pane.
     */
    expand() {
      this.#toggleCollapse(false);
    }

    /**
     * toggle the collapsed status of the pane. When expanding it returns to the
     * width or height it had when collapsed and fires a "splitter-expanded"
     * event. Collapsing does not affect the `width` or `height` properties and
     * fires a "splitter-collapsed" event.
     *
     * @param {boolean} collapse - If the element should be collapsed.
     */

    #toggleCollapse(collapse) {
      if (collapse == this._isCollapsed) {
        return;
      }
      if (collapse && this.#resizeWithWindowActive) {
        this.#forceSizeOnNextExpand = true;
      }

      const forceSize = !collapse && this.#forceSizeOnNextExpand;
      this._isCollapsed = collapse;
      this._updateStyling(forceSize);
      if (forceSize) {
        this.#finishResizeWithWindowRestore();
      } else if (this.#resizeWithWindowActive && !this.isCollapsed) {
        this.#enableResizeWithWindow();
      } else {
        this.#updateLockElements({
          lock: this.#resizeWithWindowActive && !this.isCollapsed,
        });
      }
      this._updateDragCursor();
      this.dispatchEvent(
        new CustomEvent(`splitter-${collapse ? "collapsed" : "expanded"}`, {
          bubbles: true,
        })
      );
    }

    _isCollapsed = false;

    /**
     * If the controlled pane is collapsed.
     *
     * @type {boolean}
     */
    get isCollapsed() {
      return this._isCollapsed;
    }

    set isCollapsed(collapsed) {
      if (collapsed) {
        this.collapse();
      } else {
        this.expand();
      }
    }

    /**
     * Collapse the splitter if it is expanded, or expand it if collapsed.
     */
    toggleCollapsed() {
      this.isCollapsed = !this._isCollapsed;
    }

    /**
     * If the splitter is disabled.
     *
     * @type {boolean}
     */
    get isDisabled() {
      return this.hasAttribute("disabled");
    }

    set isDisabled(disabled) {
      this.toggleAttribute("disabled", !!disabled);
    }

    _cssName = null;

    /**
     * Update styling to reflect the current state.
     *
     * @param {boolean} forceSize - Whether to force the updated size.
     */
    _updateStyling(forceSize) {
      if (!this.resizeElement || !this.parentNode || !this.id) {
        // Wait until we have a resizeElement, a parent and an id.
        return;
      }

      if (this.id != this._cssName?.basis) {
        // Clear the old names.
        if (this._cssName) {
          this.parentNode.style.removeProperty(this._cssName.width);
          this.parentNode.style.removeProperty(this._cssName.height);
        }
        this._cssName = {
          basis: this.id,
          height: `--${this.id}-height`,
          width: `--${this.id}-width`,
        };
      }

      const vertical = this.resizeDirection == "vertical";
      const size = this.isCollapsed ? 0 : this[this.#resizeProperty];

      if (size == null) {
        this.parentNode.style.removeProperty(
          this._cssName[this.#resizeProperty]
        );
      }

      this.parentNode.style.removeProperty(
        this._cssName[vertical ? "width" : "height"]
      );

      if (typeof size === "number" || this.isCollapsed) {
        this.#setSize(
          this.isCollapsed ||
            this._started ||
            !this.resizeWithWindow ||
            this.#externalResizing ||
            forceSize
            ? `${size}px`
            : "100%"
        );
      }

      this.resizeElement.classList.toggle(
        "collapsed-by-splitter",
        this.isCollapsed
      );
      this.classList.toggle("splitter-collapsed", this.isCollapsed);
      this.classList.toggle("splitter-before", this._beforeElement);
    }

    /**
     * Set the size of the `resizeElement`.
     *
     * @param {string} size A size to set as the css variable value.
     */
    #setSize(size) {
      if (this.resizeElement) {
        this.parentNode.style.setProperty(
          this._cssName[this.#resizeProperty],
          size
        );
      }
    }

    handleEvent(event) {
      switch (event.type) {
        case "mousedown":
          this._onMouseDown(event);
          break;
        case "mousemove":
          this._onMouseMove(event);
          break;
        case "mouseup":
          this._onMouseUp(event);
          break;
        case "splitter-before-resize":
        case "splitter-resize-end":
          if (
            event.target !== this &&
            (this.#resizeWithWindowActive || this.#externalResizing)
          ) {
            if (event.type == "splitter-before-resize") {
              this.#lockedElementsToPreserve.clear();
            }
            this.#externalResizing = event.type !== "splitter-resize-end";
            this.#toggleWindowResizing(event.type === "splitter-resize-end");
          }
          break;
        case "visibilitychange":
          if (this.#pendingResizeWithWindowRestore) {
            this.#lockRetryCount = 0;
            this.#scheduleLockRetry();
          }
          break;
        case "resize":
          if (this.#pendingResizeWithWindowRestore) {
            this.#lockRetryCount = 0;
            this.#scheduleLockRetry();
          }
          break;
      }
    }

    /**
     * Toggle the elements should currently resize with the window.
     *
     * @param {boolean} enable - Whether resizing with the window should be
     *   enabled.
     */
    #toggleWindowResizing(enable) {
      if (!enable) {
        this.#skipResizeWithWindowRestore = true;
        try {
          this[this.#resizeProperty] = this.#getElementSize(
            this._resizeElement
          );
        } finally {
          this.#skipResizeWithWindowRestore = false;
        }
        this._updateStyling(true);
        this.#updateLockElements({
          lock: false,
          keepLockedElements: this.#lockedElementsToPreserve,
        });
      } else {
        if (this[this.#resizeProperty] != null) {
          this.#finishResizeWithWindowRestore();
          return;
        }

        this.#forceSizeOnNextExpand = false;
        if (this.isCollapsed) {
          this.#setSize("0px");
          this.#updateLockElements({ lock: false });
        } else {
          this.#enableResizeWithWindow();
        }
      }
    }

    /**
     * Preserve a restored size while keeping resize-with-window behavior enabled.
     */
    #finishResizeWithWindowRestore() {
      this.#forceSizeOnNextExpand = false;
      this.#unlockElements({
        keepLockedElements: this.#lockedElementsToPreserve,
      });
      this._updateStyling(true);
      this.#pendingResizeWithWindowRestore = true;
      this.#addResizeWithWindowRestoreListener();

      // During startup, persisted pane sizes are applied while the document is
      // still loading and before the outer window has settled on its final size.
      if (
        this.ownerDocument.readyState != "complete" &&
        this.#lockRetryCount < 60
      ) {
        this.#scheduleLockRetry();
        return;
      }

      const size = this[this.#resizeProperty];
      const actualSize = this.#getElementSize(this._resizeElement);
      if (
        !this.isCollapsed &&
        size != null &&
        (!Number.isFinite(actualSize) || Math.abs(actualSize - size) > 1) &&
        this.#lockRetryCount < 60
      ) {
        this.#scheduleLockRetry();
        return;
      }
      if (
        !this.isCollapsed &&
        size != null &&
        (!Number.isFinite(actualSize) || Math.abs(actualSize - size) > 1)
      ) {
        return;
      }

      const lockSucceeded = this.#updateLockElements({
        lock: !this.isCollapsed,
        retry: false,
      });
      if (!lockSucceeded && this.#lockRetryCount < 60) {
        this.#scheduleLockRetry();
        return;
      }
      if (!lockSucceeded) {
        return;
      }

      this.#pendingResizeWithWindowRestore = false;
      this.#cancelLockRetry();
      this.#removeResizeWithWindowRestoreListener();
      this.#lockRetryCount = 0;
      this.#lockedElementsToPreserve.clear();
      this.#setSize(this.isCollapsed ? "0px" : "100%");
    }

    /**
     * Handles mousedown events on the splitter element.
     *
     * @param {MouseEvent} event
     * @returns {void}
     */
    _onMouseDown(event) {
      if (!this.resizeElement || this.isDisabled) {
        return;
      }
      if (event.buttons != 1) {
        return;
      }

      this.dispatchEvent(
        new CustomEvent("splitter-before-resize", { bubbles: true })
      );

      if (this.resizeWithWindow) {
        this.#updateLockElements({ lock: true, retry: false });
        this.#lockedElementsToPreserve = this.#getLockedElementsToPreserve();
        this.#toggleWindowResizing(false);
      }

      const vertical = this.resizeDirection == "vertical";
      const collapseSize =
        Number(this.getAttribute(`collapse-${this.#resizeProperty}`)) || 0;
      const ltrDir = this.parentNode.matches(":dir(ltr)");

      this._dragStartInfo = {
        wasCollapsed: this.isCollapsed,
        // Whether this will resize vertically.
        vertical,
        pos: vertical ? event.clientY : event.clientX,
        // Whether decreasing X/Y should increase the size.
        negative: vertical
          ? this._beforeElement
          : this._beforeElement == ltrDir,
        size: this.#getElementSize(this._resizeElement),
        collapseSize,
      };

      event.preventDefault();
      window.addEventListener("mousemove", this);
      window.addEventListener("mouseup", this);
      // Block all other pointer events whilst resizing. This ensures we don't
      // trigger any styling or other effects whilst resizing. This also ensures
      // that the MouseEvent's clientX and clientY will always be relative to
      // the current window, rather than some ancestor xul:browser's window.
      document.documentElement.style.pointerEvents = "none";
      this._updateDragCursor();
      this.classList.add("splitter-resizing");
    }

    _updateDragCursor() {
      if (!this._dragStartInfo) {
        return;
      }
      let cursor;
      const { vertical, negative } = this._dragStartInfo;
      if (this.isCollapsed) {
        if (vertical) {
          cursor = negative ? "n-resize" : "s-resize";
        } else {
          cursor = negative ? "w-resize" : "e-resize";
        }
      } else {
        cursor = vertical ? "ns-resize" : "ew-resize";
      }
      document.documentElement.style.cursor = cursor;
    }

    /**
     * If `mousemove` events will be ignored because the screen hasn't been
     * updated since the last one.
     *
     * @type {boolean}
     */
    _mouseMoveBlocked = false;

    /**
     * Handles mouse move events on the splitter, resizing and or
     * collapsing the resize-element as needed.
     *
     * @param {MouseEvent} event
     */
    _onMouseMove(event) {
      if (event.buttons != 1) {
        // The button was released and we didn't get a mouseup event (e.g.
        // releasing the mouse above a disabled html:button), or the
        // button(s) pressed changed. Either way, stop dragging.
        this.endResize();
        return;
      }

      event.preventDefault();

      // Ensure the expensive part of this function runs no more than once
      // per frame. Doing it more frequently is just wasting CPU time.
      if (this._mouseMoveBlocked) {
        return;
      }
      this._mouseMoveBlocked = true;
      requestAnimationFrame(() => (this._mouseMoveBlocked = false));

      let { wasCollapsed, vertical, negative, pos, size, collapseSize } =
        this._dragStartInfo;

      let delta = (vertical ? event.clientY : event.clientX) - pos;
      if (negative) {
        delta *= -1;
      }

      if (!this._started) {
        if (Math.abs(delta) < 3) {
          return;
        }
        this._started = true;
        this.dispatchEvent(
          new CustomEvent("splitter-resizing", { bubbles: true })
        );
      }

      // Some splitters live inside the element they resize, e.g. table column
      // headers. In that layout the parent is not the available container.
      const maxSize =
        this.resizeWithWindow || this.parentNode == this.resizeElement
          ? null
          : this.#getElementSize(this.parentNode);

      size += delta;
      if (collapseSize) {
        let pastCollapseThreshold = size < collapseSize - 20;
        if (wasCollapsed) {
          if (!pastCollapseThreshold) {
            this._dragStartInfo.wasCollapsed = false;
          }
          pastCollapseThreshold = size < 20;
        }

        if (pastCollapseThreshold) {
          this.collapse();
          return;
        }

        this.expand();
        size = Math.max(size, collapseSize);
      }

      size = Math.min(size, maxSize ?? size);
      this._updateSize(Math.max(0, size));
    }

    /**
     * Handles mouseup on the splitter.
     *
     * @param {MouseEvent} event
     */
    _onMouseUp(event) {
      event.preventDefault();
      this.endResize();
    }

    /**
     * Stop the resizing operation if it is currently active.
     *
     */
    endResize() {
      if (!this._dragStartInfo) {
        return;
      }

      this.dispatchEvent(
        new CustomEvent("splitter-resize-end", { bubbles: true })
      );

      // Make sure our property corresponds to the actual final size.
      this._updateSize();

      const didStart = this._started;

      delete this._dragStartInfo;
      delete this._started;

      if (this.resizeWithWindow) {
        this.#toggleWindowResizing(true);
      }

      window.removeEventListener("mousemove", this);
      window.removeEventListener("mouseup", this);
      document.documentElement.style.pointerEvents = null;
      document.documentElement.style.cursor = null;
      this.classList.remove("splitter-resizing");

      if (didStart) {
        this.dispatchEvent(
          new CustomEvent("splitter-resized", { bubbles: true })
        );
      }
    }
  }
  customElements.define("pane-splitter", PaneSplitter, { extends: "hr" });
}
