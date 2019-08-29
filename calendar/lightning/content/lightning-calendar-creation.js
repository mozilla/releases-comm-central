/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* exported onChangeIdentity */

/* import-globals-from ../../resources/content/calendarCreation.js */
/* import-globals-from lightning-utils.js */

var common_initCustomizePage = initCustomizePage;
var common_doCreateCalendar = doCreateCalendar;

initCustomizePage = function() {
  common_initCustomizePage();
  ltnInitMailIdentitiesRow();
  ltnNotifyOnIdentitySelection();
};

doCreateCalendar = function() {
  common_doCreateCalendar();
  ltnSaveMailIdentitySelection();
  return true;
};

function onChangeIdentity(aEvent) {
  ltnNotifyOnIdentitySelection();
}
