/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  /**
   * A widget for dividing and exchanging space between two sibling panes: the
   * {@link PaneSplitter#resizeElement} and the
   * {@link PaneSplitter#oppositeElement}. If dragged, the splitter will set a
   * CSS variable on the parent element, which is named from the id of the
   * element plus "width" or "height" as appropriate (e.g. --splitter-width).
   * The variable should be used to set the width/height of the resizeElement,
   * whilst the oppositeElement should occupy the remaining space.
   *
   * By default, the splitter will resize the height of the resizeElement, but
   * this can be changed using the "resize-direction" attribute.
   *
   * This element fires a "splitter-resizing" event as dragging begins, and
   * "splitter-resized" when it ends.
   *
   * The resizeElement can be collapsed and expanded. Whilst collapsed, the CSS
   * visibility of the resizeElement is set to "collapse" and the "--<id>-width"
   * or "--<id>-height" CSS variable, will be be set to "0px". The
   * "splitter-collapsed" and "splitter-expanded" events are fired as
   * appropriate. If the splitter has a "min-width" or "min-height" attribute,
   * collapsing and expanding happens automatically when below the minimum size.
   */
  class PaneSplitter extends HTMLHRElement {
    static observedAttributes = [
      "resize-direction",
      "resize-id",
      "opposite-id",
      "id",
    ];

    connectedCallback() {
      this.addEventListener("mousedown", this);
      this._updateStyling();
    }

    attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case "resize-direction":
          this._updateResizeDirection();
          break;
        case "resize-id":
          // Make sure we don't loop when resize-id is set in the resizeElement
          // setter.
          if (newValue == null && this.resizeElement) {
            this.resizeElement = null;
          } else if (newValue != null && newValue != this.resizeElement?.id) {
            this.resizeElement = this.ownerDocument.getElementById(newValue);
          }
          break;
        case "opposite-id":
          // Make sure we don't loop when opposite-id is set in the
          // oppositeElement setter.
          if (newValue == null && this.oppositeElement) {
            this.oppositeElement = null;
          } else if (newValue != null && newValue != this.oppositeElement?.id) {
            this.oppositeElement = this.ownerDocument.getElementById(newValue);
          }
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
      return this._resizeElement;
    }

    set resizeElement(element) {
      if (!element?.id) {
        element = null;
      }
      if (element == this._resizeElement) {
        return;
      }
      this.endResize();
      if (this._resizeElement) {
        // Clean up previous element.
        this._resizeElement.style.visibility = null;
      }
      this._resizeElement = element;
      if (element) {
        this.setAttribute("resize-id", element.id);
      } else {
        this.removeAttribute("resize-id");
      }
      this._beforeElement =
        element &&
        !!(
          this.compareDocumentPosition(element) &
          Node.DOCUMENT_POSITION_FOLLOWING
        );
      this._updateStyling();
    }

    _oppositeElement = null;

    /**
     * The element that resizeElement exchanges space with. It must have a set
     * id.
     *
     * A set "min-width" or "min-height" style on this element will limit the
     * growth of the resizeElement. If such styles are set, the element should
     * also use "box-sizing: border-box".
     *
     * If the "opposite-id" attribute is set, it will be used to choose this
     * element by its id.
     *
     * @type {?HTMLElement}
     */
    get oppositeElement() {
      return this._oppositeElement;
    }

    set oppositeElement(element) {
      if (!element?.id) {
        element = null;
      }
      if (element == this._oppositeElement) {
        return;
      }
      this.endResize();
      this._oppositeElement = element;
      if (element) {
        this.setAttribute("opposite-id", element.id);
      } else {
        this.removeAttribute("opposite-id");
      }
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
     * @type {?integer}
     */
    get width() {
      return this._width;
    }

    set width(width) {
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
     * @type {?integer}
     */
    get height() {
      return this._height;
    }

    set height(height) {
      this._height = height;
      this._updateStyling();
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
      this.dispatchEvent(
        new CustomEvent("splitter-expanded", { bubbles: true })
      );
    }

    _isCollapsed = false;

    /**
     * If the controlled pane is collapsed.
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

      let vertical = this.resizeDirection == "vertical";
      let height = this.isCollapsed ? 0 : this.height;
      if (!vertical || height == null) {
        // If we are resizing horizontally or the "height" property is set to
        // null, we remove the CSS height variable. The height of the element
        // is left to be determined by the CSS stylesheet rules.
        this.parentNode.style.removeProperty(this._cssName.height);
      } else {
        this.parentNode.style.setProperty(this._cssName.height, `${height}px`);
      }
      let width = this.isCollapsed ? 0 : this.width;
      if (vertical || width == null) {
        // If we are resizing vertically or the "width" property is set to
        // null, we remove the CSS width variable. The width of the element
        // is left to be determined by the CSS stylesheet rules.
        this.parentNode.style.removeProperty(this._cssName.width);
      } else {
        this.parentNode.style.setProperty(this._cssName.width, `${width}px`);
      }
      this.resizeElement.style.visibility = this.isCollapsed
        ? "collapse"
        : null;
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
      if (!this.resizeElement || !this.oppositeElement) {
        return;
      }

      if (event.buttons != 1) {
        return;
      }

      let vertical = this.resizeDirection == "vertical";

      // We can only consume the available size occupied by the opposite
      // element.
      // NOTE: The following only works under a number of assumptions,
      // including:
      //  + There is no margins on the two elements, such that their border
      //    boxes match their occupying size in the parent layout.
      //  + The opposite element's min-height or min-width styles, if defined,
      //    have pixel values that correspond to their actual possible minimum
      //    size in the parent's layout. As such:
      //     + The opposite element should use box-sizing: border-box.
      //     + The style must be the only relevant limiting sizing effects. For
      //       example, a grid-template where minmax(500px, 1fr) applies to the
      //       element would break this assumption.
      let resizeRect = this.resizeElement.getBoundingClientRect();
      let oppositeRect = this.oppositeElement.getBoundingClientRect();
      let jointSize = vertical
        ? resizeRect.height + oppositeRect.height
        : resizeRect.width + oppositeRect.width;
      let oppositeMinSize = getComputedStyle(this.oppositeElement)[
        vertical ? "min-height" : "min-width"
      ];
      let minSize = this.getAttribute(vertical ? "min-height" : "min-width");

      let min =
        minSize == null ? 0 : Math.min(jointSize, parseInt(minSize, 10));
      let max =
        oppositeMinSize == "auto"
          ? jointSize
          : Math.max(min, jointSize - parseInt(oppositeMinSize, 10));

      let ltrDir = this.parentNode.matches(":dir(ltr)");

      this._dragStartInfo = {
        wasCollapsed: this.isCollapsed,
        // Whether this will resize vertically.
        vertical,
        pos: vertical ? event.clientY : event.clientX,
        // Whether decreasing X/Y should increase the size.
        negative: vertical
          ? this._beforeElement
          : this._beforeElement == ltrDir,
        size: vertical ? resizeRect.height : resizeRect.width,
        min,
        max,
      };

      event.preventDefault();
      window.addEventListener("mousemove", this);
      window.addEventListener("mouseup", this);
      // Block all other pointer events whilst resizing. This ensures we don't
      // trigger any styling or other effects whilst resizing. This also ensures
      // that the MouseEvent's clientX and clientY will always be relative to
      // the current window, rather than some ancestor xul:browser's window.
      document.documentElement.style.pointerEvents = "none";
      // Maintain an appropriate cursor whilst resizing.
      document.documentElement.style.cursor = vertical
        ? "ns-resize"
        : "ew-resize";
    }

    _onMouseMove(event) {
      if (event.buttons != 1) {
        // The button was released and we didn't get a mouseup event (e.g.
        // releasing the mouse above a disabled html:button), or the
        // button(s) pressed changed. Either way, stop dragging.
        this.endResize();
        return;
      }

      event.preventDefault();

      let {
        wasCollapsed,
        vertical,
        negative,
        pos,
        size,
        min,
        max,
      } = this._dragStartInfo;

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
      if (min) {
        let pastCollapseThreshold = size < min - 20;
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
      }
      this[vertical ? "height" : "width"] = Math.min(Math.max(size, min), max);
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
      let didStart = this._started;

      delete this._dragStartInfo;
      delete this._started;

      window.removeEventListener("mousemove", this);
      window.removeEventListener("mouseup", this);
      document.documentElement.style.pointerEvents = null;
      document.documentElement.style.cursor = null;

      if (didStart) {
        this.dispatchEvent(
          new CustomEvent("splitter-resized", { bubbles: true })
        );
      }
    }
  }
  customElements.define("pane-splitter", PaneSplitter, { extends: "hr" });
}
