/* -*- Mode: Java; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 4 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

// Modules
/* global GetEnigmailSvc: false, PgpSqliteDb2: false */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailConstants } = ChromeUtils.import(
  "resource:///modules/MailConstants.jsm"
);
var { BondOpenPGP } = ChromeUtils.import(
  "chrome://openpgp/content/BondOpenPGP.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);

if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
  var { EnigmailKeyRing } = ChromeUtils.import(
    "chrome://openpgp/content/modules/keyRing.jsm"
  );
  var EnigmailCryptoAPI = ChromeUtils.import(
    "chrome://openpgp/content/modules/cryptoAPI.jsm"
  ).EnigmailCryptoAPI;
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

var gTechAuto = null;
var gTechPrefOpenPGP = null;
var gTechPrefSMIME = null;

function onInit() {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    for (let item of document.querySelectorAll(".openpgp-item")) {
      item.hidden = true;
    }
  }
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
    document
      .getElementById("openPgpKeyListRadio")
      .setAttribute(
        "preference",
        `mail.identity.${gIdentity.key}.openpgp_key_id`
      );

    if (!Preferences.get(`mail.identity.${gIdentity.key}.openpgp_key_id`)) {
      Preferences.add({
        id: `mail.identity.${gIdentity.key}.openpgp_key_id`,
        type: "string",
      });
    }

    gTechChoices = document.getElementById("technologyChoices");
    gKeyId = Services.prefs.getStringPref(
      `mail.identity.${gIdentity.key}.openpgp_key_id`,
      ""
    );
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

    // If the user doesn't have an identity defined but OpenPGP is available,
    // we hide the entire section to avoid issues and edge cases.
    if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
      document
        .getElementById("openpgpOptions")
        .setAttribute("hidden", "hidden");
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
      enableEnc = enableEnc || !!gKeyId;
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
      enableSig = enableSig || !!gKeyId;
    }

    gSignMessages.disabled = !enableSig;
    enableSigningControls(enableSig);
  }

  // Always start with enabling select buttons.
  // This will keep the visibility of buttons in a sane state as user
  // jumps from security panel of one account to another.
  enableSelectButtons();
  updateTechPref();

  initOpenPgpSettings();
}

/**
 * Initialize the OpenPGP settings, apply strings, and load the key radio UI.
 */
async function initOpenPgpSettings() {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    return;
  }

  let result = {};
  await EnigmailKeyRing.getAllSecretKeysByEmail(gIdentity.email, result, true);

  document.l10n.setAttributes(
    document.getElementById("openPgpgDescription"),
    "openpgp-description",
    {
      count: result.all.length,
      identity: gIdentity.email,
    }
  );

  // Force deselect the currently selected first index fo the radiogroup if
  // an OpenPGP Key is currently set. This is necessary to allow the selection
  // of the currently used key.
  if (gKeyId) {
    document.getElementById("openPgpKeyListRadio").selectedIndex = -1;
  }

  // Load all the available keys.
  reloadOpenPgpUI();

  // Listen for the preference changes.
  Preferences.get(`mail.identity.${gIdentity.key}.openpgp_key_id`).on(
    "change",
    updateOpenPgpSettings
  );
}

function onPreInit(account, accountValues) {
  gIdentity = account.defaultIdentity;
}

function onSave() {
  e2eSave();
  window.dispatchEvent(new CustomEvent("prefchange"));
}

function e2eSave() {
  // find out which radio for the encryption radio group is selected and set
  // that on our hidden encryptionChoice pref.
  var newValue = gEncryptionChoices.value;
  gHiddenEncryptionPolicy.setAttribute("value", newValue);
  gIdentity.setIntAttribute("encryptionpolicy", newValue);

  if (MailConstants.MOZ_OPENPGP && BondOpenPGP.allDependenciesLoaded()) {
    newValue = gTechChoices.value;
    gHiddenTechPref.setAttribute("value", newValue);
    gIdentity.setIntAttribute("e2etechpref", newValue);
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
    stillHaveOther = gKeyId != "";
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
  let havePgpkey = !!gKeyId;

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

/**
 * Open the subdialog to create or import an OpenPGP key.
 */
function openKeyWizard() {
  if (!MailConstants.MOZ_OPENPGP || !BondOpenPGP.allDependenciesLoaded()) {
    return;
  }

  let args = {
    identity: gIdentity,
    gSubDialog: parent.gSubDialog,
    okCallback: keyWizardSuccess,
  };
  parent.gSubDialog.open(
    "chrome://openpgp/content/ui/keyWizard.xhtml",
    null,
    args
  );
}

/**
 * Show a succesfull notification after a new OpenPGP key was created, and
 * trigger the reload of the key listing UI.
 */
async function keyWizardSuccess() {
  document.l10n.setAttributes(
    document.getElementById("openPgpNotificationDescription"),
    "openpgp-keygen-success"
  );
  document.getElementById("openPgpNotification").collapsed = false;
  document.getElementById("openPgpKeyList").collapsed = false;

  // Update the global key with the recently generated key that was assigned to
  // this identity from the Key generation wizard.
  gKeyId = gIdentity.getUnicharAttribute("openpgp_key_id");

  reloadOpenPgpUI();
}

/**
 * Collapse the inline notification.
 */
function closeNotification() {
  document.getElementById("openPgpNotification").collapsed = true;
}

/**
 * Refresh the UI on init or after a successful OpenPGP Key generation.
 */
async function reloadOpenPgpUI() {
  let result = {};
  await EnigmailKeyRing.getAllSecretKeysByEmail(gIdentity.email, result, true);

  // Show the radiogroup only if the current identity has keys.
  document.getElementById("openPgpKeyList").collapsed = !result.all.length;

  // Interrupt and udpate the UI accordingly if no Key is associated with the
  // current identity.
  if (!result.all.length) {
    // Hide the selection status.
    document
      .getElementById("openPgpgSelectionStatus")
      .setAttribute("hidden", "hidden");

    // Hide the learn more link.
    document.getElementById("openPgpLearnMore").setAttribute("hidden", "true");

    gKeyId = null;
    highlightOpenPgpKey();
    return;
  }

  document.l10n.setAttributes(
    document.getElementById("openPgpgDescription"),
    "openpgp-description",
    {
      count: result.all.length,
      identity: gIdentity.email,
    }
  );

  let status = document.getElementById("openPgpgSelectionStatus");
  status.removeAttribute("hidden");

  document.l10n.setAttributes(status, "openpgp-selection-status", {
    count: gKeyId ? 1 : 0,
    key: `0x${gKeyId}`,
  });

  document.getElementById("openPgpLearnMore").removeAttribute("hidden");

  let radiogroup = document.getElementById("openPgpKeyListRadio");

  // Remove all the previously generated radio options, except the first.
  while (radiogroup.lastChild.id != "openPgpOptionNone") {
    radiogroup.removeChild(radiogroup.lastChild);
  }

  // List all the available keys.
  for (let key of result.all) {
    let container = document.createXULElement("vbox");
    container.id = `openPgpOption${key.keyId}`;
    container.classList.add("content-blocking-category");

    let box = document.createXULElement("hbox");

    let radio = document.createXULElement("radio");
    radio.setAttribute("flex", "1");
    radio.id = `openPgp${key.keyId}`;
    radio.value = key.keyId;
    radio.label = `0x${key.keyId}`;

    if (key.keyId == gIdentity.getUnicharAttribute("openpgp_key_id")) {
      radio.setAttribute("selected", "true");
    }

    let toggle = document.createXULElement("button");
    toggle.classList.add("arrowhead");
    toggle.setAttribute("aria-expanded", "false");
    document.l10n.setAttributes(toggle, "openpgp-key-expand-section");
    toggle.addEventListener("command", toggleExpansion);

    box.appendChild(radio);
    box.appendChild(toggle);

    let indent = document.createXULElement("vbox");
    indent.classList.add("indent");

    let dateContainer = document.createXULElement("hbox");
    dateContainer.classList.add("expiration-date-container");
    dateContainer.setAttribute("align", "center");

    let dateIcon = document.createXULElement("image");
    dateIcon.classList.add("expiration-date-icon");

    let dateButton = document.createXULElement("button");
    document.l10n.setAttributes(dateButton, "openpgp-key-man-change-expiry");
    dateButton.addEventListener("command", enigmailEditKeyDate);
    dateButton.setAttribute("hidden", "true");
    dateButton.classList.add("expiration-date-button");

    let today = new Date();
    today.setMonth(today.getMonth() + 6);

    // If the key expires in less than 6 months.
    if (
      key.expiryTime &&
      Math.round(Date.parse(today) / 1000) > key.expiryTime
    ) {
      dateContainer.classList.add("key-is-expiring");
      document.l10n.setAttributes(dateIcon, "openpgp-key-expires-image");
      dateButton.removeAttribute("hidden");
    }

    let fluentExpireKey = "openpgp-radio-key-expires";
    // If the key passed its expiration date.
    if (key.expiryTime && Math.round(Date.now() / 1000) > key.expiryTime) {
      dateContainer.classList.add("key-expired");
      fluentExpireKey = "openpgp-radio-key-expired";
      document.l10n.setAttributes(dateIcon, "openpgp-key-expired-image");
      dateButton.removeAttribute("hidden");
    }

    let description = document.createXULElement("description");
    if (key.expiryTime) {
      document.l10n.setAttributes(description, fluentExpireKey, {
        date: key.expiry,
      });
    } else {
      document.l10n.setAttributes(description, "key-does-not-expire");
    }

    dateContainer.appendChild(dateIcon);
    dateContainer.appendChild(description);
    dateContainer.appendChild(dateButton);

    let hiddenContainer = document.createXULElement("vbox");
    hiddenContainer.classList.add(
      "content-blocking-extra-information",
      "indent"
    );

    // Start key info section.

    // Key type.
    let grid = document.createXULElement("hbox");
    grid.classList.add("extra-information-label");

    let typeImage = document.createXULElement("image");
    typeImage.classList.add("content-blocking-openpgp-type");

    let typeLabel = document.createXULElement("label");
    document.l10n.setAttributes(
      typeLabel,
      "openpgp-key-details-key-type-label"
    );
    typeLabel.classList.add("extra-information-label-type");

    let typeValueContainer = document.createXULElement("hbox");
    typeValueContainer.classList.add("input-container");
    typeValueContainer.setAttribute("flex", "1");

    let typeValue = document.createElement("input");
    typeValue.setAttribute("type", "text");
    typeValue.classList.add("plain");
    typeValue.setAttribute("readonly", "readonly");
    typeValue.value = await document.l10n.formatValue("key-type-pair");

    typeValueContainer.appendChild(typeValue);

    grid.appendChild(typeImage);
    grid.appendChild(typeLabel);
    grid.appendChild(typeValueContainer);

    // Key fingerprint.
    let fingerprintImage = document.createXULElement("image");
    fingerprintImage.classList.add("content-blocking-openpgp-fingerprint");

    let fingerprintLabel = document.createXULElement("label");
    document.l10n.setAttributes(
      fingerprintLabel,
      "openpgp-key-details-fingerprint-label"
    );
    fingerprintLabel.classList.add("extra-information-label-type");

    let fgrInputContainer = document.createXULElement("hbox");
    fgrInputContainer.classList.add("input-container");
    fgrInputContainer.setAttribute("flex", "1");

    let fingerprintInput = document.createElement("input");
    fingerprintInput.setAttribute("type", "text");
    fingerprintInput.classList.add("plain");
    fingerprintInput.setAttribute("readonly", "readonly");
    fingerprintInput.value = EnigmailKey.formatFpr(key.fpr);

    fgrInputContainer.appendChild(fingerprintInput);

    grid.appendChild(fingerprintImage);
    grid.appendChild(fingerprintLabel);
    grid.appendChild(fgrInputContainer);

    // Key creation date.
    let createdImage = document.createXULElement("image");
    createdImage.classList.add("content-blocking-openpgp-created");

    let createdLabel = document.createXULElement("label");
    document.l10n.setAttributes(
      createdLabel,
      "openpgp-key-details-created-header"
    );
    createdLabel.classList.add("extra-information-label-type");

    let createdValueContainer = document.createXULElement("hbox");
    createdValueContainer.classList.add("input-container");
    createdValueContainer.setAttribute("flex", "1");

    let createdValue = document.createElement("input");
    createdValue.setAttribute("type", "text");
    createdValue.classList.add("plain");
    createdValue.setAttribute("readonly", "readonly");
    createdValue.value = key.created;

    createdValueContainer.appendChild(createdValue);

    grid.appendChild(createdImage);
    grid.appendChild(createdLabel);
    grid.appendChild(createdValueContainer);
    // End key info section.

    hiddenContainer.appendChild(grid);

    // Action buttons.
    let btnContainer = document.createXULElement("hbox");

    let remove = document.createXULElement("button");
    document.l10n.setAttributes(remove, "openpgp-key-man-del-key");
    remove.addEventListener("command", () => {
      enigmailDeleteKey(key);
    });

    let edit = document.createXULElement("button");
    document.l10n.setAttributes(edit, "openpgp-key-man-edit-menu");
    edit.addEventListener("command", enigmailEditKey);

    let revoke = document.createXULElement("button");
    document.l10n.setAttributes(revoke, "openpgp-key-man-revoke-key");
    revoke.addEventListener("command", enigmailRevokeKey);

    let info = document.createXULElement("button");
    document.l10n.setAttributes(info, "openpgp-key-man-key-props");
    info.addEventListener("command", () => {
      enigmailKeyDetails(key.keyId);
    });

    let btnSeparator = document.createXULElement("separator");
    btnSeparator.setAttribute("flex", "1");

    btnContainer.appendChild(info);
    btnContainer.appendChild(btnSeparator);
    btnContainer.appendChild(edit);
    btnContainer.appendChild(revoke);
    btnContainer.appendChild(remove);

    hiddenContainer.appendChild(btnContainer);

    indent.appendChild(dateContainer);
    indent.appendChild(hiddenContainer);

    container.appendChild(box);
    container.appendChild(indent);

    radiogroup.appendChild(container);
  }

  highlightOpenPgpKey();
}

/**
 * Open the Key Properties subdialog.
 *
 * @param {string} keyId - The ID of the selected OpenPGP Key.
 */
function enigmailKeyDetails(keyId) {
  keyId = keyId.replace(/^0x/, "");

  parent.gSubDialog.open(
    "chrome://openpgp/content/ui/keyDetailsDlg.xhtml",
    null,
    { keyId }
  );
}

/**
 * Delete an OpenPGP Key.
 *
 * @param {Object} key - The selected OpenPGP Key.
 */
async function enigmailDeleteKey(key) {
  if (!GetEnigmailSvc()) {
    return;
  }

  // Interrupt if the selected key is currently being used.
  if (key.keyId == gIdentity.getUnicharAttribute("openpgp_key_id")) {
    let alertTitle = await document.l10n.formatValue("delete-key-in-use-title");
    let alertDescription = await document.l10n.formatValue(
      "delete-key-in-use-description"
    );

    Services.prompt.alert(null, alertTitle, alertDescription);
    return;
  }

  let l10nKey = key.secretAvailable ? "delete-secret-key" : "delete-pub-key";
  let title = await document.l10n.formatValue("delete-key-title", {
    userId: key.userId,
  });
  let description = await document.l10n.formatValue(l10nKey, {
    userId: key.userId,
  });

  // Ask for confirmation before proceeding.
  if (!Services.prompt.confirm(null, title, description)) {
    return;
  }

  let cApi = EnigmailCryptoAPI();
  cApi.sync(cApi.deleteKey(key.fpr, key.secretAvailable));
  cApi.sync(PgpSqliteDb2.deleteAcceptance(key.fpr));

  EnigmailKeyRing.clearCache();
  reloadOpenPgpUI();
}

/**
 * Open the subdialog to enable the user to edit the the selected OpenPGP Key.
 *
 * @param {Event} event - The DOM event.
 */
async function enigmailEditKey(event) {
  // TODO: Not yet implemented. Alert the user of the WIP status.
  let title = await document.l10n.formatValue("openpgp-key-edit-title");

  Services.prompt.alert(
    window,
    title,
    "Work in Progress: Key editing not yet implemented"
  );
}

/**
 * Open the subdialog to enable the user to revoke the selected OpenPGP Key.
 *
 * @param {Event} event - The DOM event.
 */
async function enigmailRevokeKey(event) {
  // TODO: Not yet implemented. Alert the user of the WIP status.
  let title = await document.l10n.formatValue("openpgp-key-revoke-title");

  Services.prompt.alert(
    window,
    title,
    "Work in Progress: Key revocation not yet implemented"
  );
}

/**
 * Open the subdialog to enable the user to edit the expiration date of the
 * selected OpenPGP Key.
 *
 * @param {Event} event - The DOM event.
 */
async function enigmailEditKeyDate(event) {
  // TODO: Not yet implemented. Alert the user of the WIP status.
  let title = await document.l10n.formatValue("openpgp-key-edit-date-title");

  Services.prompt.alert(
    window,
    title,
    "Work in Progress: Key date extention not yet implemented"
  );
}

/**
 * Toggle the visibility of the OpenPgp Key radio container.
 *
 * @param {Event} event - The DOM event.
 */
function toggleExpansion(event) {
  let carat = event.target;
  carat.classList.toggle("up");
  carat.closest(".content-blocking-category").classList.toggle("expanded");
  carat.setAttribute(
    "aria-expanded",
    carat.getAttribute("aria-expanded") === "false"
  );
}

/**
 * Update all the encryption options based on the newly selected OpenPGP Key.
 */
function updateOpenPgpSettings() {
  // Get the newly selected OpenPgp Key for this identity.
  let newKey = Services.prefs.getStringPref(
    `mail.identity.${gIdentity.key}.openpgp_key_id`,
    ""
  );

  // Avoid running the method if the key didn't change.
  if (gKeyId == newKey) {
    return;
  }

  gKeyId = newKey;

  if (gKeyId) {
    enableEncryptionControls(true);
    enableSigningControls(true);
  } else {
    let stillHaveOtherEncryption =
      gEncryptionCertName && gEncryptionCertName.value;
    if (!stillHaveOtherEncryption) {
      enableEncryptionControls(false);
    }

    let stillHaveOtherSigning = gSignCertName && gSignCertName.value;
    if (!stillHaveOtherSigning) {
      enableSigningControls(false);
    }
  }

  updateTechPref();
  enableSelectButtons();
  onSave();

  highlightOpenPgpKey();
}

/**
 * Apply a .selected class to the radio container of the currently selected
 * OpenPGP Key.
 */
function highlightOpenPgpKey() {
  // Remove a previously selected container, if any.
  let current = document.querySelector(".content-blocking-category.selected");

  if (current) {
    current.classList.remove("selected");
  }

  // Highlight the parent container of the currently selected radio button.
  // The condition needs to be sure the key is not null as a selection of "None"
  // results with a value of "".
  if (gKeyId !== null) {
    document
      .querySelector(`radio[value="${gKeyId}"]`)
      .closest(".content-blocking-category")
      .classList.add("selected");
  }

  document.l10n.setAttributes(
    document.getElementById("openPgpgSelectionStatus"),
    "openpgp-selection-status",
    {
      count: gKeyId ? 1 : 0,
      key: `0x${gKeyId}`,
    }
  );

  // Show a green checkmark if a key is currently being used.
  // TODO: This needs further iterations in order to show a proper flag in case
  // the selected Key is expired or revoked.
  let image = document.getElementById("openPgpStatusImage");
  if (gKeyId) {
    image.removeAttribute("hidden");
  } else {
    image.setAttribute("hidden", "true");
  }
}
