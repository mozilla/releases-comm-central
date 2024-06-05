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

let gKeyObj;
let gKeyCreated;
let gSimpleMode;
let gExpiryPopup;
let gValidityInfo;
let gKeySelect;
let gKeyObjToEdit;

window.addEventListener("DOMContentLoaded", onLoad);
async function onLoad() {
  const keyId = window.arguments[0].keyId;
  gKeyObj = EnigmailKeyRing.getKeyById(keyId);
  if (!gKeyObj) {
    throw new Error(`Key not found: ${keyId}`);
  }
  if (!gKeyObj.secretAvailable) {
    throw new Error(`Not your key: ${keyId}`);
  }
  if (gKeyObj.keyTrust == "r") {
    // If primary key is revoked then no change is possible.
    throw new Error(`Revoked key: ${keyId}`);
  }

  gSimpleMode = gKeyObj.iSimpleOneSubkeySameExpiry();
  document.l10n.setAttributes(
    document.getElementById("intro"),
    gSimpleMode ? "info-explanation-1" : "info-explanation-1-complex"
  );

  // Don't explain how to use longer, if this key already never expires,
  // or the key isn't simple.
  document.getElementById("longerUsage").hidden =
    !gSimpleMode || !gKeyObj.expiryTime;

  gValidityInfo = document.getElementById("info-current-expiry");
  if (!gSimpleMode) {
    gValidityInfo.hidden = true;
  } else if (!gKeyObj.expiryTime) {
    document.l10n.setAttributes(gValidityInfo, "info-does-not-expire");
  } else {
    const nowSeconds = Math.floor(Date.now() / 1000);
    if (gKeyObj.expiryTime < nowSeconds) {
      document.l10n.setAttributes(gValidityInfo, "info-already-expired");
    } else {
      document.l10n.setAttributes(gValidityInfo, "info-will-expire", {
        date: gKeyObj.expiry,
      });
    }
  }

  gKeySelect = document.getElementById("keySelect");
  gExpiryPopup = document.getElementById("expiry-in");
  gExpiryPopup.addEventListener("change", event => {
    document.getElementById("radio-expire-yes").value = event.target.value;
    document.getElementById("radio-expire-yes").checked = true;
  });

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
    gExpiryPopup.appendChild(option);
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
    gExpiryPopup.appendChild(option);
  }

  if (gSimpleMode) {
    gKeySelect.hidden = true;
    document.getElementById("complexKeyContainer").hidden = true;
  } else {
    gKeySelect.addEventListener("change", event => {
      keySelected(event.target.value);
    });

    const sep = " - ";
    const [expiredString, neverExpiresString, primary, sub] =
      await document.l10n.formatValues([
        { id: "partial-label-expired" },
        { id: "partial-label-never-expires" },
        { id: "key-type-primary" },
        { id: "key-type-subkey" },
      ]);

    for (let index = -1; index < gKeyObj.subKeys.length; index++) {
      let label;

      const k = index == -1 ? gKeyObj : gKeyObj.subKeys[index];

      if (k.keyTrust == "r") {
        // don't show revoked subkeys
        continue;
      }

      label = index == -1 ? primary : sub;
      label += sep + "0x" + k.keyId + sep;

      if (!k.expiryTime) {
        label += neverExpiresString;
      } else {
        const nowSeconds = Math.floor(Date.now() / 1000);
        if (k.expiryTime < nowSeconds) {
          label += expiredString;
        } else {
          label += await document.l10n.formatValue("partial-label-expires", {
            date: k.expiry,
          });
        }
      }

      const option = document.createElement("option");
      option.value = index;
      option.label = label;
      gKeySelect.appendChild(option);
    }

    gKeySelect.selectedIndex = 0;
  }
  keySelected(-1);
}

async function keySelected(selectedIndex) {
  if (selectedIndex == -1) {
    gKeyObjToEdit = gKeyObj;
  } else {
    gKeyObjToEdit = gKeyObj.subKeys[selectedIndex];
  }

  if (!gSimpleMode) {
    document.getElementById("usage-info").textContent = gKeyObj.getUsageText(
      gKeyObjToEdit.keyUseFor
    );
    document.getElementById("algo-info").textContent = gKeyObjToEdit.algoSym;
    document.getElementById("created-info").textContent = gKeyObjToEdit.created;
  }

  if (gKeyObjToEdit.expiryTime) {
    gExpiryPopup.selectedIndex = [...gExpiryPopup.children].findIndex(
      o => o.value >= gKeyObjToEdit.expiryTime
    );
  } else {
    gExpiryPopup.selectedIndex = 23; // 2 years
  }
  document.getElementById("radio-expire-yes").value = gExpiryPopup.value;
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
  const keyExpirationTime = expirySecs
    ? expirySecs - gKeyObjToEdit.keyCreated
    : 0;

  const pwCache = {
    passwords: [],
  };

  // We must always unlock the primary key, that's the one that will
  // be used to sign/allow the change.
  const gFingerprintsToUnlock = [gKeyObj.fpr];
  let gFingerprintsToEdit = [];

  if (gSimpleMode) {
    gFingerprintsToUnlock.push(gKeyObj.subKeys[0].fpr);
    gFingerprintsToEdit = [gKeyObj.fpr, gKeyObj.subKeys[0].fpr];
  } else {
    // When not editing the primary key, also unlock the subkey.
    if (gKeyObjToEdit.fpr != gKeyObj.fpr) {
      gFingerprintsToUnlock.push(gKeyObjToEdit.fpr);
    }
    gFingerprintsToEdit = [gKeyObjToEdit.fpr];
  }

  let unlockFailed = false;
  const keyTrackers = [];
  for (const fp of gFingerprintsToUnlock) {
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
    rv = RNP.changeExpirationDate(gFingerprintsToEdit, keyExpirationTime);
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
