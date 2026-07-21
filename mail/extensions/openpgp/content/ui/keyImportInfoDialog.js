/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

ChromeUtils.defineESModuleGetters(this, {
  EnigmailKey: "chrome://openpgp/content/modules/key.sys.mjs",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.sys.mjs",
  EnigmailWindows: "chrome://openpgp/content/modules/windows.sys.mjs",
  UIFontSize: "resource:///modules/UIFontSize.sys.mjs",
});

window.addEventListener("load", onLoad);

async function onLoad() {
  UIFontSize.registerWindow(window);
  const keys = [];

  for (let keyId of window.arguments[0].keyList) {
    if (keyId.search(/^0x/) === 0) {
      keyId = keyId.substr(2).toUpperCase();
    }

    const keyObj = EnigmailKeyRing.getKeyById(keyId);
    if (!keyObj?.fpr) {
      continue;
    }

    keys.push(buildKeyGroupBox(keyObj));
  }

  // For some reason we didn't find any keys, so just close the dialog and show
  // an alert.
  if (!keys.length) {
    Services.prompt.alert(
      window,
      null,
      await document.l10n.formatValue("import-info-no-keys")
    );
    setTimeout(window.close);
    return;
  }

  const fragment = document.createDocumentFragment();
  for (const key of keys) {
    fragment.appendChild(key);
  }

  document.getElementById("keyInfo").appendChild(fragment);
  document.querySelector("dialog").getButton("accept").focus();
}

/**
 * Creates a group box for a given key object.
 *
 * @param {EnigmailKeyObj} keyObj
 * @returns {HTMLElement}
 */
function buildKeyGroupBox(keyObj) {
  const article = document.createElement("article");

  const header = document.createElement("h1");
  header.textContent = keyObj.userId;
  article.appendChild(header);

  const infoBox = document.createElement("div");
  infoBox.classList.add("info");

  const spanCreatedLabel = document.createElement("span");
  spanCreatedLabel.classList.add("label");
  document.l10n.setAttributes(spanCreatedLabel, "import-info-created");
  const spanCreatedValue = document.createElement("span");
  spanCreatedValue.textContent = keyObj.created;
  infoBox.appendChild(spanCreatedLabel);
  infoBox.appendChild(spanCreatedValue);

  const spanFingerprintLabel = document.createElement("span");
  spanFingerprintLabel.classList.add("label");
  document.l10n.setAttributes(spanFingerprintLabel, "import-info-fpr");
  const spanFingerprintValue = document.createElement("span");
  spanFingerprintValue.textContent = EnigmailKey.formatFpr(keyObj.fpr);
  infoBox.appendChild(spanFingerprintLabel);
  infoBox.appendChild(spanFingerprintValue);

  article.appendChild(infoBox);

  const link = document.createElement("a");
  link.href = "";
  document.l10n.setAttributes(link, "import-info-details");
  link.addEventListener(
    "click",
    () => {
      EnigmailWindows.openKeyDetails(window, keyObj.keyId, false);
    },
    true
  );
  article.appendChild(link);

  return article;
}
