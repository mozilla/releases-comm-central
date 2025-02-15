/* -*- indent-tabs-mode: nil; js-indent-level: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Account encryption policy values:
// const kEncryptionPolicy_Never = 0;
// 'IfPossible' was used by ns4.
// const kEncryptionPolicy_IfPossible = 1;
var kEncryptionPolicy_Always = 2;

var gEncryptedURIService =
        Cc["@mozilla.org/messenger-smime/smime-encrypted-uris-service;1"]
          .getService(Ci.nsIEncryptedSMIMEURIsService);

var gNextSecurityButtonCommand = "";
var gSMFields = null;
var gEncryptOptionChanged;
var gSignOptionChanged;

function onComposerLoad()
{
  // Are we already set up ? Or are the required fields missing ?
  if (gSMFields || !gMsgCompose || !gMsgCompose.compFields)
    return;

  gMsgCompose.compFields.composeSecure = null;

  gSMFields = Cc["@mozilla.org/messengercompose/composesecure;1"]
                .createInstance(Ci.nsIMsgComposeSecure);
  if (!gSMFields)
    return;

  gMsgCompose.compFields.composeSecure = gSMFields;

  // Set up the initial security state.
  gSMFields.requireEncryptMessage =
    gCurrentIdentity.getIntAttribute("encryptionpolicy") == kEncryptionPolicy_Always;
  if (!gSMFields.requireEncryptMessage &&
      gEncryptedURIService &&
      gEncryptedURIService.isEncrypted(gMsgCompose.originalMsgURI))
  {
    // Override encryption setting if original is known as encrypted.
    gSMFields.requireEncryptMessage = true;
  }
  if (gSMFields.requireEncryptMessage)
    setEncryptionUI();
  else
    setNoEncryptionUI();

  gSMFields.signMessage = gCurrentIdentity.getBoolAttribute("sign_mail");
  if (gSMFields.signMessage)
    setSignatureUI();
  else
    setNoSignatureUI();
}

addEventListener("load", smimeComposeOnLoad, {capture: false, once: true});

// this function gets called multiple times
function smimeComposeOnLoad()
{
  onComposerLoad();

  top.controllers.appendController(SecurityController);

  addEventListener("compose-from-changed", onComposerFromChanged, true);
  addEventListener("compose-send-message", onComposerSendMessage, true);

  addEventListener("unload", smimeComposeOnUnload, {capture: false, once: true});
}

function smimeComposeOnUnload()
{
  removeEventListener("compose-from-changed", onComposerFromChanged, true);
  removeEventListener("compose-send-message", onComposerSendMessage, true);

  top.controllers.removeController(SecurityController);
}

function showNeedSetupInfo()
{
  let compSmimeBundle = document.getElementById("bundle_comp_smime");
  let brandBundle = document.getElementById("brandBundle");
  if (!compSmimeBundle || !brandBundle)
    return;

  let buttonPressed = Services.prompt.confirmEx(window,
    brandBundle.getString("brandShortName"),
    compSmimeBundle.getString("NeedSetup"),
    Services.prompt.STD_YES_NO_BUTTONS, 0, 0, 0, null, {});
  if (buttonPressed == 0)
    openHelp("sign-encrypt", "chrome://communicator/locale/help/suitehelp.rdf");
}

function toggleEncryptMessage()
{
  if (!gSMFields)
    return;

  gSMFields.requireEncryptMessage = !gSMFields.requireEncryptMessage;

  if (gSMFields.requireEncryptMessage)
  {
    // Make sure we have a cert.
    if (!gCurrentIdentity.getUnicharAttribute("encryption_cert_name"))
    {
      gSMFields.requireEncryptMessage = false;
      showNeedSetupInfo();
      return;
    }

    setEncryptionUI();
  }
  else
  {
    setNoEncryptionUI();
  }

  gEncryptOptionChanged = true;
}

function toggleSignMessage()
{
  if (!gSMFields)
    return;

  gSMFields.signMessage = !gSMFields.signMessage;

  if (gSMFields.signMessage) // make sure we have a cert name...
  {
    if (!gCurrentIdentity.getUnicharAttribute("signing_cert_name"))
    {
      gSMFields.signMessage = false;
      showNeedSetupInfo();
      return;
    }

    setSignatureUI();
  }
  else
  {
    setNoSignatureUI();
  }

  gSignOptionChanged = true;
}

function setSecuritySettings(menu_id)
{
  if (!gSMFields)
    return;

  document.getElementById("menu_securityEncryptRequire" + menu_id)
          .setAttribute("checked", gSMFields.requireEncryptMessage);
  document.getElementById("menu_securitySign" + menu_id)
          .setAttribute("checked", gSMFields.signMessage);
}

function setNextCommand(what)
{
  gNextSecurityButtonCommand = what;
}

function doSecurityButton()
{
  var what = gNextSecurityButtonCommand;
  gNextSecurityButtonCommand = "";

  switch (what)
  {
    case "encryptMessage":
      toggleEncryptMessage();
      break;

    case "signMessage":
      toggleSignMessage();
      break;

    case "show":
    default:
      showMessageComposeSecurityStatus();
  }
}

function setNoSignatureUI()
{
  top.document.getElementById("securityStatus").removeAttribute("signing");
  top.document.getElementById("signing-status").collapsed = true;
}

function setSignatureUI()
{
  top.document.getElementById("securityStatus").setAttribute("signing", "ok");
  top.document.getElementById("signing-status").collapsed = false;
}

function setNoEncryptionUI()
{
  top.document.getElementById("securityStatus").removeAttribute("crypto");
  top.document.getElementById("encryption-status").collapsed = true;
}

function setEncryptionUI()
{
  top.document.getElementById("securityStatus").setAttribute("crypto", "ok");
  top.document.getElementById("encryption-status").collapsed = false;
}

function showMessageComposeSecurityStatus()
{
  Recipients2CompFields(gMsgCompose.compFields);

  window.openDialog(
    "chrome://messenger-smime/content/msgCompSecurityInfo.xul",
    "",
    "chrome,modal,resizable,centerscreen",
    {
      compFields : gMsgCompose.compFields,
      subject : GetMsgSubjectElement().value,
      smFields : gSMFields,
      isSigningCertAvailable :
        gCurrentIdentity.getUnicharAttribute("signing_cert_name") != "",
      isEncryptionCertAvailable :
        gCurrentIdentity.getUnicharAttribute("encryption_cert_name") != "",
      currentIdentity : gCurrentIdentity
    }
  );
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
        return true;

      default:
        return false;
    }
  }
};

function onComposerSendMessage()
{
  let emailAddresses = [];

  try
  {
    if (!gMsgCompose.compFields.composeSecure.requireEncryptMessage)
      return;

    emailAddresses = Cc["@mozilla.org/messenger-smime/smimejshelper;1"]
      .createInstance(Ci.nsISMimeJSHelper)
      .getNoCertAddresses(gMsgCompose.compFields);
  }
  catch (e)
  {
    return;
  }

  if (emailAddresses.length > 0)
  {
    // The rules here: If the current identity has a directoryServer set, then
    // use that, otherwise, try the global preference instead.

    let autocompleteDirectory;

    // Does the current identity override the global preference?
    if (gCurrentIdentity.overrideGlobalPref)
    {
      autocompleteDirectory = gCurrentIdentity.directoryServer;
    }
    else
    {
      // Try the global one
      if (Services.prefs.getBoolPref("ldap_2.autoComplete.useDirectory"))
        autocompleteDirectory =
          Services.prefs.getCharPref("ldap_2.autoComplete.directoryServer");
    }

    if (autocompleteDirectory)
      window.openDialog("chrome://messenger-smime/content/certFetchingStatus.xul",
                        "",
                        "chrome,modal,resizable,centerscreen",
                        autocompleteDirectory,
                        emailAddresses);
  }
}

function onComposerFromChanged()
{
  if (!gSMFields)
    return;

  var encryptionPolicy = gCurrentIdentity.getIntAttribute("encryptionpolicy");
  var useEncryption = false;

  if (!gEncryptOptionChanged)
  {
    // Encryption wasn't manually checked.
    // Set up the encryption policy from the setting of the new identity.

    // 0 == never, 1 == if possible (ns4), 2 == always encrypt.
    useEncryption = (encryptionPolicy == kEncryptionPolicy_Always);
  }
  else
  {
    useEncryption = !!gCurrentIdentity.getUnicharAttribute("encryption_cert_name");
  }

  gSMFields.requireEncryptMessage = useEncryption;
  if (useEncryption)
    setEncryptionUI();
  else
    setNoEncryptionUI();

  // - If signing is disabled, we will not turn it on automatically.
  // - If signing is enabled, but the new account defaults to not sign, we will turn signing off.
  var signMessage = gCurrentIdentity.getBoolAttribute("sign_mail");
  var useSigning = false;

  if (!gSignOptionChanged)
  {
    // Signing wasn't manually checked.
    // Set up the signing policy from the setting of the new identity.
    useSigning = signMessage;
  }
  else
  {
    useSigning = !!gCurrentIdentity.getUnicharAttribute("signing_cert_name");
  }
  gSMFields.signMessage = useSigning;
  if (useSigning)
    setSignatureUI();
  else
    setNoSignatureUI();
}
