/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * ChromeWorker for parseICSAsync method in CalICSService.jsm
 */

/* eslint-env worker */
/* import-globals-from ../modules/Ical.jsm */

// eslint-disable-next-line no-unused-vars
importScripts("resource:///modules/calendar/Ical.jsm");

ICAL.design.strict = false;

self.onmessage = function (event) {
  let comp = ICAL.parse(event.data);
  postMessage(comp);
  self.close();
};
