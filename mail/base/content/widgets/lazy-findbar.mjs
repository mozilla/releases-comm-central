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
  constructor() {
    super();
    this._registerWithFindBarActor = this._registerWithFindBarActor.bind(this);
  }

  connectedCallback() {
    // Ensure this wrapper doesn't disrupt Thunderbird's strict XUL <vbox> flex
    // layouts.
    this.style.display = "contents";

    // Once materialized, the real findbar owns the actor registration.
    if (this.firstElementChild) {
      return;
    }

    const browser = this._getBrowser();
    // A `nodefaultsrc` browser has no window global until its first load. A
    // single retry is enough: the actor keys its registrations by the browser
    // element, which outlives navigations and remoteness changes.
    if (!this._registerWithFindBarActor()) {
      browser?.addEventListener("load", this._registerWithFindBarActor, {
        capture: true,
        once: true,
      });
    }
  }

  connectedMoveCallback() {
    // No-op: Allow moving this wrapper in the DOM tree without unregistering
    // and re-registering it (bug 2056718).
  }

  disconnectedCallback() {
    this._getBrowser()?.removeEventListener(
      "load",
      this._registerWithFindBarActor,
      true
    );
    // Once materialized, the real findbar owns the registration.
    if (!this.firstElementChild) {
      this._unregisterFromFindBarActor();
    }
  }

  // The wrapped <browser> is expected to be connected to the same document.
  _getBrowser() {
    const browserId = this.getAttribute("browserid");
    return browserId ? this.ownerDocument.getElementById(browserId) : null;
  }

  /**
   * Registers the wrapper with the FindBar actor, so in-content find as you
   * type reaches it before a real findbar has been materialized.
   *
   * @returns {boolean} Whether the wrapper is now the registered findbar.
   */
  _registerWithFindBarActor() {
    // Never shadow the real findbar, which registers itself once it exists.
    if (this.firstElementChild) {
      return false;
    }

    const browser = this._getBrowser();
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    if (!browser?.frameLoader || !windowGlobal) {
      return false;
    }

    const findbarParent = windowGlobal.getActor("FindBar");
    if (!findbarParent) {
      return false;
    }

    findbarParent.setFindbar(browser, this);
    return true;
  }

  _unregisterFromFindBarActor() {
    const browser = this._getBrowser();
    const windowGlobal = browser?.browsingContext?.currentWindowGlobal;
    if (!browser?.frameLoader || !windowGlobal) {
      return;
    }

    windowGlobal.getActor("FindBar")?.setFindbar(browser, null);
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

  // These methods allow the lazy wrapper to stand in for a real findbar in
  // FindBarParent until the first find operation materializes one.
  _onBrowserKeypress(event) {
    this.findbar._onBrowserKeypress(event);
  }

  onMouseUp() {
    this.firstElementChild?.onMouseUp();
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
    // Toggle the inner findbar, not the wrapper: a hidden display:contents
    // wrapper would hide the findbar entirely.
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
