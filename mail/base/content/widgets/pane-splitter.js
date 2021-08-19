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
   * element instead, set the "after" attribute.
   *
   * Fires a "splitter-resizing" event as dragging begins, and
   * "splitter-resized" when it ends.
   */
  class PaneSplitter extends HTMLHRElement {
    connectedCallback() {
      if (this.hasConnected) {
        return;
      }
      this.hasConnected = true;

      this._sibling = this.hasAttribute("after")
        ? this.nextElementSibling
        : this.previousElementSibling;

      this.addEventListener("mousedown", this);
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
      this._min = 0;

      if (this.clientWidth > this.clientHeight) {
        this._var = `--${this.id}-height`;
        this._height = this._sibling.getBoundingClientRect().height;
        this._y = event.clientY;
        this._max = height;
      } else {
        this._var = `--${this.id}-width`;
        this._width = this._sibling.getBoundingClientRect().width;
        this._x = event.clientX;
        this._max = width;
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

      if ("_height" in this) {
        let delta = event.clientY - this._y;
        if (!this._started) {
          if (Math.abs(delta) < 3) {
            return;
          }
          this._started = true;
          this.dispatchEvent(
            new CustomEvent("splitter-resizing", { bubbles: true })
          );
        }
        if (this.hasAttribute("after")) {
          delta *= -1;
        }
        this.parentNode.style.setProperty(
          this._var,
          Math.min(Math.max(this._height + delta, this._min), this._max) + "px"
        );
      } else if ("_width" in this) {
        let delta = event.clientX - this._x;
        if (!this._started) {
          if (Math.abs(delta) < 3) {
            return;
          }
          this._started = true;
          this.dispatchEvent(
            new CustomEvent("splitter-resizing", { bubbles: true })
          );
        }
        if (this.matches(":dir(rtl)")) {
          delta *= -1;
        }
        if (this.hasAttribute("after")) {
          delta *= -1;
        }
        this.parentNode.style.setProperty(
          this._var,
          Math.min(Math.max(this._width + delta, this._min), this._max) + "px"
        );
      }

      event.preventDefault();
    }

    _onMouseUp(event) {
      let didStart = this._started;

      delete this._var;
      delete this._height;
      delete this._width;
      delete this._x;
      delete this._y;
      delete this._min;
      delete this._max;
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
