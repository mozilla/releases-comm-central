/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A tree column header with an icon instead of a label.
 *
 * @augments {MozTreecol}
 *
 * NOTE: Icon column headers should have their "label" attribute set to
 * describe the icon for the accessibility tree.
 *
 * NOTE: Ideally we could listen for the "alt" attribute and pass it on to the
 * contained <img>, but the accessibility tree only seems to read the "label"
 * for a <treecol>, and ignores the alt text.
 */
class MozTreecolImage extends customElements.get("treecol") {
  static get observedAttributes() {
    return ["src", ...super.observedAttributes];
  }

  connectedCallback() {
    if (this.hasChildNodes() || this.delayConnectedCallback()) {
      return;
    }
    this.image = document.createElement("img");
    this.image.classList.add("treecol-icon");

    this.appendChild(this.image);
    this._updateAttributes();

    this.initializeAttributeInheritance();
    if (this.hasAttribute("ordinal")) {
      this.style.order = this.getAttribute("ordinal");
    }
  }

  attributeChangedCallback(attrName, oldValue, newValue) {
    super.attributeChangedCallback(attrName, oldValue, newValue);
    this._updateAttributes();
  }

  _updateAttributes() {
    if (!this.image) {
      return;
    }

    const src = this.getAttribute("src");

    if (src != null) {
      this.image.setAttribute("src", src);
    } else {
      this.image.removeAttribute("src");
    }
  }
}
customElements.define("treecol-image", MozTreecolImage, {
  extends: "treecol",
});
