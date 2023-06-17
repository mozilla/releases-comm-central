/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { RNP, RnpPrivateKeyUnlockTracker } = ChromeUtils.import(
  "chrome://openpgp/content/modules/RNP.jsm"
);

let gFingerprints = [];
let gKeyCreated;

window.addEventListener("DOMContentLoaded", onLoad);
function onLoad() {
  let keyId = window.arguments[0].keyId;
  let keyObj = EnigmailKeyRing.getKeyById(window.arguments[0].keyId);
  if (!keyObj) {
    throw new Error(`Key not found: ${keyId}`);
  }
  if (!keyObj.secretAvailable) {
    keyObj = null;
    throw new Error(`Not your key: ${keyId}`);
  }

  if (!keyObj.iSimpleOneSubkeySameExpiry()) {
    window.close();
    return;
  }

  gFingerprints = [keyObj.fpr, keyObj.subKeys[0].fpr];
  gKeyCreated = keyObj.keyCreated;

  let currentExpiryInfo = document.getElementById("info-current-expiry");

  if (!keyObj.expiryTime) {
    document.l10n.setAttributes(currentExpiryInfo, "info-does-not-expire");
  } else {
    let nowSeconds = Math.floor(Date.now() / 1000);
    if (keyObj.expiryTime < nowSeconds) {
      document.l10n.setAttributes(currentExpiryInfo, "info-already-expired");
    } else {
      document.l10n.setAttributes(currentExpiryInfo, "info-will-expire", {
        date: keyObj.expiry,
      });
    }
  }

  // Don't explain how to use longer, if this key already never expires.
  document.getElementById("longerUsage").hidden = !keyObj.expiryTime;

  let popup = document.getElementById("expiry-in");
  let rtf = new Intl.RelativeTimeFormat(undefined, {
    numeric: "always",
    style: "long",
  });
  let today = new Date();
  for (let i = 1; i < 24; i++) {
    let d = new Date(
      today.getFullYear(),
      today.getMonth() + i,
      today.getDate()
    );
    let option = document.createElement("option");
    option.value = Math.floor(d.getTime() / 1000); // In seconds.
    option.label = rtf.format(i, "month");
    popup.appendChild(option);
  }
  for (let i = 2; i <= 10; i++) {
    let d = new Date(
      today.getFullYear() + i,
      today.getMonth(),
      today.getDate()
    );
    let option = document.createElement("option");
    option.value = Math.floor(d.getTime() / 1000); // In seconds.
    option.label = rtf.format(i, "year");
    popup.appendChild(option);
  }
  if (keyObj.expiryTime) {
    popup.selectedIndex = [...popup.children].findIndex(
      o => o.value >= keyObj.expiryTime
    );
  } else {
    popup.selectedIndex = 23; // 2 years
  }
  document.getElementById("radio-expire-yes").value = popup.value;

  popup.addEventListener("change", event => {
    document.getElementById("radio-expire-yes").value = event.target.value;
    document.getElementById("radio-expire-yes").checked = true;
  });
}

async function onAccept() {
  let expirySecs = +document.querySelector("input[name='expiry']:checked")
    .value;
  if (expirySecs < 0) {
    // Keep.
    return true;
  }
  // Key Expiration Time - this is the number of seconds after the key creation
  // time that the key expires.
  let keyExpirationTime = expirySecs ? expirySecs - gKeyCreated : 0;

  let pwCache = {
    passwords: [],
  };

  let unlockFailed = false;
  let keyTrackers = [];
  for (let fp of gFingerprints) {
    let tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(fp);
    tracker.setAllowPromptingUserForPassword(true);
    tracker.setAllowAutoUnlockWithCachedPasswords(true);
    tracker.setPasswordCache(pwCache);
    await tracker.unlock();
    keyTrackers.push(tracker);
    if (!tracker.isUnlocked()) {
      unlockFailed = true;
      break;
    }
  }

  let rv = false;
  if (!unlockFailed) {
    rv = RNP.changeExpirationDate(gFingerprints, keyExpirationTime);
  }

  for (let t of keyTrackers) {
    t.release();
  }
  return rv;
}

document.addEventListener("dialogaccept", async function (event) {
  // Prevent the closing of the dialog to wait until the call
  // to onAccept() has properly returned.
  event.preventDefault();
  let result = await onAccept();
  // If the change was unsuccessful, leave this dialog open.
  if (!result) {
    return;
  }
  // Otherwise, update the parent window and close the dialog.
  window.arguments[0].modified();
  window.close();
});
