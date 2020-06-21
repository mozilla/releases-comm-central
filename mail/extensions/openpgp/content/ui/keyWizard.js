/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Uses: chrome://openpgp/content/ui/enigmailCommon.js

"use strict";

// Modules
/* global EnigmailApp: false, EnigmailKeyRing: false, GetEnigmailSvc: false,
   EnigInitCommon: false, EnigSavePrefs: false, EnigFilePicker: false,
   EnigGetFilePath: false, EnigmailWindows: false */

// Initialize enigmailCommon.
EnigInitCommon("enigmailKeygen");

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);
var EnigmailCryptoAPI = ChromeUtils.import(
  "chrome://openpgp/content/modules/cryptoAPI.jsm"
).EnigmailCryptoAPI;
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);
var OpenPGPMasterpass = ChromeUtils.import(
  "chrome://openpgp/content/modules/masterpass.jsm"
).OpenPGPMasterpass;
var { RNP } = ChromeUtils.import("chrome://openpgp/content/modules/RNP.jsm");

// UI variables.
var gIdentity;
var gSubDialog;
var kStartSection;
var kDialog;
var kCurrentSection = "start";
var kGenerating = false;
var kButtonLabel;

// OpenPGP variables.
var gKeygenRequest;
var gAllData = "";
var gGeneratedKey = null;

const DEFAULT_FILE_PERMS = 0o600;

// The revocation strings are not localization since the revocation certificate
// will be published to others who may not know the native language of the user.
const revocationFilePrefix1 =
  "This is a revocation certificate for the OpenPGP key:";
const revocationFilePrefix2 = `
A revocation certificate is kind of a "kill switch" to publicly
declare that a key shall no longer be used.  It is not possible
to retract such a revocation certificate once it has been published.

Use it to revoke this key in case of a secret key compromise, or loss of
the secret key, or loss of passphrase of the secret key.

To avoid an accidental use of this file, a colon has been inserted
before the 5 dashes below.  Remove this colon with a text editor
before importing and publishing this revocation certificate.

:`;

// Dialog event listeners.
document.addEventListener("dialogaccept", wizardContinue);
document.addEventListener("dialoghelp", goBack);
document.addEventListener("dialogcancel", onClose);

/**
 * Initialize the keyWizard dialog.
 */
async function init() {
  gIdentity = window.arguments[0].identity;
  gSubDialog = window.arguments[0].gSubDialog;

  kStartSection = document.getElementById("wizardStart");
  kDialog = document.querySelector("dialog");

  document.l10n.setAttributes(
    document.documentElement,
    "key-wizard-dialog-window",
    {
      identity: gIdentity.email,
    }
  );

  // Show the GnuPG radio selection if the pref is enabled.
  if (Services.prefs.getBoolPref("mail.openpgp.allow_external_gnupg")) {
    document.getElementById("externalOpenPgp").removeAttribute("hidden");
  }

  // After the dialog is visible, disable the event listeners causing it to
  // close when clicking on the overlay or hitting the Esc key, and remove the
  // close button from the header. This is necessary to control the escape
  // point and prevent the accidental dismiss of the dialog during important
  // processes, like the generation or importing of a key.
  setTimeout(() => {
    gSubDialog._topDialog._removeDialogEventListeners();
    gSubDialog._topDialog._closeButton.remove();
  }, 150);
}

/**
 * Intercept the dialogaccept command to implement a wizard like setup workflow.
 *
 * @param {Event} event - The DOM Event.
 */
function wizardContinue(event) {
  event.preventDefault();

  // Pretty impossible scenario but just in case if no radio button is
  // currently selected, bail out.
  if (!document.getElementById("openPgpKeyChoices").value) {
    return;
  }

  // Trigger an action based on the currently visible section.
  if (kCurrentSection != "start") {
    wizardNextStep();
    return;
  }

  // Disable the `Continue` button.
  kDialog.getButton("accept").setAttribute("disabled", true);

  kStartSection.addEventListener("transitionend", switchSection);
  kStartSection.classList.add("hide");
}

/**
 * Separated method dealing with the section switching to allow the removal of
 * the event listener to prevent stacking.
 */
function switchSection() {
  kStartSection.setAttribute("hidden", true);
  kStartSection.removeEventListener("transitionend", switchSection);

  // Save the current label of the accept button in order to restore it later.
  kButtonLabel = kDialog.getButton("accept").label;

  // Update the UI based on the radiogroup selection.
  switch (document.getElementById("openPgpKeyChoices").value) {
    case "0":
      wizardCreateKey();
      break;

    case "1":
      wizardImportKey();
      break;

    case "2":
      wizardExternalKey();
      break;
  }

  // Show the `Go Back` button.
  kDialog.getButton("help").removeAttribute("hidden");
}

/**
 * Handle the next step of the wizard based on the currently visible section.
 */
async function wizardNextStep() {
  switch (kCurrentSection) {
    case "create":
      await openPgpKeygenStart();
      break;

    case "import":
      break;

    case "external":
      break;
  }
}

/**
 * Go back to the initial view of the wizard.
 */
function goBack() {
  let section = document.querySelector(".wizard-section:not([hidden])");
  section.addEventListener("transitionend", backToStart);
  section.classList.add("hide-reverse");
}

/**
 * Hide the currently visible section at the end of the animation, remove the
 * listener to prevent stacking, and trigger the reveal of the first section.
 *
 * @param {Event} event - The DOM Event.
 */
function backToStart(event) {
  // Hide the `Go Back` button.
  kDialog.getButton("help").setAttribute("hidden", true);
  // Enable the `Continue` button.
  kDialog.getButton("accept").removeAttribute("disabled");
  kDialog.getButton("accept").label = kButtonLabel;

  event.target.setAttribute("hidden", true);
  event.target.removeEventListener("transitionend", backToStart);

  // Reset section key.
  kCurrentSection = "start";

  revealSection("wizardStart");
}

/**
 * Show the Key Creation section.
 */
async function wizardCreateKey() {
  kCurrentSection = "create";
  revealSection("wizardCreateKey");

  let createLabel = await document.l10n.formatValue("openpgp-keygen-button");

  kDialog.getButton("accept").label = createLabel;

  if (!gIdentity.fullName) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-long-expiry"
    );
    return;
  }

  kDialog.getButton("accept").removeAttribute("disabled");
}

/**
 * Show the Key Import section.
 */
function wizardImportKey() {
  kCurrentSection = "import";
  revealSection("wizardImportKey");
}

/**
 * Show the Key Setup via external smartcard section.
 */
function wizardExternalKey() {
  kCurrentSection = "external";
  revealSection("wizardExternalKey");
}

/**
 * Animate the reveal of a section of the wizard.
 *
 * @param {string} id - The id of the section to reveal.
 */
function revealSection(id) {
  let section = document.getElementById(id);
  section.removeAttribute("hidden");

  // Timeout to animate after the hidden attribute has been removed.
  setTimeout(() => {
    section.classList.remove("hide", "hide-reverse");
  });

  resizeDialog();
}

/**
 * Enable or disable the elements based on the radiogroup selection.
 *
 * @param {Event} event - The DOM event triggered on change.
 */
function onExpirationChange(event) {
  document
    .getElementById("expireInput")
    .toggleAttribute("disabled", event.target.value != 0);
  document.getElementById("timeScale").disabled = event.target.value != 0;

  validateExpiration();
}

/**
 * Enable or disable the #keySize input field based on the current selection of
 * the #keyType radio group.
 *
 * @param {Event} event - The DOM Event.
 */
function onKeyTypeChange(event) {
  document.getElementById("keySize").disabled = event.target.value == "ECC";
}

/**
 * Intercept the cancel event to prevent accidental closing if the generation of
 * a key is currently in progress.
 *
 * @param {Event} event - The DOM event.
 */
function onClose(event) {
  if (kGenerating) {
    event.preventDefault();
  }
}

/**
 * Validate the expiration time of a newly generated key when the user changes
 * values. Disable the "Generate Key" button and show an alert if the selected
 * value is less than 1 day or more than 100 years.
 */
async function validateExpiration() {
  // If the key doesn't have an expiration date, hide the warning message and
  // enable the "Generate Key" button.
  if (document.getElementById("openPgpKeygeExpiry").value == 1) {
    document.getElementById("openPgpWarning").collapsed = true;
    kDialog.getButton("accept").removeAttribute("disabled");
    return;
  }

  // Calculate the selected expiration date.
  let expiryTime =
    Number(document.getElementById("expireInput").value) *
    Number(document.getElementById("timeScale").value);

  // If the expiration date exceeds 100 years.
  if (expiryTime > 36500) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-long-expiry"
    );
    kDialog.getButton("accept").setAttribute("disabled", true);
    resizeDialog();
    return;
  }

  // If the expiration date is shorter than 1 day.
  if (expiryTime <= 0) {
    document.getElementById("openPgpWarning").collapsed = false;
    document.l10n.setAttributes(
      document.getElementById("openPgpWarningDescription"),
      "openpgp-keygen-short-expiry"
    );
    kDialog.getButton("accept").setAttribute("disabled", true);
    resizeDialog();
    return;
  }

  // If the previous conditions are false, hide the warning message and
  // enable the "Generate Key" button since the expiration date is valid.
  document.getElementById("openPgpWarning").collapsed = true;
  kDialog.getButton("accept").removeAttribute("disabled");
}

/**
 * Resize the dialog to account for the newly visible sections. The timeout is
 * necessary in order to wait until the end of revealing animations.
 */
function resizeDialog() {
  // Timeout to trigger the dialog resize after the reveal animation completed.
  setTimeout(() => {
    gSubDialog._topDialog.resizeVertically();
  }, 230);
}

/**
 * Start the generation of a new OpenPGP Key.
 */
async function openPgpKeygenStart() {
  let openPgpWarning = document.getElementById("openPgpWarning");
  let openPgpWarningText = document.getElementById("openPgpWarningDescription");
  openPgpWarning.collapsed = true;

  // If a key generation request is already pending, warn the user and
  // don't proceed.
  if (gKeygenRequest) {
    let req = gKeygenRequest.QueryInterface(Ci.nsIRequest);

    if (req.isPending()) {
      openPgpWarning.collapsed = false;
      document.l10n.setAttributes(openPgpWarningText, "openpgp-keygen-ongoing");
      return;
    }
  }

  // Reset global variables to be sure.
  gGeneratedKey = null;
  gAllData = "";

  let enigmailSvc = GetEnigmailSvc();
  if (!enigmailSvc) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-core"
    );
    closeOverlay();

    throw new Error("GetEnigmailSvc failed");
  }

  // Show wizard overlay before the start of the generation process. This is
  // necessary because the generation happens synchronously and blocks the UI.
  // We need to show the overlay before it, otherwise it would flash and freeze.
  // This should be moved after the Services.prompt.confirmEx() method
  // once Bug 1617444 is implemented.
  let overlay = document.getElementById("wizardOverlay");
  overlay.removeAttribute("hidden");
  overlay.classList.remove("hide");

  // Ask for confirmation before triggering the generation of a new key.
  document.l10n.setAttributes(
    document.getElementById("wizardOverlayQuestion"),
    "openpgp-key-confirm",
    {
      identity: `${gIdentity.fullName} <b>"${gIdentity.email}"</b>`,
    }
  );

  document.l10n.setAttributes(
    document.getElementById("wizardOverlayTitle"),
    "openpgp-keygen-progress-title"
  );
}

async function openPgpKeygenConfirm() {
  document.getElementById("openPgpKeygenConfirm").collapsed = true;
  document.getElementById("openPgpKeygenProcess").removeAttribute("collapsed");

  let openPgpWarning = document.getElementById("openPgpWarning");
  let openPgpWarningText = document.getElementById("openPgpWarningDescription");
  openPgpWarning.collapsed = true;

  kGenerating = true;

  let cApi;
  try {
    let newId = null;
    cApi = EnigmailCryptoAPI();
    newId = cApi.sync(
      cApi.genKey(
        `${gIdentity.fullName} <${gIdentity.email}>`,
        document.getElementById("keyType").value,
        Number(document.getElementById("keySize").value),
        document.getElementById("openPgpKeygeExpiry").value == 1
          ? 0
          : Number(document.getElementById("expireInput").value) *
              Number(document.getElementById("timeScale").value),
        OpenPGPMasterpass.retrieveOpenPGPPassword()
      )
    );
    console.log("created new key with id: " + newId);
    gGeneratedKey = newId;
  } catch (ex) {
    console.log(ex);
  }

  EnigmailWindows.keyManReloadKeys();

  gKeygenRequest = null;
  kGenerating = true;

  // For wathever reason, the key wasn't generated. Show an error message and
  // hide the processing overlay.
  if (!gGeneratedKey) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-failed"
    );
    closeOverlay();

    throw new Error("key generation failed");
  }

  console.debug("saving new key id " + gGeneratedKey);
  EnigSavePrefs();

  // Hide wizard overlay at the end of the generation process.
  closeOverlay();
  EnigmailKeyRing.clearCache();

  let rev = cApi.sync(cApi.getNewRevocation(`0x${gGeneratedKey}`));
  if (!rev) {
    openPgpWarning.collapsed = false;
    document.l10n.setAttributes(
      openPgpWarningText,
      "openpgp-keygen-error-revocation",
      {
        key: gGeneratedKey,
      }
    );
    closeOverlay();

    throw new Error("failed to obtain revocation for key " + gGeneratedKey);
  }

  let revFull =
    revocationFilePrefix1 +
    "\n\n" +
    gGeneratedKey +
    "\n" +
    revocationFilePrefix2 +
    rev;

  let revFile = EnigmailApp.getProfileDirectory();
  revFile.append(`0x${gGeneratedKey}_rev.asc`);

  // Create a revokation cert in the Thunderbird profile directory.
  EnigmailFiles.writeFileContents(revFile, revFull, DEFAULT_FILE_PERMS);

  // Key successfully created. Assign the new key to the current identity, close
  // the dialog and show a confirmation message.
  gIdentity.setUnicharAttribute("openpgp_key_id", gGeneratedKey);
  window.arguments[0].okCallback();
  window.close();
}

/**
 * Cancel the keygen process, ask for confirmation before proceeding.
 */
async function openPgpKeygenCancel() {
  let abortTitle = await document.l10n.formatValue(
    "openpgp-keygen-abort-title"
  );
  let abortText = await document.l10n.formatValue("openpgp-keygen-abort");

  if (
    kGenerating &&
    Services.prompt.confirmEx(
      window,
      abortTitle,
      abortText,
      Services.prompt.STD_YES_NO_BUTTONS,
      "",
      "",
      "",
      "",
      {}
    ) != 0
  ) {
    return;
  }

  closeOverlay();
  gKeygenRequest.kill(false);
  kGenerating = false;
}

/**
 * Close the processing wizard overlay.
 */
function closeOverlay() {
  document.getElementById("openPgpKeygenConfirm").removeAttribute("collapsed");
  document.getElementById("openPgpKeygenProcess").collapsed = true;

  let overlay = document.getElementById("wizardOverlay");

  overlay.removeAttribute("hidden");
  overlay.addEventListener("transitionend", hideOverlay);
  overlay.classList.add("hide");
}

/**
 * Add the "hidden" attribute tot he processing wizard overlay after the CSS
 * transition ended.
 *
 * @param {Event} event - The DOM Event.
 */
function hideOverlay(event) {
  event.target.setAttribute("hidden", true);
  event.target.removeEventListener("transitionend", hideOverlay);
}
