/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the tree of nsSubscribableServer, which backs the subscribe dialog.
 */

function createSubscribableServer() {
  return Cc["@mozilla.org/messenger/subscribableserver;1"].createInstance(
    Ci.nsISubscribableServer
  );
}

add_task(function test_childOrder() {
  const server = createSubscribableServer();
  for (const name of ["c.b", "a", "c.a", "b", "c", "b.z", "b.a"]) {
    server.addTo(name, false, true, false);
  }

  Assert.deepEqual(
    server.getChildURIs(""),
    ["a", "b", "c"],
    "top level children should be sorted"
  );
  Assert.deepEqual(
    server.getChildURIs("b"),
    ["b.a", "b.z"],
    "children of b should be sorted"
  );
  Assert.deepEqual(
    server.getChildURIs("c"),
    ["c.a", "c.b"],
    "children of c should be sorted"
  );
  Assert.deepEqual(server.getChildURIs("a"), [], "a should have no children");
  Assert.equal(
    server.getFirstChildURI(""),
    "a",
    "first child should be the first in sorted order"
  );
  Assert.equal(
    server.getFirstChildURI("c"),
    "c.a",
    "first child of c should be the first in sorted order"
  );
  Assert.ok(server.hasChildren("b"), "b should have children");
  Assert.ok(!server.hasChildren("b.a"), "b.a should have no children");
});

add_task(function test_subscribedState() {
  const server = createSubscribableServer();
  server.addTo("x.y", true, true, true);
  server.addTo("x.y", false, true, false);
  Assert.ok(
    server.isSubscribed("x.y"),
    "re-adding without aChangeIfExists should keep the state"
  );
  Assert.ok(!server.isSubscribable("x"), "x should not be subscribable");
  Assert.ok(server.isSubscribable("x.y"), "x.y should be subscribable");
  Assert.equal(server.getChildURIs("").length, 1, "x should not be duplicated");
});

/**
 * A server can return a huge flat list of groups. Building, reading and
 * freeing the tree must not be quadratic nor recurse along the siblings.
 */
add_task(function test_largeFlatList() {
  const count = 200000;
  const names = [];
  for (let i = count - 1; i >= 0; i--) {
    names.push(`g${String(i).padStart(8, "0")}`);
  }

  let server = createSubscribableServer();
  for (const name of names) {
    server.addTo(name, false, true, false);
  }

  const children = server.getChildURIs("");
  Assert.equal(children.length, count, "all groups should be listed");
  Assert.equal(children[0], names.at(-1), "first group should be sorted first");
  Assert.equal(children.at(-1), names[0], "last group should be sorted last");
  for (const child of children) {
    if (!server.isSubscribable(child)) {
      Assert.ok(false, `${child} should be subscribable`);
    }
  }

  server.startPopulating(null, false, false);
  Assert.deepEqual(
    server.getChildURIs(""),
    [],
    "repopulating should clear the tree"
  );

  for (const name of names) {
    server.addTo(name, false, true, false);
  }
  server = null;
  Cu.forceGC();
  Cu.forceCC();
});
