/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { EnigmailFuncs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/funcs.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;
var { EnigmailWindows } = ChromeUtils.import(
  "chrome://openpgp/content/modules/windows.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var KeyLookupHelper = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyLookupHelper.jsm"
).KeyLookupHelper;

var gListBox;
var gViewButton;

var gAddr;
var gRowToKey = [];

async function setListEntries(keys = null) {
  let index = 0;

  if (!keys) {
    keys = await EnigmailKeyRing.getMultValidKeysForOneRecipient(gAddr);
  }

  for (let keyObj of keys) {
    let listitem = document.createXULElement("richlistitem");

    let keyId = document.createXULElement("label");
    keyId.setAttribute("value", "0x" + keyObj.keyId);
    keyId.setAttribute("crop", "end");
    keyId.setAttribute("style", "width: var(--keyWidth)");
    listitem.appendChild(keyId);

    let acceptanceText;
    if (keyObj.secretAvailable) {
      acceptanceText = "openpgp-key-own";
    } else {
      if (!("acceptance" in keyObj)) {
        throw new Error(
          "expected getMultValidKeysForMultRecipients to set acceptance"
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

    let status = document.createXULElement("label");
    document.l10n.setAttributes(status, acceptanceText);
    status.setAttribute("crop", "end");
    status.setAttribute("style", "width: var(--statusWidth)");
    listitem.appendChild(status);

    let issued = document.createXULElement("label");
    issued.setAttribute("value", keyObj.created);
    issued.setAttribute("crop", "end");
    issued.setAttribute("style", "width: var(--issuedWidth)");
    listitem.appendChild(issued);

    let expire = document.createXULElement("label");
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
  let params = window.arguments[0];
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

async function reload() {
  while (true) {
    let child = gListBox.firstChild;
    if (!child) {
      break;
    }
    gListBox.removeChild(child);
  }
  gRowToKey = [];
  setListEntries();
}

function onSelectionChange(event) {
  let haveSelection = gListBox.selectedItems.length;
  gViewButton.disabled = !haveSelection;
}

function viewSelectedKey() {
  if (gViewButton.disabled) {
    return;
  }
  EnigmailWindows.openKeyDetails(
    window,
    gRowToKey[gListBox.selectedIndex],
    false
  );
  reload();
}

async function discoverKey() {
  KeyLookupHelper.lookupAndImportByEmail(window, gAddr, true, reload);
}
