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
var EnigmailWkdLookup = ChromeUtils.import(
  "chrome://openpgp/content/modules/wkdLookup.jsm"
).EnigmailWkdLookup;
var { EnigmailKeyserverURIs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserverUris.jsm"
);
var EnigmailKeyServer = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyserver.jsm"
).EnigmailKeyServer;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);

var gListBox;
var gViewButton;
var gBundle;

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
      acceptanceText = gBundle.getString("KeyOwn");
    } else {
      if (!("acceptance" in keyObj)) {
        throw new Error(
          "expected getMultValidKeysForMultRecipients to set acceptance"
        );
      }
      let stringId;
      switch (keyObj.acceptance) {
        case "rejected":
          stringId = "KeyRejected";
          break;
        case "unverified":
          stringId = "KeyUnverified";
          break;
        case "verified":
          stringId = "KeyVerified";
          break;
        case "undecided":
          stringId = "KeyUndecided";
          break;
        default:
          throw new Error("unexpected acceptance value: " + keyObj.acceptance);
      }
      acceptanceText = gBundle.getString(stringId);
    }

    let status = document.createXULElement("label");
    status.setAttribute("value", acceptanceText);
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
  gBundle = document.getElementById("bundle_one_recip_info");

  gAddr = params.email;

  document.getElementById("intro").value = gBundle.getFormattedString("Intro", [
    gAddr,
  ]);

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
  let foundKeys = null;
  foundKeys = await EnigmailWkdLookup.downloadKey(gAddr);
  if (!foundKeys) {
    console.debug("searchKeysOnInternet no wkd data");
  } else {
    let keyList = EnigmailKey.getKeyListFromKeyBlock(
      foundKeys.keyData,
      {},
      false
    );
    let somethingWasImported = EnigmailKeyRing.importKeyDataWithConfirmation(
      window,
      keyList,
      foundKeys.keyData,
      true
    );
    if (somethingWasImported) {
      reload();
    }
    return;
  }

  let defKs = EnigmailKeyserverURIs.getDefaultKeyServer();
  if (!defKs) {
    return;
  }

  let vks = await EnigmailKeyServer.downloadNoImport(gAddr, defKs);
  if ("keyData" in vks) {
    let keyList = EnigmailKey.getKeyListFromKeyBlock(
      vks.keyData,
      {},
      false,
      true,
      false
    );
    let somethingWasImported = EnigmailKeyRing.importKeyDataWithConfirmation(
      window,
      keyList,
      vks.keyData,
      true
    );
    if (somethingWasImported) {
      reload();
    }
  } else {
    console.debug("searchKeysOnInternet no data in keys.openpgp.org");
  }
}
