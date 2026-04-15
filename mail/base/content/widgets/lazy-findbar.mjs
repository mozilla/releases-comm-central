/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * A wrapper element that delays the instantiation of a MozFindbar
 * until it is actively requested. This prevents premature Finder binding
 * and bypasses race conditions during window load and remoteness changes.
 *
 * @tagname lazy-findbar
 */
export class LazyFindbar extends HTMLElement {
  connectedCallback() {
    // Ensure this wrapper doesn't disrupt Thunderbird's strict XUL <vbox> flex
    // layouts.
    this.style.display = "contents";
  }

  /**
   * Gets the inner findbar, creating it if it doesn't exist yet.
   *
   * @returns {MozFindbar}
   */
  get findbar() {
    if (!this.firstElementChild) {
      const fb = document.createXULElement("findbar");
      if (this.hasAttribute("browserid")) {
        fb.setAttribute("browserid", this.getAttribute("browserid"));
      }
      this.appendChild(fb);
    }
    return this.firstElementChild;
  }

  onFindCommand() {
    this.findbar.onFindCommand();
  }
  onFindAgainCommand(aReverse) {
    this.findbar.onFindAgainCommand(aReverse);
  }
  onFindSelectionCommand() {
    this.findbar.onFindSelectionCommand();
  }
  open() {
    this.findbar.open();
  }

  get browser() {
    return this.firstElementChild?.browser ?? null;
  }
  set browser(val) {
    this.findbar.browser = val;
  }

  get hidden() {
    return this.firstElementChild?.hidden ?? true;
  }
  set hidden(val) {
    this.toggleAttribute("hidden", val);

    if (this.firstElementChild) {
      this.firstElementChild.hidden = val;
    }
  }

  clear() {
    this.firstElementChild?.clear();
  }

  close() {
    this.firstElementChild?.close();
  }

  // Chat log panel passthroughs.
  get _findField() {
    return this.findbar._findField;
  }
  get _findFailedString() {
    return this.findbar._findFailedString;
  }
}
customElements.define("lazy-findbar", LazyFindbar);
