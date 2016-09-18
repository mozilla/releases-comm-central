/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

var gEncryptionStatus = -1;
var gSignatureStatus = -1;
var gSignerCert = null;
var gEncryptionCert = null;

addEventListener("load", smimeReadOnLoad, {capture: false, once: true});

function smimeReadOnLoad()
{
  top.controllers.appendController(SecurityController);

  addEventListener("unload", smimeReadOnUnload, {capture: false, once: true});
}

function smimeReadOnUnload()
{
  top.controllers.removeController(SecurityController);
}

function showImapSignatureUnknown()
{
  let readSmimeBundle = document.getElementById("bundle_read_smime");
  let brandBundle = document.getElementById("bundle_brand");
  if (!readSmimeBundle || !brandBundle)
    return;

  if (Services.prompt.confirm(window, brandBundle.getString("brandShortName"),
                              readSmimeBundle.getString("ImapOnDemand")))
  {
    gDBView.reloadMessageWithAllParts();
  }
}

function showMessageReadSecurityInfo()
{
  let gSignedUINode = document.getElementById("signedHdrIcon");
  if (gSignedUINode && gSignedUINode.getAttribute("signed") == "unknown")
  {
    showImapSignatureUnknown();
    return;
  }

  let params = Components.classes["@mozilla.org/embedcomp/dialogparam;1"]
    .createInstance(Components.interfaces.nsIDialogParamBlock);
  params.objects = Components.classes["@mozilla.org/array;1"]
    .createInstance(Components.interfaces.nsIMutableArray);
  // Append even if null... the receiver must handle that.
  params.objects.appendElement(gSignerCert, false);
  params.objects.appendElement(gEncryptionCert, false);

  // int array starts with index 0, but that is used for window exit status
  params.SetInt(1, gSignatureStatus);
  params.SetInt(2, gEncryptionStatus);

  window.openDialog("chrome://messenger-smime/content/msgReadSecurityInfo.xul",
                    "", "chrome,resizable,modal,dialog,centerscreen", params);
}

var SecurityController =
{
  supportsCommand: function(command)
  {
    switch (command)
    {
      case "cmd_viewSecurityStatus":
        return true;

      default:
        return false;
    }
  },

  isCommandEnabled: function(command)
  {
    switch (command)
    {
      case "cmd_viewSecurityStatus":
        if (document.documentElement.getAttribute('windowtype') == "mail:messageWindow")
          return GetNumSelectedMessages() > 0;

        if (GetNumSelectedMessages() > 0 && gDBView)
        {
          let enabled = {value: false};
          let checkStatus = {};
          gDBView.getCommandStatus(nsMsgViewCommandType.cmdRequiringMsgBody,
                                   enabled, checkStatus);
          return enabled.value;
        }
        // else: fall through.

      default:
        return false;
    }
  }
};
