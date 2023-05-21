/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

const { NormalizedMap } = ChromeUtils.importESModule(
  "resource:///modules/NormalizedMap.sys.mjs"
);

function test_setter_getter() {
  let m = new NormalizedMap(aStr => aStr.toLowerCase());
  m.set("foo", "bar");
  m.set("BaZ", "blah");
  Assert.equal(m.has("FOO"), true);
  Assert.equal(m.has("BaZ"), true);
  Assert.equal(m.get("FOO"), "bar");

  let keys = Array.from(m.keys());
  Assert.equal(keys[0], "foo");
  Assert.equal(keys[1], "baz");

  let values = Array.from(m.values());
  Assert.equal(values[0], "bar");
  Assert.equal(values[1], "blah");

  Assert.equal(m.size, 2);

  run_next_test();
}

function test_constructor() {
  let k = new NormalizedMap(
    aStr => aStr.toLowerCase(),
    [
      ["A", 2],
      ["b", 3],
    ]
  );
  Assert.equal(k.get("b"), 3);
  Assert.equal(k.get("a"), 2);
  Assert.equal(k.get("B"), 3);
  Assert.equal(k.get("A"), 2);

  run_next_test();
}

function test_iterator() {
  let k = new NormalizedMap(aStr => aStr.toLowerCase());
  k.set("FoO", "bar");

  for (let [key, value] of k) {
    Assert.equal(key, "foo");
    Assert.equal(value, "bar");
  }

  run_next_test();
}

function test_delete() {
  let m = new NormalizedMap(aStr => aStr.toLowerCase());
  m.set("foo", "bar");
  m.set("BaZ", "blah");

  Assert.equal(m.delete("blah"), false);

  Assert.equal(m.delete("FOO"), true);
  Assert.equal(m.size, 1);

  Assert.equal(m.delete("baz"), true);
  Assert.equal(m.size, 0);

  run_next_test();
}

function run_test() {
  add_test(test_setter_getter);
  add_test(test_constructor);
  add_test(test_iterator);
  add_test(test_delete);

  run_next_test();
}
