/**
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* global MozXULElement */
/* global openUILink */

class MozMailHeaderfield extends MozXULElement {
  connectedCallback() {
    this.setAttribute("context", "copyPopup");
    this.classList.add("headerValue");
  }

  set headerValue(val) {
    return (this.textContent = val);
  }
}

class MozMailUrlfield extends MozMailHeaderfield {
  connectedCallback() {
    super.connectedCallback();
    this.classList.add("text-link", "headerValueUrl");
    this.addEventListener("click", (event) => {
      if (event.button != 2) {
        openUILink(encodeURI(event.target.textContent), event);
      }
    });
  }
}

customElements.define("mail-headerfield", MozMailHeaderfield);
customElements.define("mail-urlfield", MozMailUrlfield);
