/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var gListBox;
var gViewButton;
var gBundle;

var gCerts = [];

window.addEventListener("DOMContentLoaded", onLoad);
window.addEventListener("resize", resizeColumns);

function onLoad() {
  let params = window.arguments[0];
  if (!params) {
    return;
  }

  gListBox = document.getElementById("infolist");
  gViewButton = document.getElementById("viewCertButton");
  gBundle = document.getElementById("bundle_smime_comp_info");

  let certdb = Cc["@mozilla.org/security/x509certdb;1"].getService(
    Ci.nsIX509CertDB
  );

  let missing = [];
  for (let i = 0; i < params.recipients.length; i++) {
    let email = params.recipients[i];
    let dbKey = params.compFields.composeSecure.getCertDBKeyForEmail(email);

    if (dbKey) {
      gCerts.push(certdb.findCertByDBKey(dbKey));
    } else {
      gCerts.push(null);
    }

    if (!gCerts[i]) {
      missing.push(params.recipients[i]);
    }
  }

  for (let i = 0; i < params.recipients.length; ++i) {
    let email = document.createXULElement("label");
    email.setAttribute("value", params.recipients[i]);
    email.setAttribute("crop", "end");
    email.setAttribute("style", "width: var(--recipientWidth)");

    let listitem = document.createXULElement("richlistitem");
    listitem.appendChild(email);

    let cert = gCerts[i];
    let statusItem = document.createXULElement("label");
    statusItem.setAttribute(
      "value",
      gBundle.getString(cert ? "StatusValid" : "StatusNotFound")
    );
    statusItem.setAttribute("style", "width: var(--statusWidth)");
    listitem.appendChild(statusItem);

    gListBox.appendChild(listitem);
  }
  resizeColumns();
}

function resizeColumns() {
  let list = document.getElementById("infolist");
  let cols = list.getElementsByTagName("treecol");
  list.style.setProperty(
    "--recipientWidth",
    cols[0].getBoundingClientRect().width + "px"
  );
  list.style.setProperty(
    "--statusWidth",
    cols[1].getBoundingClientRect().width + "px"
  );
  list.style.setProperty(
    "--issuedWidth",
    cols[2].getBoundingClientRect().width + "px"
  );
  list.style.setProperty(
    "--expireWidth",
    cols[3].getBoundingClientRect().width - 5 + "px"
  );
}

// --- borrowed from pippki.js ---
const PRErrorCodeSuccess = 0;

const certificateUsageEmailSigner = 0x0010;
const certificateUsageEmailRecipient = 0x0020;

// A map from the name of a certificate usage to the value of the usage.
const certificateUsages = {
  certificateUsageEmailRecipient,
};

function onSelectionChange(event) {
  gViewButton.disabled = !(
    gListBox.selectedItems.length == 1 && certForRow(gListBox.selectedIndex)
  );
}

function viewCertHelper(parent, cert) {
  let url = `about:certificate?cert=${encodeURIComponent(
    cert.getBase64DERString()
  )}`;
  let mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  mail3PaneWindow.switchToTabHavingURI(url, true, {});
  parent.close();
}

function certForRow(aRowIndex) {
  return gCerts[aRowIndex];
}

function viewSelectedCert() {
  if (!gViewButton.disabled) {
    viewCertHelper(window, certForRow(gListBox.selectedIndex));
  }
}
