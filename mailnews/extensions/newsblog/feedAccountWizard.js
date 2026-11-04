/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.importESModule(
  "resource:///modules/FeedUtils.sys.mjs"
);

window.addEventListener("DOMContentLoaded", () => {
  FeedAccountWizard.onLoad();
});

/** Feed account standalone wizard functions. */
var FeedAccountWizard = {
  accountName: "",

  /** Initializes the wizard events and the default account name. */
  async onLoad() {
    const wizard = document.querySelector("wizard");
    wizard.canAdvance = false;
    wizard.addEventListener("wizardfinish", this.onFinish.bind(this));
    const accountSetupPage = document.getElementById("accountsetuppage");
    accountSetupPage.addEventListener(
      "pageshow",
      this.accountSetupPageValidate.bind(this)
    );
    accountSetupPage.addEventListener(
      "pagehide",
      this.accountSetupPageValidate.bind(this)
    );
    const donePage = document.getElementById("done");
    donePage.addEventListener("pageshow", this.donePageInit.bind(this));

    const nameInput = document.getElementById("prettyName");
    nameInput.disabled = true;
    nameInput.value = await document.l10n.formatValue(
      "account-settings-rss-default-account-name"
    );
    nameInput.disabled = false;
    this.accountSetupPageValidate();
  },

  accountSetupPageValidate() {
    this.accountName = document.getElementById("prettyName").value.trim();
    document.querySelector("wizard").canAdvance = this.accountName;
  },

  donePageInit() {
    document.getElementById("account.name.text").value = this.accountName;
  },

  onFinish() {
    const account = FeedUtils.createRssAccount(this.accountName);
    const openerWindow = window.opener.top;
    // The following block is the same as in AccountWizard.js.
    if ("selectServer" in openerWindow) {
      // Opened from Account Settings.
      openerWindow.selectServer(account.incomingServer);
    }

    // Post a message to the main window on successful account setup.
    openerWindow.postMessage("account-created", "*");

    window.close();
  },
};
