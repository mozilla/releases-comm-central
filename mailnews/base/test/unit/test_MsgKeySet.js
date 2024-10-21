/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MsgKeySet } = ChromeUtils.importESModule(
  "resource:///modules/MsgKeySet.sys.mjs"
);

/**
 * Test MsgKeySet.addRange works correctly.
 */
add_task(function testAddRange() {
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
  equal(keySet.toString(), "2-19,90-99");

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
  equal(keySet.toString(), "2-29,102,199");

  // Add overlapping ranges.
  keySet.addRange(20, 40);
  equal(keySet.toString(), "2-40,102,199");
  keySet.addRange(10, 30);
  equal(keySet.toString(), "2-40,102,199");
  keySet.addRange(1, 20);
  equal(keySet.toString(), "1-40,102,199");
  keySet.addRange(1, 150);
  equal(keySet.toString(), "1-150,199");
});

/**
 * Test MsgKeySet.add works correctly.
 */
add_task(function testAdd() {
  // Init an empty set.
  const keySet = new MsgKeySet();
  ok(!keySet.has(1));

  // Add three values.
  keySet.add(1);
  keySet.add(2);
  keySet.add(4);

  // Test members.
  ok(keySet.has(1));
  ok(keySet.has(2));
  ok(!keySet.has(3));
  ok(keySet.has(4));
  equal(keySet.toString(), "1-2,4");
});

/**
 * Test MsgKeySet.getLastMissingRange works correctly.
 */
add_task(function testGetLastMissingRange() {
  // Init a set.
  const keySet = new MsgKeySet("2-9,12-29");

  // Test `start` should be a value not already in keySet.
  let [start, end] = keySet.getLastMissingRange(2, 33);
  equal(start, 30);
  equal(end, 33);

  // Test `start` should be the lowest input value.
  [start, end] = keySet.getLastMissingRange(33, 33);
  equal(start, 33);
  equal(end, 33);

  // Test get missing old messages range works.
  [start, end] = keySet.getLastMissingRange(3, 23);
  equal(start, 10);
  equal(end, 11);
});
