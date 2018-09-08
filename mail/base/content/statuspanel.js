/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */

class MozStatuspanel extends MozXULElement {
  static get observedAttributes() {
    return ["label", "mirror"];
  }

  connectedCallback() {
    const hbox = document.createElement("hbox");
    hbox.setAttribute("class", "statuspanel-inner");

    const label = document.createElement("label");
    label.setAttribute("class", "statuspanel-label");
    label.setAttribute("flex", "1");
    label.setAttribute("crop", "end");

    hbox.appendChild(label);
    this.appendChild(hbox);

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
    return val;
  }

  get label() {
    return this.getAttribute("label");
  }

  _updateAttributes() {
    if (!this.isConnected) {
      return;
    }

    const statuspanelLabel = this.querySelector(".statuspanel-label");

    if (this.hasAttribute("label")) {
      statuspanelLabel.setAttribute("value", this.getAttribute("label"));
    } else {
      statuspanelLabel.removeAttribute("value");
    }

    if (this.hasAttribute("mirror")) {
      statuspanelLabel.setAttribute("mirror", this.getAttribute("mirror"));
    } else {
      statuspanelLabel.removeAttribute("mirror");
    }
  }

  _setupEventListeners() {
    this.addEventListener("mouseover", event => {
      if (this.hasAttribute("mirror")) {
        this.removeAttribute("mirror");
      } else {
        this.setAttribute("mirror", "true");
      }
    });
  }
}

customElements.define("statuspanel", MozStatuspanel);
