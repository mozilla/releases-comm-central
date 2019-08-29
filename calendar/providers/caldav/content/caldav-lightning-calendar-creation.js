/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from ../../../lightning/content/lightning-calendar-creation.js */
/* import-globals-from caldav-lightning-utils.js */

var ltn_initCustomizePage = initCustomizePage;
var ltn_doCreateCalendar = doCreateCalendar;
var ltn_onChangeIdentity = onChangeIdentity;

initCustomizePage = function() {
  ltn_initCustomizePage();
  caldavInitForceEmailScheduling();
};

doCreateCalendar = function() {
  ltn_doCreateCalendar();
  caldavSaveForceEmailScheduling();
  return true;
};

onChangeIdentity = function(aEvent) {
  ltn_onChangeIdentity();
  caldavUpdateForceEmailSchedulingControl();
};
