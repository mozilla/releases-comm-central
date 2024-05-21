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
   */
  class PaneSplitter extends HTMLHRElement {
    static observedAttributes = ["resize-direction", "resize-id", "id"];

    connectedCallback() {
      this.addEventListener("mousedown", this);
      // Try and find the _resizeElement from the resize-id attribute.
      this._updateResizeElement();
      this._updateStyling();
    }

    attributeChangedCallback(name) {
      switch (name) {
        case "resize-direction":
          this._updateResizeDirection();
          break;
        case "resize-id":
          this._updateResizeElement();
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

    _updateResizeDirection() {
      // The resize direction has changed. To be safe, make sure we're no longer
      // resizing.
      this.endResize();
      this._updateStyling();
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
      if (width == this._width) {
        return;
      }
      this._width = width;
      this._updateStyling();
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
      if (height == this._height) {
        return;
      }
      this._height = height;
      this._updateStyling();
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
      const vertical = this.resizeDirection == "vertical";
      if (trySize != undefined) {
        trySize = Math.round(trySize);
        if (vertical) {
          this.height = trySize;
        } else {
          this.width = trySize;
        }
      }
      // Now that the width and height are updated, we fetch the size the
      // element actually took.
      const actual = this._getActualResizeSize();
      if (vertical) {
        this.height = actual;
      } else {
        this.width = actual;
      }
    }

    /**
     * Get the actual size of the resizeElement, regardless of the current
     * width or height property values. This causes a reflow, and it gets
     * called on every mousemove event while dragging, so it's very expensive
     * but practically unavoidable.
     *
     * @returns {number} - The border area size of the resizeElement.
     */
    _getActualResizeSize() {
      const resizeRect = this.resizeElement.getBoundingClientRect();
      if (this.resizeDirection == "vertical") {
        return resizeRect.height;
      }
      return resizeRect.width;
    }

    /**
     * Collapses the controlled pane. A collapsed pane does not affect the
     * `width` or `height` properties. Fires a "splitter-collapsed" event.
     */
    collapse() {
      if (this._isCollapsed) {
        return;
      }
      this._isCollapsed = true;
      this._updateStyling();
      this._updateDragCursor();
      this.dispatchEvent(
        new CustomEvent("splitter-collapsed", { bubbles: true })
      );
    }

    /**
     * Expands the controlled pane. It returns to the width or height it had
     * when collapsed. Fires a "splitter-expanded" event.
     */
    expand() {
      if (!this._isCollapsed) {
        return;
      }
      this._isCollapsed = false;
      this._updateStyling();
      this._updateDragCursor();
      this.dispatchEvent(
        new CustomEvent("splitter-expanded", { bubbles: true })
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
      if (disabled) {
        this.setAttribute("disabled", true);
        return;
      }
      this.removeAttribute("disabled");
    }

    /**
     * Update styling to reflect the current state.
     */
    _updateStyling() {
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
      const height = this.isCollapsed ? 0 : this.height;
      if (!vertical || height == null) {
        // If we are resizing horizontally or the "height" property is set to
        // null, we remove the CSS height variable. The height of the element
        // is left to be determined by the CSS stylesheet rules.
        this.parentNode.style.removeProperty(this._cssName.height);
      } else {
        this.parentNode.style.setProperty(this._cssName.height, `${height}px`);
      }
      const width = this.isCollapsed ? 0 : this.width;
      if (vertical || width == null) {
        // If we are resizing vertically or the "width" property is set to
        // null, we remove the CSS width variable. The width of the element
        // is left to be determined by the CSS stylesheet rules.
        this.parentNode.style.removeProperty(this._cssName.width);
      } else {
        this.parentNode.style.setProperty(this._cssName.width, `${width}px`);
      }
      this.resizeElement.classList.toggle(
        "collapsed-by-splitter",
        this.isCollapsed
      );
      this.classList.toggle("splitter-collapsed", this.isCollapsed);
      this.classList.toggle("splitter-before", this._beforeElement);
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
      }
    }

    _onMouseDown(event) {
      if (!this.resizeElement || this.isDisabled) {
        return;
      }
      if (event.buttons != 1) {
        return;
      }

      const vertical = this.resizeDirection == "vertical";
      const collapseSize =
        Number(
          this.getAttribute(vertical ? "collapse-height" : "collapse-width")
        ) || 0;
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
        size: this._getActualResizeSize(),
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
      this._updateSize(Math.max(0, size));
    }

    _onMouseUp(event) {
      event.preventDefault();
      this.endResize();
    }

    /**
     * Stop the resizing operation if it is currently active.
     */
    endResize() {
      if (!this._dragStartInfo) {
        return;
      }
      const didStart = this._started;

      delete this._dragStartInfo;
      delete this._started;

      window.removeEventListener("mousemove", this);
      window.removeEventListener("mouseup", this);
      document.documentElement.style.pointerEvents = null;
      document.documentElement.style.cursor = null;
      this.classList.remove("splitter-resizing");

      // Make sure our property corresponds to the actual final size.
      this._updateSize();

      if (didStart) {
        this.dispatchEvent(
          new CustomEvent("splitter-resized", { bubbles: true })
        );
      }
    }
  }
  customElements.define("pane-splitter", PaneSplitter, { extends: "hr" });
}
