/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */

// Wrap in a block to prevent leaking to window scope.
{
  class MozStatuspanel extends MozXULElement {
    static get observedAttributes() {
      return ["label", "mirror"];
    }

    connectedCallback() {
      const hbox = document.createXULElement("hbox");
      hbox.classList.add("statuspanel-inner");

      const label = document.createXULElement("label");
      label.classList.add("statuspanel-label");
      label.setAttribute("flex", "1");
      label.setAttribute("crop", "end");

      hbox.appendChild(label);
      this.appendChild(hbox);

      this._labelElement = label;

      this._updateAttributes();
      this._setupEventListeners();
    }

    attributeChangedCallback() {
      this._updateAttributes();
    }

    set label(val) {
      if (!this.label) {
        this.removeAttribute("mirror");
      }
      this.setAttribute("label", val);
    }

    get label() {
      return this.getAttribute("label");
    }

    _updateAttributes() {
      if (!this._labelElement) {
        return;
      }

      if (this.hasAttribute("label")) {
        this._labelElement.setAttribute("value", this.getAttribute("label"));
      } else {
        this._labelElement.removeAttribute("value");
      }

      if (this.hasAttribute("mirror")) {
        this._labelElement.setAttribute("mirror", this.getAttribute("mirror"));
      } else {
        this._labelElement.removeAttribute("mirror");
      }
    }

    _setupEventListeners() {
      this.addEventListener("mouseover", () => {
        if (this.hasAttribute("mirror")) {
          this.removeAttribute("mirror");
        } else {
          this.setAttribute("mirror", "true");
        }
      });
    }
  }

  customElements.define("statuspanel", MozStatuspanel);
}
