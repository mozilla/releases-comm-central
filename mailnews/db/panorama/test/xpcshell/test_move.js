/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests moving folders around within the data structure. This involves
 * updating the hierarchy and changing some values in the database, so we
 * check both are updated after each move.
 */

add_setup(async function () {
  await installDB("move.sqlite");
});

/**
 * Tests rearranging the folders without moving them to a new parent.
 */
add_task(function testMoveToSameParent() {
  const grandparent = folders.getFolderById(1);
  const parent = folders.getFolderById(3);
  const a = folders.getFolderById(4);
  const b = folders.getFolderById(7);
  const c = folders.getFolderById(9);
  const d = folders.getFolderById(10);

  drawTree(parent);

  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, 3, null],
    [b, 3, null],
    [c, 3, null],
    [d, 3, null],
  ]);

  Assert.throws(
    () => folders.moveFolderWithin(grandparent, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder within a different folder should be prevented"
  );
  Assert.throws(
    () => folders.moveFolderWithin(parent, a, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of itself should be prevented"
  );
  Assert.throws(
    () => folders.moveFolderWithin(parent, a, parent),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of a folder with a different parent should be prevented"
  );

  // Start -> Middle.
  folders.moveFolderWithin(parent, a, c);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, a, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [a, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Middle -> Middle.
  folders.moveFolderWithin(parent, a, d);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, c, a, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [c, parent.id, 2],
    [a, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Middle -> End.
  folders.moveFolderWithin(parent, a);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, c, d, a]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [c, parent.id, 2],
    [d, parent.id, 3],
    [a, parent.id, 4],
  ]);

  // Start <- End.
  folders.moveFolderWithin(parent, a, b);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, parent.id, 1],
    [b, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Start -> End.
  folders.moveFolderWithin(parent, a);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, c, d, a]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [c, parent.id, 2],
    [d, parent.id, 3],
    [a, parent.id, 4],
  ]);

  // Middle <- End.
  folders.moveFolderWithin(parent, a, d);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, c, a, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [c, parent.id, 2],
    [a, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Middle <- Middle.
  folders.moveFolderWithin(parent, a, c);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [b, a, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent.id, 1],
    [a, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Start <- Middle.
  folders.moveFolderWithin(parent, a, b);
  Assert.equal(a.parent, parent);
  Assert.deepEqual(parent.children, [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, parent.id, 1],
    [b, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);
});

/**
 * Tests moving folders to a new parent.
 */
add_task(function testMoveToNewParent() {
  const grandparent = folders.getFolderById(1);
  const left = folders.getFolderById(2);
  const parent = folders.getFolderById(3);
  const right = folders.getFolderById(14);
  const a = folders.getFolderById(4);
  const b = folders.getFolderById(7);
  const c = folders.getFolderById(9);
  const d = folders.getFolderById(10);

  drawTree(grandparent);
  checkOrdinals([
    [left, grandparent.id, null],
    [parent, grandparent.id, null],
    [a, parent.id, 1],
    [b, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);

  Assert.throws(
    () => folders.moveFolderTo(parent, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a child of itself should be prevented"
  );
  Assert.throws(
    () => folders.moveFolderTo(a, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a descendant of itself should be prevented"
  );

  // Append A to new parent on left.
  folders.moveFolderTo(left, a);
  drawTree(grandparent);
  Assert.equal(a.parent, left);
  Assert.deepEqual(left.children, [a]);
  Assert.deepEqual(parent.children, [b, c, d]);
  checkOrdinals([
    [left, grandparent.id, null],
    [a, left.id, null],
    [parent, grandparent.id, null],
    // No need to change the existing ordinals on remaining children,
    // the order remains the same.
    [b, parent.id, 2],
    [c, parent.id, 3],
    [d, parent.id, 4],
  ]);

  // Append D to new parent on right.
  folders.moveFolderTo(right, d);
  drawTree(grandparent);
  Assert.equal(d.parent, right);
  Assert.deepEqual(parent.children, [b, c]);
  Assert.deepEqual(right.children, [d]);
  checkOrdinals([
    [parent, grandparent.id, null],
    [b, parent.id, 2],
    [c, parent.id, 3],
    [right, grandparent.id, null],
    [d, right.id, null],
  ]);

  // Append C to new parent on left.
  folders.moveFolderTo(left, c);
  drawTree(grandparent);
  Assert.equal(c.parent, left);
  Assert.deepEqual(left.children, [a, c]);
  Assert.deepEqual(parent.children, [b]);
  checkOrdinals([
    [left, grandparent.id, null],
    [a, left.id, null],
    [c, left.id, null],
    [parent, grandparent.id, null],
    [b, parent.id, 2],
  ]);

  // Append B to new parent on right. B and D have no ordinals (even if they
  // existed before, moving nullified them) and B is ahead of D alphabetically.
  folders.moveFolderTo(right, b);
  drawTree(grandparent);
  Assert.equal(b.parent, right);
  Assert.deepEqual(parent.children, []);
  Assert.deepEqual(right.children, [b, d]);
  checkOrdinals([
    [parent, grandparent.id, null],
    [right, grandparent.id, null],
    [b, right.id, null],
    [d, right.id, null],
  ]);

  // At this point I think we can trust each individual move without checking,
  // so now we'll do several moves at once.

  // Move to become siblings of the current parent.
  folders.moveFolderTo(grandparent, a);
  folders.moveFolderTo(grandparent, b);
  folders.moveFolderTo(grandparent, c);
  folders.moveFolderTo(grandparent, d);
  drawTree(grandparent);
  Assert.equal(a.parent, grandparent);
  Assert.equal(b.parent, grandparent);
  Assert.equal(c.parent, grandparent);
  Assert.equal(d.parent, grandparent);
  // None of these have an ordinal, so we go to alphabetical order.
  Assert.deepEqual(grandparent.children, [a, b, c, d, left, parent, right]);
  Assert.deepEqual(left.children, []);
  Assert.deepEqual(parent.children, []);
  Assert.deepEqual(right.children, []);
  checkOrdinals([
    [grandparent, 0, null],
    [left, grandparent.id, null],
    [parent, grandparent.id, null],
    [right, grandparent.id, null],
    [a, grandparent.id, null],
    [b, grandparent.id, null],
    [c, grandparent.id, null],
    [d, grandparent.id, null],
  ]);

  // Move back to original positions.
  folders.moveFolderTo(parent, b);
  folders.moveFolderTo(parent, a);
  folders.moveFolderTo(parent, d);
  folders.moveFolderTo(parent, c);
  drawTree(grandparent);
  Assert.equal(a.parent, parent);
  Assert.equal(b.parent, parent);
  Assert.equal(c.parent, parent);
  Assert.equal(d.parent, parent);
  Assert.deepEqual(grandparent.children, [left, parent, right]);
  Assert.deepEqual(parent.children, [a, b, c, d]);
  checkOrdinals([
    [grandparent, 0, null],
    [left, grandparent.id, null],
    [parent, grandparent.id, null],
    [a, parent.id, null],
    [b, parent.id, null],
    [c, parent.id, null],
    [d, parent.id, null],
    [right, grandparent.id, null],
  ]);
});

/**
 * Tests moving folders between trees. This should not be allowed.
 */
add_task(function testMoveToNewRoot() {
  const grandparent = folders.getFolderById(1);
  const parent = folders.getFolderById(3);
  const otherRoot = folders.getFolderById(15);
  const otherChild = folders.getFolderById(16);

  Assert.throws(
    () => folders.moveFolderTo(grandparent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(parent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(grandparent, otherChild),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(parent, otherChild),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(otherRoot, grandparent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(otherChild, grandparent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(otherRoot, parent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(otherChild, parent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folders.moveFolderTo(grandparent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "root folders should be prevented from moving"
  );
});
