/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the hierarchical attributes and functions of folders.
 */

add_setup(function () {
  installDB("relations.sqlite");
});

add_task(function testRelations() {
  const grandparent = database.getFolderById(3);
  const parent = database.getFolderById(6);
  const child = database.getFolderById(4);
  const grandchild = database.getFolderById(1);
  const sibling = database.getFolderById(2);

  drawTree(grandparent);

  Assert.deepEqual(grandparent.ancestors, []);
  Assert.equal(grandparent.parent, null);
  Assert.ok(!grandparent.isDescendantOf(parent));
  Assert.ok(!grandparent.isDescendantOf(child));
  Assert.ok(!grandparent.isDescendantOf(grandchild));
  Assert.ok(!grandparent.isDescendantOf(sibling));

  Assert.ok(grandparent.isAncestorOf(parent));
  Assert.ok(grandparent.isAncestorOf(child));
  Assert.ok(grandparent.isAncestorOf(grandchild));
  Assert.ok(grandparent.isAncestorOf(sibling));
  Assert.deepEqual(grandparent.children, [parent]);
  Assert.deepEqual(grandparent.descendants, [
    parent,
    child,
    grandchild,
    sibling,
  ]);

  Assert.deepEqual(parent.ancestors, [grandparent]);
  Assert.equal(parent.parent, grandparent);
  Assert.ok(parent.isDescendantOf(grandparent));
  Assert.ok(!parent.isDescendantOf(child));
  Assert.ok(!parent.isDescendantOf(grandchild));
  Assert.ok(!parent.isDescendantOf(sibling));

  Assert.ok(!parent.isAncestorOf(grandparent));
  Assert.ok(parent.isAncestorOf(child));
  Assert.ok(parent.isAncestorOf(grandchild));
  Assert.ok(parent.isAncestorOf(sibling));
  Assert.deepEqual(parent.children, [child, sibling]);
  Assert.deepEqual(parent.descendants, [child, grandchild, sibling]);

  Assert.deepEqual(child.ancestors, [parent, grandparent]);
  Assert.equal(child.parent, parent);
  Assert.ok(!child.isAncestorOf(grandparent));
  Assert.ok(!child.isAncestorOf(parent));
  Assert.ok(child.isAncestorOf(grandchild));
  Assert.ok(!child.isAncestorOf(sibling));

  Assert.ok(child.isDescendantOf(grandparent));
  Assert.ok(child.isDescendantOf(parent));
  Assert.ok(!child.isDescendantOf(grandchild));
  Assert.ok(!child.isDescendantOf(sibling));
  Assert.deepEqual(child.children, [grandchild]);
  Assert.deepEqual(child.descendants, [grandchild]);

  Assert.deepEqual(grandchild.ancestors, [child, parent, grandparent]);
  Assert.equal(grandchild.parent, child);
  Assert.ok(grandchild.isDescendantOf(grandparent));
  Assert.ok(grandchild.isDescendantOf(parent));
  Assert.ok(grandchild.isDescendantOf(child));
  Assert.ok(!grandchild.isDescendantOf(sibling));

  Assert.ok(!grandchild.isAncestorOf(grandparent));
  Assert.ok(!grandchild.isAncestorOf(parent));
  Assert.ok(!grandchild.isAncestorOf(child));
  Assert.ok(!grandchild.isAncestorOf(sibling));
  Assert.deepEqual(grandchild.children, []);
  Assert.deepEqual(grandchild.descendants, []);

  Assert.deepEqual(sibling.ancestors, [parent, grandparent]);
  Assert.equal(sibling.parent, parent);
  Assert.ok(sibling.isDescendantOf(grandparent));
  Assert.ok(sibling.isDescendantOf(parent));
  Assert.ok(!sibling.isDescendantOf(child));
  Assert.ok(!sibling.isDescendantOf(grandchild));

  Assert.ok(!sibling.isAncestorOf(grandparent));
  Assert.ok(!sibling.isAncestorOf(parent));
  Assert.ok(!sibling.isAncestorOf(child));
  Assert.ok(!sibling.isAncestorOf(grandchild));
  Assert.deepEqual(sibling.children, []);
  Assert.deepEqual(sibling.descendants, []);
});
