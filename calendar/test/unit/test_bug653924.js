/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { XPCOMUtils } = ChromeUtils.importESModule("resource://gre/modules/XPCOMUtils.sys.mjs");

ChromeUtils.defineESModuleGetters(this, {
  CalEvent: "resource:///modules/CalEvent.sys.mjs",
  CalRelation: "resource:///modules/CalRelation.sys.mjs",
});

function run_test() {
  const evt = new CalEvent();
  const rel = new CalRelation("RELATED-TO:2424d594-0453-49a1-b842-6faee483ca79");
  evt.addRelation(rel);

  equal(1, evt.icalString.match(/RELATED-TO/g).length);
  evt.icalString = evt.icalString; // eslint-disable-line no-self-assign
  equal(1, evt.icalString.match(/RELATED-TO/g).length);
}
