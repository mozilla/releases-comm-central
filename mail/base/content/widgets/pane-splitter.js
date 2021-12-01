/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

{
  /**
   * A widget for resizing two adjacent panes. If the dragged, sets a CSS
   * variable which is named for the id of the element plus "width" or
   * "height" as appropriate (e.g. --splitter1-width). The variable should
   * be used to set the width/height of one of the adjacent elements.
   * Typically this would be the preceding element. To use the following
   * element instead, set resize="next".
   *
   * Fires a "splitter-resizing" event as dragging begins, and
   * "splitter-resized" when it ends.
   *
   * The controlled pane can be collapsed and expanded. "splitter-collapsed"
   * and "splitter-expanded" events are fired as appropriate. If the splitter
   * has a data-min-width/data-min-height attribute, collapsing and expanding
   * happens automatically when below the minimum size.
   */
  class PaneSplitter extends HTMLHRElement {
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

      this._adjacent = this.previousElementSibling;
      this._opposite = this.nextElementSibling;
      if (this.getAttribute("resize") == "next") {
        [this._adjacent, this._opposite] = [this._opposite, this._adjacent];
      }

      if (this.orientation == "vertical") {
        this._height = this._adjacent.clientHeight;
      } else {
        this._width = this._adjacent.clientWidth;
      }

      this.addEventListener("mousedown", this);
    }

    /**
     * The axis of the splitter's movement. A splitter in the vertical
     * orientation has panes above and below it. In horizontal orientation,
     * the panes are beside it.
     * @type {"vertical"|"horizontal"}
     */
    get orientation() {
      return this.clientWidth > this.clientHeight ? "vertical" : "horizontal";
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
      if (this.orientation == "vertical") {
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
      if (this.orientation == "vertical") {
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

      let { width, height } = this.parentNode.getBoundingClientRect();

      let oppositeStyle = getComputedStyle(this._opposite);

      this._dragStartInfo = {
        wasCollapsed: this.isCollapsed,
        x: event.clientX,
        y: event.clientY,
        width: this._adjacent.getBoundingClientRect().width,
        height: this._adjacent.getBoundingClientRect().height,
        min: 0,
      };

      if (this.orientation == "vertical") {
        this._dragStartInfo.max = height;

        if (this.hasAttribute("min-height")) {
          this._dragStartInfo.min = Math.min(
            height,
            parseInt(this.getAttribute("min-height"), 10)
          );
        }
        if (oppositeStyle.minHeight != "auto") {
          this._dragStartInfo.max = Math.max(
            this._dragStartInfo.min,
            height - parseInt(oppositeStyle.minHeight, 10)
          );
        }
      } else {
        this._dragStartInfo.max = width;

        if (this.hasAttribute("min-width")) {
          this._dragStartInfo.min = Math.min(
            width,
            parseInt(this.getAttribute("min-width"), 10)
          );
        }
        if (oppositeStyle.minWidth != "auto") {
          this._dragStartInfo.max = Math.max(
            this._dragStartInfo.min,
            width - parseInt(oppositeStyle.minWidth, 10)
          );
        }
      }

      event.preventDefault();
      window.addEventListener("mousemove", this);
      window.addEventListener("mouseup", this);
    }

    _onMouseMove(event) {
      if (event.buttons != 1) {
        // The button was released and we didn't get a mouseup event, or the
        // button(s) pressed changed. Either way, stop dragging.
        this._onMouseUp(event);
        return;
      }

      event.preventDefault();

      let delta, position, property;
      let { wasCollapsed, x, y, width, height, min, max } = this._dragStartInfo;

      if (this.orientation == "vertical") {
        delta = event.clientY - y;
        if (this.getAttribute("resize") == "next") {
          delta *= -1;
        }
        position = height + delta;
        property = "height";
      } else {
        delta = event.clientX - x;
        if (this.matches(":dir(rtl)")) {
          delta *= -1;
        }
        if (this.getAttribute("resize") == "next") {
          delta *= -1;
        }
        position = width + delta;
        property = "width";
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

      let clampedPosition = Math.min(Math.max(position, min), max);
      if (min) {
        let pastCollapseThreshold = position < min - 20;
        if (wasCollapsed) {
          if (!pastCollapseThreshold) {
            this._dragStartInfo.wasCollapsed = false;
          }
          pastCollapseThreshold = position < 20;
        }

        if (pastCollapseThreshold) {
          this.collapse();
          return;
        }

        this.expand();
      }
      this[property] = clampedPosition;
    }

    _onMouseUp(event) {
      let didStart = this._started;

      delete this._dragStartInfo;
      delete this._started;

      event.preventDefault();
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
