/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

var nsIX509CertDB = Components.interfaces.nsIX509CertDB;
var nsX509CertDBContractID = "@mozilla.org/security/x509certdb;1";
var nsIX509Cert = Components.interfaces.nsIX509Cert;

var email_recipient_cert_usage = 5;
var email_signing_cert_usage = 4;

var gIdentity;
var gPref = null;
var gEncryptionCertName = null;
var gHiddenEncryptionPolicy = null;
var gEncryptionChoices = null;
var gSignCertName  = null;
var gSignMessages  = null;
var gEncryptAlways = null;
var gNeverEncrypt = null;
var gBundle = null;
var gBrandBundle;
var gSmimePrefbranch;
var gEncryptionChoicesLocked;
var gSigningChoicesLocked;
var kEncryptionCertPref = "identity.encryption_cert_name";
var kSigningCertPref = "identity.signing_cert_name";

function onInit() 
{
  smimeInitializeFields();
}

function smimeInitializeFields()
{
  // initialize all of our elements based on the current identity values....
  gEncryptionCertName = document.getElementById(kEncryptionCertPref);
  gHiddenEncryptionPolicy = document.getElementById("identity.encryptionpolicy");
  gEncryptionChoices = document.getElementById("encryptionChoices");
  gSignCertName       = document.getElementById(kSigningCertPref);
  gSignMessages       = document.getElementById("identity.sign_mail");
  gEncryptAlways      = document.getElementById("encrypt_mail_always");
  gNeverEncrypt       = document.getElementById("encrypt_mail_never");
  gBundle             = document.getElementById("bundle_smime");
  gBrandBundle        = document.getElementById("bundle_brand");

  gEncryptionChoicesLocked = false;
  gSigningChoicesLocked = false;

  if (!gIdentity) {
    // The user is going to create a new identity.
    // Set everything to default values.
    // Do not take over the values from gAccount.defaultIdentity
    // as the new identity is going to have a different mail address.

    gEncryptionCertName.value = "";
    gEncryptionCertName.nickname = "";
    gEncryptionCertName.dbKey = "";
    gSignCertName.value = "";
    gSignCertName.nickname = "";
    gSignCertName.dbKey = "";

    gEncryptAlways.setAttribute("disabled", true);
    gNeverEncrypt.setAttribute("disabled", true);
    gSignMessages.setAttribute("disabled", true);

    gSignMessages.checked = false;
    gEncryptionChoices.value = 0;
  }
  else {
    var certdb = Components.classes[nsX509CertDBContractID].getService(nsIX509CertDB);
    var x509cert = null;

    gEncryptionCertName.value = gIdentity.getUnicharAttribute("encryption_cert_name");
    gEncryptionCertName.dbKey = gIdentity.getCharAttribute("encryption_cert_dbkey");
    // If we succeed in looking up the certificate by the dbkey pref, then
    // append the serial number " [...]" to the display value, and remember the
    // nickname in a separate property.
    try {
        if (certdb && gEncryptionCertName.dbKey &&
            (x509cert = certdb.findCertByDBKey(gEncryptionCertName.dbKey, null))) {
            gEncryptionCertName.value = x509cert.nickname + " [" + x509cert.serialNumber + "]";
            gEncryptionCertName.nickname = x509cert.nickname;
        }
    } catch(e) {}

    gEncryptionChoices.value = gIdentity.getIntAttribute("encryptionpolicy");

    if (!gEncryptionCertName.value) {
      gEncryptAlways.setAttribute("disabled", true);
      gNeverEncrypt.setAttribute("disabled", true);
    }
    else {
      enableEncryptionControls(true);
    }

    gSignCertName.value = gIdentity.getUnicharAttribute("signing_cert_name");
    gSignCertName.dbKey = gIdentity.getCharAttribute("signing_cert_dbkey");
    x509cert = null;
    // same procedure as with gEncryptionCertName (see above)
    try {
        if (certdb && gSignCertName.dbKey &&
            (x509cert = certdb.findCertByDBKey(gSignCertName.dbKey, null))) {
            gSignCertName.value = x509cert.nickname + " [" + x509cert.serialNumber + "]";
            gSignCertName.nickname = x509cert.nickname;
        }
    } catch(e) {}

    gSignMessages.checked = gIdentity.getBoolAttribute("sign_mail");
    if (!gSignCertName.value)
    {
      gSignMessages.setAttribute("disabled", true);
    }
    else {
      enableSigningControls(true);
    }
  }

  // Always start with enabling signing and encryption cert select buttons.
  // This will keep the visibility of buttons in a sane state as user
  // jumps from security panel of one account to another.
  enableCertSelectButtons();

  // Disable all locked elements on the panel
  if (gIdentity)
    onLockPreference();
}

function onPreInit(account, accountValues)
{
  gIdentity = account.defaultIdentity;
}

function onSave()
{
  smimeSave();
}

function smimeSave()
{
  // find out which radio for the encryption radio group is selected and set that on our hidden encryptionChoice pref....
  var newValue = gEncryptionChoices.value;
  gHiddenEncryptionPolicy.setAttribute('value', newValue);
  gIdentity.setIntAttribute("encryptionpolicy", newValue);
  gIdentity.setUnicharAttribute("encryption_cert_name",
                                gEncryptionCertName.nickname || gEncryptionCertName.value);
  gIdentity.setCharAttribute("encryption_cert_dbkey", gEncryptionCertName.dbKey);

  gIdentity.setBoolAttribute("sign_mail", gSignMessages.checked);
  gIdentity.setUnicharAttribute("signing_cert_name",
                                gSignCertName.nickname || gSignCertName.value);
  gIdentity.setCharAttribute("signing_cert_dbkey", gSignCertName.dbKey);
}

function smimeOnAcceptEditor()
{
  try {
    if (!onOk())
      return false;
  }
  catch (ex) {}

  smimeSave();

  return true;
}

function onLockPreference()
{
  var initPrefString = "mail.identity";
  var finalPrefString;

  var allPrefElements = [
    { prefstring:"signingCertSelectButton", id:"signingCertSelectButton"},
    { prefstring:"encryptionCertSelectButton", id:"encryptionCertSelectButton"},
    { prefstring:"sign_mail", id:"identity.sign_mail"},
    { prefstring:"encryptionpolicy", id:"encryptionChoices"}
  ];

  finalPrefString = initPrefString + "." + gIdentity.key + ".";
  gSmimePrefbranch = Services.prefs.getBranch(finalPrefString);

  disableIfLocked( allPrefElements );
}


// Does the work of disabling an element given the array which contains xul id/prefstring pairs.
// Also saves the id/locked state in an array so that other areas of the code can avoid
// stomping on the disabled state indiscriminately.
function disableIfLocked( prefstrArray )
{
  var i;
  for (i=0; i<prefstrArray.length; i++) {
    var id = prefstrArray[i].id;
    var element = document.getElementById(id);
    if (gSmimePrefbranch.prefIsLocked(prefstrArray[i].prefstring)) {
      // If encryption choices radio group is locked, make sure the individual 
      // choices in the group are locked. Set a global (gEncryptionChoicesLocked) 
      // indicating the status so that locking can be maintained further.
      if (id == "encryptionChoices") {
        document.getElementById("encrypt_mail_never").setAttribute("disabled", "true");
        document.getElementById("encrypt_mail_always").setAttribute("disabled", "true");
        gEncryptionChoicesLocked = true;
      }
      // If option to sign mail is locked (with true/false set in config file), disable
      // the corresponding checkbox and set a global (gSigningChoicesLocked) in order to
      // honor the locking as user changes other elements on the panel. 
      if (id == "identity.sign_mail") {
        document.getElementById("identity.sign_mail").setAttribute("disabled", "true");
        gSigningChoicesLocked = true;
      }
      else {
        element.setAttribute("disabled", "true");
        if (id == "signingCertSelectButton") {
          document.getElementById("signingCertClearButton").setAttribute("disabled", "true");
        }
        else if (id == "encryptionCertSelectButton") {
          document.getElementById("encryptionCertClearButton").setAttribute("disabled", "true");
        }
      }
    }
  }
}

function alertUser(message)
{
  Services.prompt.alert(window,
                        gBrandBundle.getString("brandShortName"),
                        message);
}

function askUser(message)
{
  let button = Services.prompt.confirmEx(
    window,
    gBrandBundle.getString("brandShortName"),
    message,
    Services.prompt.STD_YES_NO_BUTTONS,
    null,
    null,
    null,
    null,
    {});
  // confirmEx returns button index:
  return (button == 0);
}

function checkOtherCert(cert, pref, usage, msgNeedCertWantSame, msgWantSame, msgNeedCertWantToSelect, enabler)
{
  var otherCertInfo = document.getElementById(pref);
  if (!otherCertInfo)
    return;

  if (otherCertInfo.dbKey == cert.dbKey)
    // all is fine, same cert is now selected for both purposes
    return;

  var certdb = Components.classes[nsX509CertDBContractID].getService(nsIX509CertDB);
  if (!certdb)
    return;
  
  if (email_recipient_cert_usage == usage) {
    matchingOtherCert = certdb.findEmailEncryptionCert(cert.nickname);
  }
  else if (email_signing_cert_usage == usage) {
    matchingOtherCert = certdb.findEmailSigningCert(cert.nickname);
  }
  else
    return;

  var userWantsSameCert = false;

  if (!otherCertInfo.value.length) {
    if (matchingOtherCert && (matchingOtherCert.dbKey == cert.dbKey)) {
      userWantsSameCert = askUser(gBundle.getString(msgNeedCertWantSame));
    }
    else {
      if (askUser(gBundle.getString(msgNeedCertWantToSelect))) {
        smimeSelectCert(pref);
      }
    }
  }
  else {
    if (matchingOtherCert && (matchingOtherCert.dbKey == cert.dbKey)) {
      userWantsSameCert = askUser(gBundle.getString(msgWantSame));
    }
  }

  if (userWantsSameCert) {
    otherCertInfo.value = cert.nickname + " [" + cert.serialNumber + "]";
    otherCertInfo.nickname = cert.nickname;
    otherCertInfo.dbKey = cert.dbKey;
    enabler(true);
  }
}

function smimeSelectCert(smime_cert)
{
  var certInfo = document.getElementById(smime_cert);
  if (!certInfo)
    return;

  var picker = Components.classes["@mozilla.org/user_cert_picker;1"]
               .createInstance(Components.interfaces.nsIUserCertPicker);
  var canceled = new Object;
  var x509cert = 0;
  var certUsage;
  var selectEncryptionCert;

  if (smime_cert == kEncryptionCertPref) {
    selectEncryptionCert = true;
    certUsage = email_recipient_cert_usage;
  } else if (smime_cert == kSigningCertPref) {
    selectEncryptionCert = false;
    certUsage = email_signing_cert_usage;
  }

  try {
    x509cert = picker.pickByUsage(window,
      certInfo.value,
      certUsage, // this is from enum SECCertUsage
      false, true,
      gIdentity.email,
      canceled);
  } catch(e) {
    canceled.value = false;
    x509cert = null;
  }

  if (!canceled.value) {
    if (!x509cert) {
      if (gIdentity.email) {
        alertUser(gBundle.getFormattedString(selectEncryptionCert ?
                                             "NoEncryptionCertForThisAddress" :
                                             "NoSigningCertForThisAddress",
                                             [ gIdentity.email ]));
      } else {
        alertUser(gBundle.getString(selectEncryptionCert ?
                                    "NoEncryptionCert" : "NoSigningCert"));
      }
    }
    else {
      certInfo.removeAttribute("disabled");
      certInfo.value = x509cert.nickname + " [" + x509cert.serialNumber + "]";
      certInfo.nickname = x509cert.nickname;
      certInfo.dbKey = x509cert.dbKey;

      if (selectEncryptionCert) {
        enableEncryptionControls(true);

        checkOtherCert(x509cert,
          kSigningCertPref, email_signing_cert_usage, 
          "signing_needCertWantSame", 
          "signing_wantSame", 
          "signing_needCertWantToSelect",
          enableSigningControls);
      } else {
        enableSigningControls(true);

        checkOtherCert(x509cert,
          kEncryptionCertPref, email_recipient_cert_usage, 
          "encryption_needCertWantSame", 
          "encryption_wantSame", 
          "encryption_needCertWantToSelect",
          enableEncryptionControls);
      }
    }
  }

  enableCertSelectButtons();
}

function enableEncryptionControls(do_enable)
{
  if (gEncryptionChoicesLocked)
    return;

  if (do_enable) {
    gEncryptAlways.removeAttribute("disabled");
    gNeverEncrypt.removeAttribute("disabled");
    gEncryptionCertName.removeAttribute("disabled");
  }
  else {
    gEncryptAlways.setAttribute("disabled", "true");
    gNeverEncrypt.setAttribute("disabled", "true");
    gEncryptionCertName.setAttribute("disabled", "true");
    gEncryptionChoices.value = 0;
  }
}

function enableSigningControls(do_enable)
{
  if (gSigningChoicesLocked)
    return;

  if (do_enable) {
    gSignMessages.removeAttribute("disabled");
    gSignCertName.removeAttribute("disabled");
  }
  else {
    gSignMessages.setAttribute("disabled", "true");
    gSignCertName.setAttribute("disabled", "true");
    gSignMessages.checked = false;
  }
}

function enableCertSelectButtons()
{
  document.getElementById("signingCertSelectButton").removeAttribute("disabled");

  if (document.getElementById('identity.signing_cert_name').value.length)
    document.getElementById("signingCertClearButton").removeAttribute("disabled");
  else
    document.getElementById("signingCertClearButton").setAttribute("disabled", "true");

  document.getElementById("encryptionCertSelectButton").removeAttribute("disabled");

  if (document.getElementById('identity.encryption_cert_name').value.length)
    document.getElementById("encryptionCertClearButton").removeAttribute("disabled");
  else
    document.getElementById("encryptionCertClearButton").setAttribute("disabled", "true");
}

function smimeClearCert(smime_cert)
{
  var certInfo = document.getElementById(smime_cert);
  if (!certInfo)
    return;

  certInfo.setAttribute("disabled", "true");
  certInfo.value = "";
  certInfo.nickname = "";
  certInfo.dbKey = "";

  if (smime_cert == kEncryptionCertPref) {
    enableEncryptionControls(false);
  } else if (smime_cert == kSigningCertPref) {
    enableSigningControls(false);
  }

  enableCertSelectButtons();
}

function openCertManager()
{
  // Check for an existing certManager window and focus it; it's not
  // application modal.
  let lastCertManager = Services.wm.getMostRecentWindow("mozilla:certmanager");
  if (lastCertManager)
    lastCertManager.focus();
  else
    window.openDialog("chrome://pippki/content/certManager.xul", "",
                      "centerscreen,resizable=yes,dialog=no");
}

function openDeviceManager()
{
  // Check for an existing deviceManager window and focus it; it's not
  // application modal.
  let lastCertManager = Services.wm.getMostRecentWindow("mozilla:devicemanager");
  if (lastCertManager)
    lastCertManager.focus();
  else
    window.openDialog("chrome://pippki/content/device_manager.xul", "",
                      "centerscreen,resizable=yes,dialog=no");
}

function smimeOnLoadEditor()
{
  smimeInitializeFields();

  document.documentElement.setAttribute("ondialogaccept",
                                        "return smimeOnAcceptEditor();");
}

