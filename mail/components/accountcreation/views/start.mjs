/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

class AccountHubStart extends HTMLElement {
  connectedCallback() {
    this.classList.add("account-hub-view");

    let template = document.getElementById("accountHubStart");
    this.appendChild(template.content.cloneNode(true));

    this.initUI();
  }

  /**
   * Update the UI to reflect reality whenever this view is triggered.
   */
  initUI() {
    const hasAccounts = MailServices.accounts.accounts.length;
    this.querySelector("#welcomeHeader").hidden = hasAccounts;
    this.querySelector("#defaultHeader").hidden = !hasAccounts;

    // Hide the release notes link for nightly builds since we don't have any.
    if (AppConstants.NIGHTLY_BUILD) {
      this.querySelector("#hubReleaseNotes").closest("li").hidden = true;
      return;
    }

    if (
      Services.prefs.getPrefType("app.releaseNotesURL") !=
      Services.prefs.PREF_INVALID
    ) {
      let relNotesURL = Services.urlFormatter.formatURLPref(
        "app.releaseNotesURL"
      );
      if (relNotesURL != "about:blank") {
        this.querySelector("#hubReleaseNotes").href = relNotesURL;
        return;
      }
      // Hide the release notes link if we don't have a URL to add.
      this.querySelector("#hubReleaseNotes").closest("li").hidden = true;
    }
  }

  /**
   * The start view doesn't have any abortable operation that needs to be
   * checked, so we always return true.
   *
   * @returns {boolean} - Always true.
   */
  reset() {
    return true;
  }
}
customElements.define("account-hub-start", AccountHubStart);
