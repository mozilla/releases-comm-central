/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var gServer;
var gDialog;

window.addEventListener("DOMContentLoaded", onLoad);

document.addEventListener("dialogdisclosure", showInfo);
document.addEventListener("dialogaccept", onAccept);
document.subDialogSetDefaultFocus = () => {
  gDialog.getButton("cancel").focus();
  delete document.subDialogSetDefaultFocus;
};

function onLoad() {
  gServer = window.arguments[0].account.incomingServer;
  gDialog = document.querySelector("dialog");

  const bundle = document.getElementById("bundle_removeAccount");
  const removeQuestion = bundle.getFormattedString("removeQuestion", [
    gServer.prettyName,
  ]);
  document.getElementById("accountName").textContent = removeQuestion;

  // Allow to remove account data if it has a local storage.
  const localDirectory = gServer.localPath;
  if (localDirectory && localDirectory.exists()) {
    localDirectory.normalize();

    // Do not allow removal if localPath is outside of profile folder.
    const profilePath = Services.dirsvc.get("ProfD", Ci.nsIFile);
    profilePath.normalize();

    // TODO: bug 77652, decide what to do for deferred accounts.
    // And inform the user if the account localPath is outside the profile.
    if (
      gServer.isDeferredTo ||
      (gServer instanceof Ci.nsIPop3IncomingServer &&
        gServer.deferredToAccount) ||
      !profilePath.contains(localDirectory)
    ) {
      document.getElementById("removeData").disabled = true;
    }
  } else {
    document.getElementById("removeDataPossibility").collapsed = true;
  }

  if (gServer.type == "im") {
    const dataCheckbox = document.getElementById("removeData");
    dataCheckbox.label = dataCheckbox.getAttribute("labelChat");
    dataCheckbox.accessKey = dataCheckbox.getAttribute("accesskeyChat");
  }

  enableRemove();
}

function enableRemove() {
  gDialog.getButton("accept").disabled =
    !document.getElementById("removeAccount").checked &&
    !document.getElementById("removeData").checked;
}

/**
 * Show the local directory.
 */
function openLocalDirectory() {
  const nsLocalFile = Components.Constructor(
    "@mozilla.org/file/local;1",
    "nsIFile",
    "initWithPath"
  );
  const localDir = gServer.localPath.path;
  try {
    new nsLocalFile(localDir).reveal();
  } catch (e) {
    // Reveal may fail e.g. on Linux, then just show the path as a string.
    document.getElementById("localDirectory").value = localDir;
    document.getElementById("localDirectory").collapsed = false;
  }
}

function showInfo() {
  const descs = document.querySelectorAll("vbox.indent");
  for (const desc of descs) {
    desc.collapsed = false;
  }

  // TODO: bug 1238271, this should use showFor attributes if possible.
  if (gServer.type == "imap" || gServer.type == "nntp") {
    document.getElementById("serverAccount").collapsed = false;
  } else if (gServer.type == "im") {
    document.getElementById("chatAccount").collapsed = false;
  } else {
    document.getElementById("localAccount").collapsed = false;
  }

  parent.gSubDialog._topDialog.resizeDialog();
  gDialog.getButton("disclosure").disabled = true;
  gDialog.getButton("disclosure").blur();
}

function removeAccount() {
  const removeAccountCheckbox =
    document.getElementById("removeAccount").checked;
  const removeData = document.getElementById("removeData").checked;
  let account = window.arguments[0].account;
  try {
    // Remove the requested account data.
    if (removeAccountCheckbox) {
      try {
        // Remove password information first.
        account.incomingServer.forgetPassword();
      } catch (e) {
        /* It is OK if this fails. */
      }
      // Remove account
      MailServices.accounts.removeAccount(account, removeData);
      account = null;
      delete window.arguments[0].account;
      gServer = null;
      window.arguments[0].result = true;
    } else if (removeData) {
      // Remove files only.
      // TODO: bug 1302193
      window.arguments[0].result = false;
    }

    document.getElementById("success").hidden = false;
  } catch (ex) {
    document.getElementById("failure").hidden = false;
    console.error("Failure to remove account: ", ex);
    window.arguments[0].result = false;
  }
  document.getElementById("progress").hidden = true;
}

function onAccept(event) {
  // If Cancel is disabled, we already tried to remove the account
  // and can only close the dialog.
  if (gDialog.getButton("cancel").disabled) {
    return;
  }

  gDialog.getButton("accept").disabled = true;
  gDialog.getButton("cancel").disabled = true;
  gDialog.getButton("disclosure").disabled = true;

  // Change the "Remove" to an "OK" button by clearing the custom label.
  gDialog.removeAttribute("buttonlabelaccept");
  gDialog.removeAttribute("buttonaccesskeyaccept");
  gDialog.getButton("accept").removeAttribute("label");
  gDialog.getButton("accept").removeAttribute("accesskey");
  gDialog.buttons = "accept";

  document.getElementById("removeAccountSection").hidden = true;
  document.getElementById("confirmationSection").hidden = false;
  window.sizeToContent();

  removeAccount();

  gDialog.getButton("accept").disabled = false;
  event.preventDefault();
}
