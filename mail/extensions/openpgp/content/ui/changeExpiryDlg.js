/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EnigmailKeyRing } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/keyRing.sys.mjs"
);
var { EnigmailKey } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/key.sys.mjs"
);
var { RNP, RnpPrivateKeyUnlockTracker } = ChromeUtils.importESModule(
  "chrome://openpgp/content/modules/RNP.sys.mjs"
);

let gFingerprints = [];
let gKeyCreated;

window.addEventListener("DOMContentLoaded", onLoad);
function onLoad() {
  const keyId = window.arguments[0].keyId;
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

  const currentExpiryInfo = document.getElementById("info-current-expiry");

  if (!keyObj.expiryTime) {
    document.l10n.setAttributes(currentExpiryInfo, "info-does-not-expire");
  } else {
    const nowSeconds = Math.floor(Date.now() / 1000);
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

  const popup = document.getElementById("expiry-in");
  const rtf = new Intl.RelativeTimeFormat(undefined, {
    numeric: "always",
    style: "long",
  });
  const today = new Date();
  for (let i = 1; i < 24; i++) {
    const d = new Date(
      today.getFullYear(),
      today.getMonth() + i,
      today.getDate()
    );
    const option = document.createElement("option");
    option.value = Math.floor(d.getTime() / 1000); // In seconds.
    option.label = rtf.format(i, "month");
    popup.appendChild(option);
  }
  for (let i = 2; i <= 10; i++) {
    const d = new Date(
      today.getFullYear() + i,
      today.getMonth(),
      today.getDate()
    );
    const option = document.createElement("option");
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
  const expirySecs = +document.querySelector("input[name='expiry']:checked")
    .value;
  if (expirySecs < 0) {
    // Keep.
    return true;
  }
  // Key Expiration Time - this is the number of seconds after the key creation
  // time that the key expires.
  const keyExpirationTime = expirySecs ? expirySecs - gKeyCreated : 0;

  const pwCache = {
    passwords: [],
  };

  let unlockFailed = false;
  const keyTrackers = [];
  for (const fp of gFingerprints) {
    const tracker = RnpPrivateKeyUnlockTracker.constructFromFingerprint(fp);
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

  for (const t of keyTrackers) {
    t.release();
  }
  return rv;
}

document.addEventListener("dialogaccept", async function (event) {
  // Prevent the closing of the dialog to wait until the call
  // to onAccept() has properly returned.
  event.preventDefault();
  const result = await onAccept();
  // If the change was unsuccessful, leave this dialog open.
  if (!result) {
    return;
  }
  // Otherwise, update the parent window and close the dialog.
  window.arguments[0].modified();
  window.close();
});
