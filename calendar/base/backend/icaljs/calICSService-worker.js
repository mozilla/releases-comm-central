/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * ChromeWorker for parseICSAsync method in calICSService.js
 */

/* eslint-env worker */
/* import-globals-from ../../modules/Ical.jsm */

var NS_OK = 0;
var NS_ERROR_FAILURE = 2147500037;

// eslint-disable-next-line no-unused-vars
importScripts("resource:///modules/calendar/Ical.jsm");

onmessage = function(event) {
  try {
    let comp = ICAL.parse(event.data);
    postMessage({ rc: NS_OK, data: comp });
  } catch (e) {
    postMessage({ rc: NS_ERROR_FAILURE, data: "Exception occurred: " + e });
  }
  close();
};
