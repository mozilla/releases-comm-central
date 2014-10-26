/* -*- Mode: Javascript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*-
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Enables/disables the labels and menulists depending whether
 * sending of return receipts is enabled.
 */
function enableDisableAllowedReceipts() {
  let enable = (document.getElementById("receiptSend").value === "true");
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
  let pref = aElement.getAttribute("preference");
  let prefIsLocked = pref ? document.getElementById(pref).locked : false;
  aElement.disabled = !aEnable || prefIsLocked;
}
