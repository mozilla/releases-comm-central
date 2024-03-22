/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../../toolkit/content/preferencesBindings.js */

window.addEventListener("load", () => {
  enableDisableAllowedReceipts();
});

Preferences.addAll([
  { id: "mail.receipt.request_return_receipt_on", type: "bool" },
  { id: "mail.incorporate.return_receipt", type: "int" },
  { id: "mail.mdn.report.enabled", type: "bool" },
  { id: "mail.mdn.report.not_in_to_cc", type: "int" },
  { id: "mail.mdn.report.outside_domain", type: "int" },
  { id: "mail.mdn.report.other", type: "int" },
]);

/**
 * Enables/disables the labels and menulists depending whether
 * sending of return receipts is enabled.
 */
function enableDisableAllowedReceipts() {
  const enable = document.getElementById("receiptSend").value === "true";
  enableElement(document.getElementById("notInToCcLabel"), enable);
  enableElement(document.getElementById("notInToCcPref"), enable);
  enableElement(document.getElementById("outsideDomainLabel"), enable);
  enableElement(document.getElementById("outsideDomainPref"), enable);
  enableElement(document.getElementById("otherCasesLabel"), enable);
  enableElement(document.getElementById("otherCasesPref"), enable);
}

/**
 * Set disabled state of aElement, unless its associated pref is locked.
 */
function enableElement(aElement, aEnable) {
  const pref = aElement.getAttribute("preference");
  const prefIsLocked = pref ? Preferences.get(pref).locked : false;
  aElement.disabled = !aEnable || prefIsLocked;
}
