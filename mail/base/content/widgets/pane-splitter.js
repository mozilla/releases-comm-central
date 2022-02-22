/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  /**
   * A widget for resizing two adjacent panes. If the dragged, sets a CSS
   * variable which is named for the id of the element plus "width" or
   * "height" as appropriate (e.g. --splitter1-width). The variable should
   * be used to set the width/height of one of the adjacent elements.
   *
   * By default, the splitter will resize the height of the preceding element.
   * Use the "resize-direction" and "resize" attributes to change this.
   *
   * Fires a "splitter-resizing" event as dragging begins, and
   * "splitter-resized" when it ends.
   *
   * The controlled pane can be collapsed and expanded. "splitter-collapsed"
   * and "splitter-expanded" events are fired as appropriate. If the splitter
   * has a "min-width"/"min-height" attribute, collapsing and expanding
   * happens automatically when below the minimum size.
   */
  class PaneSplitter extends HTMLHRElement {
    static observedAttributes = ["resize-direction"];

    /**
     * The sibling pane this splitter controls the size of.
     * @type {HTMLElement}
     */
    _adjacent = null;

    /**
     * The sibling pane which fills any remaining space.
     * @type {HTMLElement}
     */
    _opposite = null;

    /**
     * The width of the controlled pane. If the splitter is collapsed or in
     * the vertical orientation, this value probably will not match the true
     * width of the pane - it is remembered in case conditions change.
     * @type {integer}
     */
    _width = null;

    /**
     * The height of the controlled pane. If the splitter is collapsed or in
     * the horizontal orientation, this value probably will not match the true
     * height of the pane - it is remembered in case conditions change.
     * @type {HTMLElement}
     */
    _height = null;

    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      if (this.getAttribute("resize") == "next") {
        this._adjacent = this.nextElementSibling;
        this._opposite = this.previousElementSibling;
      } else {
        this._adjacent = this.previousElementSibling;
        this._opposite = this.nextElementSibling;
      }
      if (this.resizeDirection == "vertical") {
        this._height = this._adjacent.clientHeight;
      } else {
        this._width = this._adjacent.clientWidth;
      }

      this.addEventListener("mousedown", this);
    }

    attributeChangedCallback(name, oldValue, newValue) {
      switch (name) {
        case "resize-direction":
          this._updateResizeDirection();
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
    }

    /**
     * The width of the controlled pane. Use this value in persistent storage.
     * @type {integer}
     * @see _width
     */
    get width() {
      return this._width;
    }

    set width(width) {
      this._width = width;
      if (this.isCollapsed) {
        return;
      }
      this.parentNode.style.setProperty(`--${this.id}-width`, width + "px");
    }

    /**
     * The height of the controlled pane. Use this value in persistent storage.
     * @type {integer}
     * @see _height
     */
    get height() {
      return this._height;
    }

    set height(height) {
      this._height = height;
      if (this.isCollapsed) {
        return;
      }
      this.parentNode.style.setProperty(`--${this.id}-height`, height + "px");
    }

    /**
     * Collapses the controlled pane. A collapsed pane does not affect the
     * `width` or `height` properties. Fires a "splitter-collapsed" event.
     */
    collapse() {
      if (this.isCollapsed) {
        return;
      }
      if (this.resizeDirection == "vertical") {
        this.parentNode.style.setProperty(`--${this.id}-height`, "0");
      } else {
        this.parentNode.style.setProperty(`--${this.id}-width`, "0");
      }
      this._adjacent.style.visibility = "collapse";
      this.dispatchEvent(
        new CustomEvent("splitter-collapsed", { bubbles: true })
      );
    }

    /**
     * Expands the controlled pane. It returns to the width or height it had
     * when collapsed. Fires a "splitter-expanded" event.
     */
    expand() {
      if (!this.isCollapsed) {
        return;
      }
      if (this.resizeDirection == "vertical") {
        this.parentNode.style.setProperty(
          `--${this.id}-height`,
          this._height + "px"
        );
      } else {
        this.parentNode.style.setProperty(
          `--${this.id}-width`,
          this._width + "px"
        );
      }
      this._adjacent.style.visibility = null;
      this.dispatchEvent(
        new CustomEvent("splitter-expanded", { bubbles: true })
      );
    }

    /**
     * If the controlled pane is collapsed.
     * @type {boolean}
     */
    get isCollapsed() {
      return this._adjacent.style.visibility == "collapse";
    }

    set isCollapsed(collapsed) {
      if (collapsed) {
        this.collapse();
      } else {
        this.expand();
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
      }
    }

    _onMouseDown(event) {
      if (event.buttons != 1) {
        return;
      }

      let vertical = this.resizeDirection == "vertical";

      let parentSize = this.parentNode.getBoundingClientRect()[
        vertical ? "height" : "width"
      ];
      let minSize = this.getAttribute(vertical ? "min-height" : "min-width");
      let oppositeMinSize = getComputedStyle(this._opposite)[
        vertical ? "min-height" : "min-width"
      ];

      let min =
        minSize == null ? 0 : Math.min(parentSize, parseInt(minSize, 10));
      let max =
        oppositeMinSize == "auto"
          ? parentSize
          : Math.max(min, parentSize - parseInt(oppositeMinSize, 10));

      let resizeNext = this.getAttribute("resize") == "next";
      let ltrDir = this.parentNode.matches(":dir(ltr)");

      this._dragStartInfo = {
        wasCollapsed: this.isCollapsed,
        // Whether this will resize vertically.
        vertical,
        pos: vertical ? event.clientY : event.clientX,
        // Whether decreasing X/Y should increase the size.
        negative: vertical ? resizeNext : resizeNext == ltrDir,
        size: this._adjacent.getBoundingClientRect()[
          vertical ? "height" : "width"
        ],
        min,
        max,
      };

      event.preventDefault();
      window.addEventListener("mousemove", this);
      window.addEventListener("mouseup", this);
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

      if (didStart) {
        this.dispatchEvent(
          new CustomEvent("splitter-resized", { bubbles: true })
        );
      }
    }
  }
  customElements.define("pane-splitter", PaneSplitter, { extends: "hr" });
}
