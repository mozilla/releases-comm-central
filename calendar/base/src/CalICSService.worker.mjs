/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Worker module used by CalICSService.parseICSAsync().
 */

// eslint-disable-next-line mozilla/reject-import-system-module-from-non-system
import ICAL from "resource:///modules/calendar/Ical.sys.mjs";

ICAL.design.strict = false;

self.onmessage = event => {
  postMessage(ICAL.parse(event.data));
  self.close();
};
