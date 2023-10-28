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
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
const { OpenPGPAlias } = ChromeUtils.import(
  "chrome://openpgp/content/modules/OpenPGPAlias.jsm"
);
const { PgpSqliteDb2 } = ChromeUtils.import(
  "chrome://openpgp/content/modules/sqliteDb.jsm"
);

var gListBox;
var gViewButton;

var gEmailAddresses = [];
var gRowToEmail = [];

// One boolean entry per row. True means it is an alias row.
// This allows us to use different dialog behavior for alias entries.
var gAliasRows = [];

var gMapAddressToKeyObjs = null;

function addRecipients(toAddrList, recList) {
  for (var i = 0; i < recList.length; i++) {
    try {
      const entry = EnigmailFuncs.stripEmail(recList[i].replace(/[",]/g, ""));
      toAddrList.push(entry);
    } catch (ex) {
      console.debug(ex);
    }
  }
}

async function setListEntries() {
  gMapAddressToKeyObjs = new Map();

  for (let addr of gEmailAddresses) {
    addr = addr.toLowerCase();

    let statusStringID = null;
    let statusStringDirect = "";

    const aliasKeyList = EnigmailKeyRing.getAliasKeyList(addr);
    const isAlias = !!aliasKeyList;

    if (isAlias) {
      const aliasKeys = EnigmailKeyRing.getAliasKeys(aliasKeyList);
      if (!aliasKeys.length) {
        // failure, at least one alias key is unusable/unavailable
        statusStringDirect = await document.l10n.formatValue(
          "openpgp-compose-alias-status-error"
        );
      } else {
        statusStringDirect = await document.l10n.formatValue(
          "openpgp-compose-alias-status-direct",
          {
            count: aliasKeys.length,
          }
        );
      }
    } else {
      // We ask to include keys which are expired, because that's what
      // our sub dialog oneRecipientStatus needs. This is for
      // efficiency - because otherwise the sub dialog would have to
      // query all keys again.
      // The consequence is, we need to later call isValidForEncryption
      // for the keys we have obtained, to confirm they are really valid.
      const foundKeys = await EnigmailKeyRing.getMultValidKeysForOneRecipient(
        addr,
        true
      );
      if (!foundKeys || !foundKeys.length) {
        statusStringID = "openpgp-recip-missing";
      } else {
        gMapAddressToKeyObjs.set(addr, foundKeys);
        for (const keyObj of foundKeys) {
          let goodPersonal = false;
          if (keyObj.secretAvailable) {
            goodPersonal = await PgpSqliteDb2.isAcceptedAsPersonalKey(
              keyObj.fpr
            );
          }
          if (
            goodPersonal ||
            (EnigmailKeyRing.isValidForEncryption(keyObj) &&
              (keyObj.acceptance == "verified" ||
                keyObj.acceptance == "unverified"))
          ) {
            statusStringID = "openpgp-recip-good";
            break;
          }
        }
        if (!statusStringID) {
          statusStringID = "openpgp-recip-none-accepted";
        }
      }
    }

    const listitem = document.createXULElement("richlistitem");

    const emailItem = document.createXULElement("label");
    emailItem.setAttribute("value", addr);
    emailItem.setAttribute("crop", "end");
    emailItem.setAttribute("style", "width: var(--recipientWidth)");
    listitem.appendChild(emailItem);

    const status = document.createXULElement("label");

    if (statusStringID) {
      document.l10n.setAttributes(status, statusStringID);
    } else {
      status.setAttribute("value", statusStringDirect);
    }

    status.setAttribute("crop", "end");
    status.setAttribute("style", "width: var(--statusWidth)");
    listitem.appendChild(status);

    gListBox.appendChild(listitem);

    gRowToEmail.push(addr);
    gAliasRows.push(isAlias);
  }
}

async function onLoad() {
  const params = window.arguments[0];
  if (!params) {
    return;
  }

  try {
    await OpenPGPAlias.load();
  } catch (ex) {
    console.log("failed to load OpenPGP alias file: " + ex);
  }

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("detailsButton");

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

async function reloadAndReselect(selIndex = -1) {
  while (true) {
    const child = gListBox.lastChild;
    // keep first child, which is the header
    if (child == gListBox.firstChild) {
      break;
    }
    gListBox.removeChild(child);
  }
  gRowToEmail = [];
  await setListEntries();
  gListBox.selectedIndex = selIndex;
}

function onSelectionChange(event) {
  // We don't offer detail management/discovery for email addresses
  // that match an alias rule.
  gViewButton.disabled =
    !gListBox.selectedItems.length || gAliasRows[gListBox.selectedIndex];
}

function viewSelectedEmail() {
  const selIndex = gListBox.selectedIndex;
  if (gViewButton.disabled || selIndex == -1) {
    return;
  }
  const email = gRowToEmail[selIndex];
  window.openDialog(
    "chrome://openpgp/content/ui/oneRecipientStatus.xhtml",
    "",
    "chrome,modal,resizable,centerscreen",
    {
      email,
      keys: gMapAddressToKeyObjs.get(email),
    }
  );
  reloadAndReselect(selIndex);
}
