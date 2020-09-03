/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.import("resource://gre/modules/XPCOMUtils.jsm");

XPCOMUtils.defineLazyModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.jsm",
  CalRelation: "resource:///modules/CalRelation.jsm",
});

function run_test() {
  let evt = new CalEvent();
  let rel = new CalRelation();
  evt.addRelation(rel);

  equal(1, evt.icalString.match(/RELATED-TO/g).length);
  evt.icalString = evt.icalString; // eslint-disable-line no-self-assign
  equal(1, evt.icalString.match(/RELATED-TO/g).length);
}
