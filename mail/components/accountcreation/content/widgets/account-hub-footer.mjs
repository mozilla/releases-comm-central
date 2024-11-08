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
    this.querySelector("#forward").disabled = value;
  }

  canCustom(value) {
    const customAction = this.querySelector("#custom");
    customAction.hidden = !value;
    customAction.disabled = !value;
    if (value) {
      customAction.disabled = false;
      customAction.addEventListener("click", this);
      document.l10n.setAttributes(customAction, value);
    }
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
}

customElements.define("account-hub-footer", AccountHubFooter);
