/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailConstants } = ChromeUtils.import(
  "resource:///modules/MailConstants.jsm"
);
var { BondOpenPGP } = ChromeUtils.import(
  "chrome://openpgp/content/BondOpenPGP.jsm"
);

if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
  var { EnigmailKeyRing } = ChromeUtils.import(
    "chrome://openpgp/content/modules/keyRing.jsm"
  );
}

var nsIX509CertDB = Ci.nsIX509CertDB;
var nsX509CertDBContractID = "@mozilla.org/security/x509certdb;1";
var nsIX509Cert = Ci.nsIX509Cert;

var email_signing_cert_usage = 4; // SECCertUsage.certUsageEmailSigner
var email_recipient_cert_usage = 5; // SECCertUsage.certUsageEmailRecipient

var gIdentity;
var gEncryptionCertName = null;
var gHiddenEncryptionPolicy = null;
var gEncryptionChoices = null;
var gSignCertName = null;
var gTechChoices = null;
var gHiddenTechPref = null;
var gSignMessages = null;
var gRequireEncrypt = null;
var gDoNotEncrypt = null;
var gKeyId = null;
var gBundle = null;
var gBrandBundle;
var gSmimePrefbranch;
var kEncryptionCertPref = "identity_encryption_cert_name";
var kSigningCertPref = "identity_signing_cert_name";
var kOpenPGPKeyPref = "identity_openpgp_key_id";

var gTechAuto = null;
var gTechPrefOpenPGP = null;
var gTechPrefSMIME = null;

function onInit() {
  e2eInitializeFields();
}

function e2eInitializeFields() {
  // initialize all of our elements based on the current identity values....
  gEncryptionCertName = document.getElementById(kEncryptionCertPref);
  gHiddenEncryptionPolicy = document.getElementById(
    "identity_encryptionpolicy"
  );
  gHiddenTechPref = document.getElementById("identity_e2etechpref");
  gEncryptionChoices = document.getElementById("encryptionChoices");
  gSignCertName = document.getElementById(kSigningCertPref);
  gSignMessages = document.getElementById("identity_sign_mail");
  gRequireEncrypt = document.getElementById("encrypt_require");
  gDoNotEncrypt = document.getElementById("encrypt_no");
  gBundle = document.getElementById("bundle_e2e");
  gBrandBundle = document.getElementById("bundle_brand");

  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    gTechChoices = document.getElementById("technologyChoices");
    gKeyId = document.getElementById(kOpenPGPKeyPref);
    gTechAuto = document.getElementById("technology_automatic");
    gTechPrefOpenPGP = document.getElementById("technology_prefer_openpgp");
    gTechPrefSMIME = document.getElementById("technology_prefer_smime");
  }

  if (!gIdentity) {
    // The user is going to create a new identity.
    // Set everything to default values.
    // Do not take over the values from gAccount.defaultIdentity
    // as the new identity is going to have a different mail address.

    gEncryptionCertName.value = "";
    gEncryptionCertName.displayName = "";
    gEncryptionCertName.dbKey = "";

    gSignCertName.value = "";
    gSignCertName.displayName = "";
    gSignCertName.dbKey = "";

    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      gKeyId.value = "";
    }

    gRequireEncrypt.disabled = true;
    gDoNotEncrypt.disabled = true;
    gSignMessages.disabled = true;

    gSignMessages.checked = false;
    gEncryptionChoices.value = 0;
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      gTechChoices.value = 0;
    }
  } else {
    var certdb = Cc[nsX509CertDBContractID].getService(nsIX509CertDB);
    var x509cert = null;

    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      gKeyId.value = gIdentity.getUnicharAttribute("openpgp_key_id");
    }
    gEncryptionCertName.value = gIdentity.getUnicharAttribute(
      "encryption_cert_name"
    );
    gEncryptionCertName.dbKey = gIdentity.getCharAttribute(
      "encryption_cert_dbkey"
    );
    // If we succeed in looking up the certificate by the dbkey pref, then
    // append the serial number " [...]" to the display value, and remember the
    // displayName in a separate property.
    try {
      if (
        certdb &&
        gEncryptionCertName.dbKey &&
        (x509cert = certdb.findCertByDBKey(gEncryptionCertName.dbKey))
      ) {
        gEncryptionCertName.value =
          x509cert.displayName + " [" + x509cert.serialNumber + "]";
        gEncryptionCertName.displayName = x509cert.displayName;
      }
    } catch (e) {}

    gEncryptionChoices.value = gIdentity.getIntAttribute("encryptionpolicy");
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      gTechChoices.value = gIdentity.getIntAttribute("e2etechpref");
    }

    let enableEnc = !!gEncryptionCertName.value;
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      enableEnc = enableEnc || !!gKeyId.value;
    }

    gRequireEncrypt.disabled = !enableEnc;
    gDoNotEncrypt.disabled = !enableEnc;
    enableEncryptionControls(enableEnc);

    gSignCertName.value = gIdentity.getUnicharAttribute("signing_cert_name");
    gSignCertName.dbKey = gIdentity.getCharAttribute("signing_cert_dbkey");
    x509cert = null;
    // same procedure as with gEncryptionCertName (see above)
    try {
      if (
        certdb &&
        gSignCertName.dbKey &&
        (x509cert = certdb.findCertByDBKey(gSignCertName.dbKey))
      ) {
        gSignCertName.value =
          x509cert.displayName + " [" + x509cert.serialNumber + "]";
        gSignCertName.displayName = x509cert.displayName;
      }
    } catch (e) {}

    gSignMessages.checked = gIdentity.getBoolAttribute("sign_mail");

    let enableSig = gSignCertName.value;
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      enableSig = enableSig || !!gKeyId.value;
    }

    gSignMessages.disabled = !enableSig;
    enableSigningControls(enableSig);
  }

  // Always start with enabling select buttons.
  // This will keep the visibility of buttons in a sane state as user
  // jumps from security panel of one account to another.
  enableSelectButtons();
  updateTechPref();
}

function onPreInit(account, accountValues) {
  gIdentity = account.defaultIdentity;
}

function onSave() {
  e2eSave();
  window.dispatchEvent(new CustomEvent("prefchange"));
}

function e2eSave() {
  // find out which radio for the encryption radio group is selected and set that on our hidden encryptionChoice pref....
  var newValue = gEncryptionChoices.value;
  gHiddenEncryptionPolicy.setAttribute("value", newValue);
  gIdentity.setIntAttribute("encryptionpolicy", newValue);

  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    newValue = gTechChoices.value;
    gHiddenTechPref.setAttribute("value", newValue);
    gIdentity.setIntAttribute("e2etechpref", newValue);
  }

  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    gIdentity.setUnicharAttribute("openpgp_key_id", gKeyId.value);
  }
  gIdentity.setUnicharAttribute(
    "encryption_cert_name",
    gEncryptionCertName.displayName || gEncryptionCertName.value
  );
  gIdentity.setCharAttribute(
    "encryption_cert_dbkey",
    gEncryptionCertName.dbKey
  );

  gIdentity.setBoolAttribute("sign_mail", gSignMessages.checked);
  gIdentity.setUnicharAttribute(
    "signing_cert_name",
    gSignCertName.displayName || gSignCertName.value
  );
  gIdentity.setCharAttribute("signing_cert_dbkey", gSignCertName.dbKey);
}

function e2eOnAcceptEditor(event) {
  e2eSave();
}

function alertUser(message) {
  Services.prompt.alert(
    window,
    gBrandBundle.getString("brandShortName"),
    message
  );
}

function askUser(message) {
  let button = Services.prompt.confirmEx(
    window,
    gBrandBundle.getString("brandShortName"),
    message,
    Services.prompt.STD_YES_NO_BUTTONS,
    null,
    null,
    null,
    null,
    {}
  );
  // confirmEx returns button index:
  return button == 0;
}

function checkOtherCert(
  cert,
  pref,
  usage,
  msgNeedCertWantSame,
  msgWantSame,
  msgNeedCertWantToSelect,
  enabler
) {
  var otherCertInfo = document.getElementById(pref);
  if (otherCertInfo.dbKey == cert.dbKey) {
    // All is fine, same cert is now selected for both purposes.
    return;
  }

  var secMsg = Cc["@mozilla.org/nsCMSSecureMessage;1"].getService(
    Ci.nsICMSSecureMessage
  );

  var matchingOtherCert;
  if (email_recipient_cert_usage == usage) {
    if (secMsg.canBeUsedForEmailEncryption(cert)) {
      matchingOtherCert = cert;
    }
  } else if (email_signing_cert_usage == usage) {
    if (secMsg.canBeUsedForEmailSigning(cert)) {
      matchingOtherCert = cert;
    }
  } else {
    throw new Error("Unexpected SECCertUsage: " + usage);
  }

  var userWantsSameCert = false;
  if (!otherCertInfo.value) {
    if (matchingOtherCert) {
      userWantsSameCert = askUser(gBundle.getString(msgNeedCertWantSame));
    } else if (askUser(gBundle.getString(msgNeedCertWantToSelect))) {
      smimeSelectCert(pref);
    }
  } else if (matchingOtherCert) {
    userWantsSameCert = askUser(gBundle.getString(msgWantSame));
  }

  if (userWantsSameCert) {
    otherCertInfo.value = cert.displayName + " [" + cert.serialNumber + "]";
    otherCertInfo.displayName = cert.displayName;
    otherCertInfo.dbKey = cert.dbKey;
    enabler(true);
  }
}

function pgpSelectKey(pgp_key) {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    return;
  }

  var keyInfo = document.getElementById(pgp_key);
  if (!keyInfo) {
    return;
  }

  let result = {};
  EnigmailKeyRing.getAllSecretKeysByEmail(gIdentity.email, result);

  let params = {
    keys: result.all,
    identity: gIdentity.fullAddress,
    canceled: true,
    index: -1,
  };

  window.docShell.rootTreeItem.domWindow.openDialog(
    "chrome://openpgp/content/ui/keyPicker.xhtml",
    "",
    "dialog,close,titlebar,modal,resizable",
    params
  );

  if (params.canceled) {
    return;
  }

  keyInfo.value = result.all[params.index].keyId;
  keyInfo.displayName = result.all[params.index].keyId;

  enableEncryptionControls(true);
  enableSigningControls(true);

  updateTechPref();
  enableSelectButtons();
  onSave();
}

function smimeSelectCert(smime_cert) {
  var certInfo = document.getElementById(smime_cert);
  if (!certInfo) {
    return;
  }

  var picker = Cc["@mozilla.org/user_cert_picker;1"].createInstance(
    Ci.nsIUserCertPicker
  );
  var canceled = {};
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
    x509cert = picker.pickByUsage(
      window,
      certInfo.value,
      certUsage, // this is from enum SECCertUsage
      false,
      true,
      gIdentity.email,
      canceled
    );
  } catch (e) {
    canceled.value = false;
    x509cert = null;
  }

  if (!canceled.value) {
    if (!x509cert) {
      if (gIdentity.email) {
        alertUser(
          gBundle.getFormattedString(
            selectEncryptionCert
              ? "NoEncryptionCertForThisAddress"
              : "NoSigningCertForThisAddress",
            [gIdentity.email]
          )
        );
      } else {
        alertUser(
          gBundle.getString(
            selectEncryptionCert ? "NoEncryptionCert" : "NoSigningCert"
          )
        );
      }
    } else {
      certInfo.disabled = false;
      certInfo.value =
        x509cert.displayName + " [" + x509cert.serialNumber + "]";
      certInfo.displayName = x509cert.displayName;
      certInfo.dbKey = x509cert.dbKey;

      if (selectEncryptionCert) {
        enableEncryptionControls(true);

        checkOtherCert(
          x509cert,
          kSigningCertPref,
          email_signing_cert_usage,
          "signing_needCertWantSame",
          "signing_wantSame",
          "signing_needCertWantToSelect",
          enableSigningControls
        );
      } else {
        enableSigningControls(true);

        checkOtherCert(
          x509cert,
          kEncryptionCertPref,
          email_recipient_cert_usage,
          "encryption_needCertWantSame",
          "encryption_wantSame",
          "encryption_needCertWantToSelect",
          enableEncryptionControls
        );
      }
    }
  }

  updateTechPref();
  enableSelectButtons();
  onSave();
}

function enableEncryptionControls(do_enable) {
  gRequireEncrypt.disabled = !do_enable;
  gDoNotEncrypt.disabled = !do_enable;
  if (!do_enable) {
    gEncryptionChoices.value = 0;
  }
}

function enableSigningControls(do_enable) {
  gSignMessages.disabled = !do_enable;
  if (!do_enable) {
    gSignMessages.checked = false;
  }
}

function enableSelectButtons() {
  gSignCertName.disabled = !gSignCertName.value;
  document.getElementById(
    "signingCertClearButton"
  ).disabled = !gSignCertName.value;

  gEncryptionCertName.disabled = !gEncryptionCertName.value;
  document.getElementById(
    "encryptionCertClearButton"
  ).disabled = !gEncryptionCertName.value;

  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    gKeyId.disabled = !gKeyId.value;
    document.getElementById("openpgpKeyClearButton").disabled = !gKeyId.value;
  }
}

function pgpClearKey(pgp_key) {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    return;
  }
  var keyInfo = document.getElementById(pgp_key);
  if (!keyInfo) {
    return;
  }

  keyInfo.disabled = true;
  keyInfo.value = "";

  let stillHaveOtherSigning = gSignCertName && gSignCertName.value;
  let stillHaveOtherEncryption =
    gEncryptionCertName && gEncryptionCertName.value;

  if (!stillHaveOtherEncryption) {
    enableEncryptionControls(false);
  }
  if (!stillHaveOtherSigning) {
    enableSigningControls(false);
  }
  updateTechPref();
  enableSelectButtons();
  onSave();
}

function smimeClearCert(smime_cert) {
  var certInfo = document.getElementById(smime_cert);
  if (!certInfo) {
    return;
  }

  certInfo.disabled = true;
  certInfo.value = "";
  certInfo.displayName = "";
  certInfo.dbKey = "";

  let stillHaveOther = false;
  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    stillHaveOther = gKeyId && gKeyId.value;
  }

  if (!stillHaveOther) {
    if (smime_cert == kEncryptionCertPref) {
      enableEncryptionControls(false);
    } else if (smime_cert == kSigningCertPref) {
      enableSigningControls(false);
    }
  }

  updateTechPref();
  enableSelectButtons();
  onSave();
}

function updateTechPref() {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    return;
  }

  let haveSigCert = gSignCertName && gSignCertName.value;
  let haveEncCert = gEncryptionCertName && gEncryptionCertName.value;
  let havePgpkey = gKeyId && gKeyId.value;

  let enable = (haveSigCert || haveEncCert) && havePgpkey;

  gTechAuto.disabled = !enable;
  gTechPrefOpenPGP.disabled = !enable;
  gTechPrefSMIME.disabled = !enable;

  if (!enable) {
    gIdentity.setIntAttribute("e2etechpref", 0);
    gHiddenTechPref.setAttribute("value", 0);
    gTechChoices.value = 0;
  }
}

function openCertManager() {
  parent.gSubDialog.open("chrome://pippki/content/certManager.xhtml");
}

function openDeviceManager() {
  parent.gSubDialog.open("chrome://pippki/content/device_manager.xhtml");
}

function e2eOnLoadEditor() {
  e2eInitializeFields();
}
