/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onChangeIdentity */

/* import-globals-from ../../base/content/dialogs/calendar-properties-dialog.js */
/* import-globals-from lightning-utils.js */

var common_onLoad = onLoad;
var common_onAcceptDialog = onAcceptDialog;

onLoad = function() {
  gCalendar = window.arguments[0].calendar; // eslint-disable-line no-global-assign
  ltnInitMailIdentitiesRow();
  ltnNotifyOnIdentitySelection();
  common_onLoad();
};

onAcceptDialog = function() {
  ltnSaveMailIdentitySelection();
  return common_onAcceptDialog();
};

function onChangeIdentity(aEvent) {
  ltnNotifyOnIdentitySelection();
  sizeToContent();
}
