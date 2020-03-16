/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { FeedUtils } = ChromeUtils.import("resource:///modules/FeedUtils.jsm");

/* Feed account standalone wizard functions */
var FeedAccountWizard = {
  accountName: "",

  onLoad() {
    document
      .querySelector("wizard")
      .addEventListener("wizardfinish", this.onFinish.bind(this));
    let accountSetupPage = document.getElementById("accountsetuppage");
    accountSetupPage.addEventListener(
      "pageshow",
      this.accountSetupPageValidate.bind(this)
    );
    accountSetupPage.addEventListener(
      "pagehide",
      this.accountSetupPageValidate.bind(this)
    );
    let donePage = document.getElementById("done");
    donePage.addEventListener("pageshow", this.donePageInit.bind(this));
  },

  accountSetupPageValidate() {
    this.accountName = document.getElementById("prettyName").value.trim();
    document.querySelector("wizard").canAdvance = this.accountName;
  },

  donePageInit() {
    document.getElementById("account.name.text").value = this.accountName;
  },

  onFinish() {
    let account = FeedUtils.createRssAccount(this.accountName);
    if ("gFolderTreeView" in window.opener.top) {
      // Opened from 3pane File->New or Appmenu New Message, or
      // Account Central link.
      window.opener.top.updateMailPaneUI();
      window.opener.top.gFolderTreeView.selectFolder(
        account.incomingServer.rootMsgFolder
      );
    } else if ("selectServer" in window.opener) {
      // Opened from Account Settings.
      window.opener.selectServer(account.incomingServer);
    }

    window.close();
  },
};
