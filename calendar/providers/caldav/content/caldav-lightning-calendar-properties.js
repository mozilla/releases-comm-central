/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../lightning/content/lightning-calendar-properties.js */
/* import-globals-from caldav-lightning-utils.js */

var ltn_onChangeIdentity = onChangeIdentity;

onLoad = function() {
  gCalendar = window.arguments[0].calendar; // eslint-disable-line no-global-assign
  ltnInitMailIdentitiesRow();
  caldavInitForceEmailScheduling();
  common_onLoad();
};

onAcceptDialog = function() {
  ltnSaveMailIdentitySelection();
  caldavSaveForceEmailScheduling();
  return common_onAcceptDialog();
};

onChangeIdentity = function(aEvent) {
  ltn_onChangeIdentity();
  caldavUpdateForceEmailSchedulingControl();
};
