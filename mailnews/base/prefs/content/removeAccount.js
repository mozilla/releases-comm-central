/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource:///modules/mailServices.js");
Components.utils.import("resource://gre/modules/Services.jsm");

var gServer;
var gDialog;

function onLoad(event) {
  gServer = window.arguments[0].account.incomingServer;
  gDialog = document.documentElement;

  let bundle = document.getElementById("bundle_removeAccount");
  let removeQuestion = bundle.getFormattedString("removeQuestion",
                                                 [gServer.prettyName]);
  document.getElementById("accountName").textContent = removeQuestion;

  // Do not allow removal if localPath is outside of profile folder.
  let profilePath = Services.dirsvc.get("ProfD", Components.interfaces.nsIFile)
  profilePath.normalize();
  let localDirectory = gServer.localPath
  localDirectory.normalize();
  // TODO: bug 77652, decide what to do for deferred accounts.
  // And inform the user if the account localPath is outside the profile.
  if ((gServer.isDeferredTo ||
      (gServer instanceof Components.interfaces.nsIPop3IncomingServer &&
       gServer.deferredToAccount)) ||
       !profilePath.contains(localDirectory)) {
    document.getElementById("removeData").disabled = true;
  }

  enableRemove();
  window.sizeToContent();
}

function enableRemove() {
  gDialog.getButton("accept").disabled =
    (!document.getElementById("removeAccount").checked &&
     !document.getElementById("removeData").checked);
}

/**
 * Show the local directory.
 */
function openLocalDirectory() {
  let nsLocalFile = Components.Constructor("@mozilla.org/file/local;1",
                                           "nsILocalFile", "initWithPath");
  let localDir = gServer.localPath.path;
  try {
    new nsLocalFile(localDir).reveal();
  } catch(e) {
    // Reveal may fail e.g. on Linux, then just show the path as a string.
    document.getElementById("localDirectory").value = localDir;
    document.getElementById("localDirectory").collapsed = false;
  }
}

function showInfo() {
  let descs = document.querySelectorAll("vbox.indent");
  for (let desc of descs) {
    desc.collapsed = false;
  }

  if (gServer.type == "imap" || gServer.type == "nntp") {
    document.getElementById("serverAccount").collapsed = false;
  } else {
    document.getElementById("localAccount").collapsed = false;
  }

  window.sizeToContent();
  gDialog.getButton("disclosure").disabled = true;
  gDialog.getButton("disclosure").blur();
}

function removeAccount() {
  let removeAccount = document.getElementById("removeAccount").checked;
  let removeData = document.getElementById("removeData").checked;
  try {
    // Remove the requested account data.
    if (removeAccount) {
      // Remove account
      // Need to save these before the account and its server is removed.
      let serverUri = gServer.type + "://" + gServer.hostName;
      let serverUsername = gServer.username;

      MailServices.accounts.removeAccount(window.arguments[0].account, removeData);
      window.arguments[0].result = true;

      // Remove password information.
      let logins = Services.logins.findLogins({}, serverUri, null, serverUri);
      for (let i = 0; i < logins.length; i++) {
        if (logins[i].username == serverUsername) {
          Services.logins.removeLogin(logins[i]);
          break;
        }
      }
    } else if (removeData) {
      // Remove files only.
      // TODO: bug 1302193
      window.arguments[0].result = false;
    }

    document.getElementById("status").selectedPanel =
      document.getElementById("success");
  } catch (ex) {
    document.getElementById("status").selectedPanel =
      document.getElementById("failure");
    Components.utils.reportError("Failure to remove account: " + ex);
    window.arguments[0].result = false;
  }
}

function onAccept() {
  // If Cancel is disabled, we already tried to remove the account
  // and can only close the dialog.
  if (gDialog.getButton("cancel").disabled)
    return true;

  gDialog.getButton("accept").disabled = true;
  gDialog.getButton("cancel").disabled = true;
  gDialog.getButton("disclosure").disabled = true;

  // Change the "Remove" to an "OK" button by clearing the custom label.
  gDialog.removeAttribute("buttonlabelaccept");
  gDialog.removeAttribute("buttonaccesskeyaccept");
  gDialog.getButton("accept").removeAttribute("label");
  gDialog.getButton("accept").removeAttribute("accesskey");
  gDialog.buttons = "accept";

  document.getElementById("infoPane").selectedIndex = 1;
  window.sizeToContent();

  removeAccount();

  gDialog.getButton("accept").disabled = false;
  return false;
}
