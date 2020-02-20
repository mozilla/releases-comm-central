/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm")
  .EnigmailLog;
var EnigmailCore = ChromeUtils.import(
  "chrome://openpgp/content/modules/core.jsm"
).EnigmailCore;

if (!Enigmail) {
  var Enigmail = {};
}

var gPref = null;

function onInit() {
  EnigmailLog.DEBUG("am-enigprefs.js: onInit()\n");

  try {
    performInit();
  } catch (ex) {
    EnigmailLog.ERROR("am-enigprefs.js: onInit: error: " + ex.message + "\n");
  }
}

function performInit() {
  EnigmailLog.DEBUG("am-enigprefs.js: performInit()\n");

  Enigmail.edit.onInit();
}

function onAcceptEditor() {
  EnigmailLog.DEBUG("am-enigprefs.js: onAcceptEditor()\n");
  Enigmail.edit.onSave();
  saveChanges();
  return true;
}

function onPreInit(account, accountValues) {
  EnigmailLog.DEBUG("am-enigprefs.js: onPreInit()\n");

  if (!EnigmailCore.getService()) {
    return;
  }

  Enigmail.edit.identity = account.defaultIdentity;
  Enigmail.edit.account = account;
}

function onSave() {
  EnigmailLog.DEBUG("am-enigprefs.js: onSave()\n");

  Enigmail.edit.onSave();
  saveChanges();
  return true;
}

function onLockPreference() {
  // do nothing
}

// Does the work of disabling an element given the array which contains xul id/prefstring pairs.
// Also saves the id/locked state in an array so that other areas of the code can avoid
// stomping on the disabled state indiscriminately.
function disableIfLocked(prefstrArray) {
  // do nothing
}

function enigmailOnAcceptEditor() {
  EnigmailLog.DEBUG("am-enigprefs.js: enigmailOnAcceptEditor()\n");

  Enigmail.edit.onSave();

  return true; // allow to close dialog in all cases
}

function saveChanges() {}

document.addEventListener("dialogaccept", function(event) {
  Enigmail.edit.onAcceptEditor();
});
