/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

/**
 * Account Hub Footer Template
 * Template ID: #accountHubFooterTemplate (from accountHubFooterTemplate.inc.xhtml)
 */

class AccountHubFooter extends HTMLElement {
  /**
   * Property to store disabled state of footer.
   *
   * @type {boolean}
   */
  #disabled = false;

  connectedCallback() {
    if (this.hasConnected) {
      return;
    }
    this.hasConnected = true;

    const template = document
      .getElementById("accountHubFooterTemplate")
      .content.cloneNode(true);
    this.appendChild(template);
    this.querySelector("#back").addEventListener("click", this);
    this.querySelector("#forward").addEventListener("click", this);

    const customAction = this.querySelector("#custom");
    if (customAction) {
      customAction.addEventListener("click", this);
    }

    this.#showReleaseNotes();
  }

  handleEvent(event) {
    if (event.target.id === "custom") {
      this.dispatchEvent(new CustomEvent("custom-footer-action"));
      return;
    }
    this.dispatchEvent(new CustomEvent(event.target.id));
  }

  canBack(value) {
    this.querySelector("#back").hidden = !value;
  }

  canForward(value) {
    this.querySelector("#forward").hidden = !value;
  }

  toggleForwardDisabled(value) {
    this.querySelector("#forward").disabled = value || this.disabled;
  }

  toggleBackDisabled(value) {
    this.querySelector("#back").disabled = value;
  }

  canCustom(value) {
    const customAction = this.querySelector("#custom");
    customAction.hidden = !value;
    customAction.disabled = !value || this.disabled;
    if (value) {
      customAction.addEventListener("click", this);
      document.l10n.setAttributes(customAction, value);
    }
  }

  /**
   * Updates the text of the forward and back buttons
   *
   * @param {"forward" | "back"} type If the forward or back button should be
   *   targeted
   * @param {string} fluentID The fluent id to use for the label
   */
  setDirectionalButtonText(
    type,
    fluentID = type === "forward"
      ? "account-hub-email-continue-button"
      : "account-hub-email-back-button"
  ) {
    document.l10n.setAttributes(this.querySelector(`#${type}`), fluentID);
  }

  #showReleaseNotes() {
    // We don't have release notes for Daily releases.
    if (AppConstants.NIGHTLY_BUILD) {
      return;
    }

    const relNotesPrefType = Services.prefs.getPrefType("app.releaseNotesURL");
    if (relNotesPrefType == Services.prefs.PREF_INVALID) {
      return;
    }

    // Show a release notes link if we have a URL.
    const relNotesURL = Services.urlFormatter.formatURLPref(
      "app.releaseNotesURL"
    );
    if (relNotesURL == "about:blank") {
      return;
    }
    const relNotesLink = this.querySelector("#hubReleaseNotes");
    relNotesLink.href = relNotesURL;
    relNotesLink.closest("li[hidden]").hidden = false;
  }

  get disabled() {
    return this.#disabled;
  }

  set disabled(val) {
    this.#disabled = val;
    this.toggleForwardDisabled(val);
    const customAction = this.querySelector("#custom");
    if (!customAction.hidden) {
      customAction.disabled = val;
    }
  }
}

customElements.define("account-hub-footer", AccountHubFooter);
