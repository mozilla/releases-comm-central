/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

// mail/base/content/protovis-r2.6-modded.js
/* globals pv */

var {cloudFileAccounts} = ChromeUtils.import("resource:///modules/cloudFileAccounts.js");

var accountId = new URL(location.href).searchParams.get("accountId");
var account = cloudFileAccounts.getAccount(accountId);

var loading = document.getElementById("provider-loading");
var auth = document.getElementById("provider-auth");
var spacebox = document.getElementById("provider-spacebox");

if (cloudFileAccounts.getSecretValue(accountId, cloudFileAccounts.kTokenRealm)) {
  onDoLoad();
} else {
  loading.hidden = true;
  auth.hidden = false;
}

function onDoAuth(button) {
  button.disabled = true;
  loading.hidden = false;
  auth.hidden = true;

  account.createExistingAccount({
    onStartRequest() {
    },
    onStopRequest(unused1, unused2, error) {
      button.disabled = false;
      if (error) {
        loading.hidden = true;
        auth.hidden = false;
        return;
      }

      cloudFileAccounts.emit("accountConfigured", account);
      onDoLoad();
    },
  }, () => {
    button.disabled = false;
    loading.hidden = true;
    auth.hidden = false;
  });
}

function onDoLoad() {
  account.refreshUserInfo(false, {
    onStartRequest() {
    },
    onStopRequest() {
      loading.hidden = true;
      spacebox.hidden = false;
      onLoadProvider(account);
    },
  });
}

function onLoadProvider(account) {
  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

  let fileSpaceUsed = document.getElementById("file-space-used");
  fileSpaceUsed.textContent = messenger.formatFileSize(account.fileSpaceUsed);
  let fileSpaceUsedSwatch = document.getElementById("file-space-used-swatch");
  fileSpaceUsedSwatch.style.backgroundColor = pv.Colors.category20.values[0];

  let remainingFileSpace = document.getElementById("remaining-file-space");
  remainingFileSpace.textContent = messenger.formatFileSize(account.remainingFileSpace);
  let remainingFileSpaceSwatch = document.getElementById("remaining-file-space-swatch");
  remainingFileSpaceSwatch.style.backgroundColor = pv.Colors.category20.values[1];

  let totalSpace = account.fileSpaceUsed + account.remainingFileSpace;
  let pieScale = 2 * Math.PI / totalSpace;

  let spaceDiv = document.getElementById("provider-space-visuals");
  let vis = new pv.Panel().canvas(spaceDiv)
    .width(150)
    .height(150);
  vis.add(pv.Wedge)
    .data([account.fileSpaceUsed, account.remainingFileSpace])
    .left(75)
    .top(75)
    .innerRadius(30)
    .outerRadius(65)
    .angle(d => d * pieScale);

  vis.add(pv.Label)
    .left(75)
    .top(75)
    .font("14px Sans-Serif")
    .textAlign("center")
    .textBaseline("middle")
    .text(messenger.formatFileSize(totalSpace));

  vis.render();
}
