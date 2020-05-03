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

var gListBox;
var gViewButton;
var gBundle;

var gEmailAddresses = [];
var gRowToEmail = [];
var gMapAddressToKeyObjs = null;

function addRecipients(toAddrList, recList) {
  for (var i = 0; i < recList.length; i++) {
    try {
      let entry = EnigmailFuncs.stripEmail(recList[i].replace(/[",]/g, ""));
      toAddrList.push(entry);
    } catch (ex) {
      console.debug(ex);
    }
  }
}

async function setListEntries() {
  gMapAddressToKeyObjs = await EnigmailKeyRing.getMultValidKeysForMultRecipients(
    gEmailAddresses
  );
  if (!gMapAddressToKeyObjs) {
    throw new Error("getMultValidKeysForMultRecipients failed");
  }

  for (let addr of gEmailAddresses) {
    let emailStatus = null;

    let foundKeys = gMapAddressToKeyObjs.get(addr);
    if (!foundKeys || !foundKeys.length) {
      emailStatus = "RecipMissing";
    } else {
      for (let keyObj of foundKeys) {
        if (
          keyObj.secretAvailable ||
          keyObj.acceptance == "verified" ||
          keyObj.acceptance == "unverified"
        ) {
          emailStatus = "RecipGood";
          break;
        }
      }
      if (!emailStatus) {
        emailStatus = "RecipNoneAccepted";
      }
    }

    let listitem = document.createXULElement("richlistitem");

    let emailItem = document.createXULElement("label");
    emailItem.setAttribute("value", addr);
    emailItem.setAttribute("crop", "end");
    emailItem.setAttribute("style", "width: var(--recipientWidth)");
    listitem.appendChild(emailItem);

    let status = document.createXULElement("label");
    status.setAttribute("value", gBundle.getString(emailStatus));
    status.setAttribute("crop", "end");
    status.setAttribute("style", "width: var(--statusWidth)");
    listitem.appendChild(status);

    gListBox.appendChild(listitem);

    gRowToEmail.push(addr);
  }
}

async function onLoad() {
  let params = window.arguments[0];
  if (!params) {
    return;
  }

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("detailsButton");
  gBundle = document.getElementById("bundle_openpgp_comp_info");

  var arrLen = {};
  var recList;

  if (params.compFields.to) {
    recList = params.compFields.splitRecipients(
      params.compFields.to,
      true,
      arrLen
    );
    addRecipients(gEmailAddresses, recList);
  }
  if (params.compFields.cc) {
    recList = params.compFields.splitRecipients(
      params.compFields.cc,
      true,
      arrLen
    );
    addRecipients(gEmailAddresses, recList);
  }
  if (params.compFields.bcc) {
    recList = params.compFields.splitRecipients(
      params.compFields.bcc,
      true,
      arrLen
    );
    addRecipients(gEmailAddresses, recList);
  }

  await setListEntries();
}

async function reload() {
  while (true) {
    let child = gListBox.firstChild;
    if (!child) {
      break;
    }
    gListBox.removeChild(child);
  }
  gRowToEmail = [];
  setListEntries();
}

function onSelectionChange(event) {
  gViewButton.disabled = !gListBox.selectedItems.length;
}

function viewSelectedEmail() {
  if (gViewButton.disabled) {
    return;
  }
  let email = gRowToEmail[gListBox.selectedIndex];
  window.openDialog(
    "chrome://openpgp/content/ui/oneRecipientStatus.xhtml",
    "",
    "chrome,modal,resizable,centerscreen",
    {
      email,
      keys: gMapAddressToKeyObjs.get(email),
    }
  );
  reload();
}
