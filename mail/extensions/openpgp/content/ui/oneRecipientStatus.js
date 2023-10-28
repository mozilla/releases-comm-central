/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var KeyLookupHelper = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyLookupHelper.jsm"
).KeyLookupHelper;
const { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);

var gListBox;
var gViewButton;

var gAddr;
var gRowToKey = [];

async function setListEntries(keys = null) {
  let index = 0;

  // Temporary code for debugging/development, should be removed when
  // a final patch for bug 1627956 lands.
  console.log(await EnigmailKeyRing.getEncryptionKeyMeta(gAddr));

  if (!keys) {
    keys = await EnigmailKeyRing.getMultValidKeysForOneRecipient(gAddr, true);
  }

  for (const keyObj of keys) {
    const listitem = document.createXULElement("richlistitem");

    const keyId = document.createXULElement("label");
    keyId.setAttribute("value", "0x" + keyObj.keyId);
    keyId.setAttribute("crop", "end");
    keyId.setAttribute("style", "width: var(--keyWidth)");
    listitem.appendChild(keyId);

    let acceptanceText;

    // Further above, we called getMultValidKeysForOneRecipient
    // and asked to ignore if a key is expired.
    // If the following check fails, the key must be expired.
    if (!EnigmailKeyRing.isValidForEncryption(keyObj)) {
      acceptanceText = "openpgp-key-expired";
    } else if (keyObj.secretAvailable) {
      if (await PgpSqliteDb2.isAcceptedAsPersonalKey(keyObj.fpr)) {
        acceptanceText = "openpgp-key-own";
      } else {
        acceptanceText = "openpgp-key-secret-not-personal";
      }
    } else {
      if (!("acceptance" in keyObj)) {
        throw new Error(
          "expected getMultValidKeysForOneRecipient to set acceptance"
        );
      }
      switch (keyObj.acceptance) {
        case "rejected":
          acceptanceText = "openpgp-key-rejected";
          break;
        case "unverified":
          acceptanceText = "openpgp-key-unverified";
          break;
        case "verified":
          acceptanceText = "openpgp-key-verified";
          break;
        case "undecided":
          acceptanceText = "openpgp-key-undecided";
          break;
        default:
          throw new Error("unexpected acceptance value: " + keyObj.acceptance);
      }
    }

    const status = document.createXULElement("label");
    document.l10n.setAttributes(status, acceptanceText);
    status.setAttribute("crop", "end");
    status.setAttribute("style", "width: var(--statusWidth)");
    listitem.appendChild(status);

    const issued = document.createXULElement("label");
    issued.setAttribute("value", keyObj.created);
    issued.setAttribute("crop", "end");
    issued.setAttribute("style", "width: var(--issuedWidth)");
    listitem.appendChild(issued);

    const expire = document.createXULElement("label");
    expire.setAttribute("value", keyObj.expiry);
    expire.setAttribute("crop", "end");
    expire.setAttribute("style", "width: var(--expireWidth)");
    listitem.appendChild(expire);

    gListBox.appendChild(listitem);

    gRowToKey[index] = keyObj.keyId;
    index++;
  }
}

async function onLoad() {
  const params = window.arguments[0];
  if (!params) {
    return;
  }

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("detailsButton");

  gAddr = params.email;

  document.l10n.setAttributes(
    document.getElementById("intro"),
    "openpgp-intro",
    { key: gAddr }
  );

  await setListEntries(params.keys);
}

async function reloadAndSelect(selIndex = -1) {
  while (true) {
    const child = gListBox.lastChild;
    // keep first child, which is the header
    if (child == gListBox.firstChild) {
      break;
    }
    gListBox.removeChild(child);
  }
  gRowToKey = [];
  await setListEntries();
  gListBox.selectedIndex = selIndex;
}

function onSelectionChange(event) {
  const haveSelection = gListBox.selectedItems.length;
  gViewButton.disabled = !haveSelection;
}

function viewSelectedKey() {
  const selIndex = gListBox.selectedIndex;
  if (gViewButton.disabled || selIndex == -1) {
    return;
  }
  EnigmailWindows.openKeyDetails(window, gRowToKey[selIndex], false);
  reloadAndSelect(selIndex);
}

async function discoverKey() {
  const keyIds = gRowToKey;
  const foundNewData = await KeyLookupHelper.fullOnlineDiscovery(
    "interactive-import",
    window,
    gAddr,
    keyIds
  );
  if (foundNewData) {
    reloadAndSelect();
  } else {
    const value = await document.l10n.formatValue("no-key-found2");
    EnigmailDialog.alert(window, value);
  }
}
