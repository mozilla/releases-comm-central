/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

Components.utils.import("resource:///modules/NormalizedMap.jsm");

function test_setter_getter() {
  let m = new NormalizedMap(aStr => aStr.toLowerCase());
  m.set("foo", "bar");
  m.set("BaZ", "blah");
  do_check_eq(m.has("FOO"), true);
  do_check_eq(m.has("BaZ"), true);
  do_check_eq(m.get("FOO"), "bar");

  let keys = [v for (v of m.keys())];
  do_check_eq(keys[0], "foo");
  do_check_eq(keys[1], "baz");

  let values = [v for (v of m.values())];
  do_check_eq(values[0], "bar");
  do_check_eq(values[1], "blah");

  do_check_eq(m.size, 2);

  run_next_test();
}

function test_constructor() {
  let k = new NormalizedMap(aStr => aStr.toLowerCase(), [["A", 2], ["b", 3]]);
  do_check_eq(k.get("b"), 3);
  do_check_eq(k.get("a"), 2);
  do_check_eq(k.get("B"), 3);
  do_check_eq(k.get("A"), 2);

  run_next_test();
}

function test_iterator() {
  let k = new NormalizedMap(aStr => aStr.toLowerCase());
  k.set("FoO", "bar");

  for (let [key, value] of k) {
    do_check_eq(key, "foo");
    do_check_eq(value, "bar");
  }

  run_next_test();
}

function test_delete() {
  let m = new NormalizedMap(aStr => aStr.toLowerCase());
  m.set("foo", "bar");
  m.set("BaZ", "blah");

  do_check_eq(m.delete("blah"), false);

  do_check_eq(m.delete("FOO"), true);
  do_check_eq(m.size, 1);

  do_check_eq(m.delete("baz"), true);
  do_check_eq(m.size, 0);

  run_next_test();
}

function run_test() {
  add_test(test_setter_getter);
  add_test(test_constructor);
  add_test(test_iterator);
  add_test(test_delete);

  run_next_test();
}
