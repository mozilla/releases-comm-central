/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MsgKeySet } = ChromeUtils.import("resource:///modules/MsgKeySet.jsm");

/**
 * Test MsgKeySet works correctly.
 */
add_task(function testMsgKeySet() {
  // Init an empty set.
  let keySet = new MsgKeySet();
  ok(!keySet.has(1));

  // Add two ranges.
  keySet.addRange(90, 99);
  keySet.addRange(2, 19);

  // Test members.
  ok(!keySet.has(1));
  ok(keySet.has(2));
  ok(keySet.has(16));
  ok(!keySet.has(20));
  ok(keySet.has(99));

  // Init a set from a string.
  keySet = new MsgKeySet("102,199");
  ok(!keySet.has(22));
  ok(keySet.has(199));

  // Add two ranges.
  keySet.addRange(2, 19);
  keySet.addRange(12, 29);

  // Test members.
  ok(keySet.has(2));
  ok(keySet.has(22));
  ok(keySet.has(199));
});
