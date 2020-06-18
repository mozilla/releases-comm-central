/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* globals gDBView, GetNumSelectedMessages */
/* globals MailConstants, Enigmail, BondOpenPGP */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var gEncryptionStatus = -1;
var gSignatureStatus = -1;
var gSignerCert = null;
var gEncryptionCert = null;

addEventListener("load", smimeReadOnLoad, { capture: false, once: true });

function smimeReadOnLoad() {
  top.controllers.appendController(SecurityController);

  addEventListener("unload", smimeReadOnUnload, { capture: false, once: true });
}

function smimeReadOnUnload() {
  top.controllers.removeController(SecurityController);
}

function showImapSignatureUnknown() {
  let readSmimeBundle = document.getElementById("bundle_read_smime");
  let brandBundle = document.getElementById("bundle_brand");
  if (!readSmimeBundle || !brandBundle) {
    return;
  }

  if (
    Services.prompt.confirm(
      window,
      brandBundle.getString("brandShortName"),
      readSmimeBundle.getString("ImapOnDemand")
    )
  ) {
    gDBView.reloadMessageWithAllParts();
  }
}

function showMessageReadSecurityInfo() {
  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    let box = document.getElementById("cryptoBox");
    let tech = box.getAttribute("tech");
    if (tech && tech === "OpenPGP") {
      Enigmail.hdrView.viewOpenpgpInfo();
      return;
    }
  }

  // S/MIME
  let gSignedUINode = document.getElementById("signedHdrIcon");
  if (gSignedUINode && gSignedUINode.getAttribute("signed") == "unknown") {
    showImapSignatureUnknown();
    return;
  }

  let params = Cc["@mozilla.org/embedcomp/dialogparam;1"].createInstance(
    Ci.nsIDialogParamBlock
  );
  params.objects = Cc["@mozilla.org/array;1"].createInstance(
    Ci.nsIMutableArray
  );
  // Append even if null... the receiver must handle that.
  params.objects.appendElement(gSignerCert);
  params.objects.appendElement(gEncryptionCert);

  // int array starts with index 0, but that is used for window exit status
  params.SetInt(1, gSignatureStatus);
  params.SetInt(2, gEncryptionStatus);

  window.browsingContext.topChromeWindow.openDialog(
    "chrome://messenger-smime/content/msgReadSecurityInfo.xhtml",
    "",
    "chrome,resizable,modal,dialog,centerscreen",
    params
  );
}

var SecurityController = {
  supportsCommand(command) {
    switch (command) {
      case "cmd_viewSecurityStatus":
        return true;

      default:
        return false;
    }
  },

  isCommandEnabled(command) {
    switch (command) {
      case "cmd_viewSecurityStatus":
        if (
          document.documentElement.getAttribute("windowtype") ==
          "mail:messageWindow"
        ) {
          return GetNumSelectedMessages() > 0;
        }

        if (GetNumSelectedMessages() > 0 && gDBView) {
          let enabled = { value: false };
          let checkStatus = {};
          gDBView.getCommandStatus(
            Ci.nsMsgViewCommandType.cmdRequiringMsgBody,
            enabled,
            checkStatus
          );
          return enabled.value;
        }
      // else: fall through.

      default:
        return false;
    }
  },
};
