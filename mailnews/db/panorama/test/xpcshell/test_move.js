/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests moving folders around within the data structure. This involves
 * updating the hierarchy and changing some values in the database, so we
 * check both are updated after each move.
 */

add_setup(function () {
  installDB("move.sqlite");
});

/**
 * Tests rearranging the folders without moving them to a new parent.
 */
add_task(function testMoveToSameParent() {
  const grandparent = database.getFolderById(1);
  const parent = database.getFolderById(3);
  const a = database.getFolderById(4);
  const b = database.getFolderById(7);
  const c = database.getFolderById(9);
  const d = database.getFolderById(10);

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
    () => database.moveFolderWithin(grandparent, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder within a different folder should be prevented"
  );
  Assert.throws(
    () => database.moveFolderWithin(parent, a, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of itself should be prevented"
  );
  Assert.throws(
    () => database.moveFolderWithin(parent, a, parent),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of a folder with a different parent should be prevented"
  );

  // Start -> Middle.
  database.moveFolderWithin(parent, a, c);
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
  database.moveFolderWithin(parent, a, d);
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
  database.moveFolderWithin(parent, a);
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
  database.moveFolderWithin(parent, a, b);
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
  database.moveFolderWithin(parent, a);
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
  database.moveFolderWithin(parent, a, d);
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
  database.moveFolderWithin(parent, a, c);
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
  database.moveFolderWithin(parent, a, b);
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
  const grandparent = database.getFolderById(1);
  const left = database.getFolderById(2);
  const parent = database.getFolderById(3);
  const right = database.getFolderById(14);
  const a = database.getFolderById(4);
  const b = database.getFolderById(7);
  const c = database.getFolderById(9);
  const d = database.getFolderById(10);

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
    () => database.moveFolderTo(parent, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a child of itself should be prevented"
  );
  Assert.throws(
    () => database.moveFolderTo(a, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a descendant of itself should be prevented"
  );

  // Append A to new parent on left.
  database.moveFolderTo(left, a);
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
  database.moveFolderTo(right, d);
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
  database.moveFolderTo(left, c);
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
  database.moveFolderTo(right, b);
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
  database.moveFolderTo(grandparent, a);
  database.moveFolderTo(grandparent, b);
  database.moveFolderTo(grandparent, c);
  database.moveFolderTo(grandparent, d);
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
  database.moveFolderTo(parent, b);
  database.moveFolderTo(parent, a);
  database.moveFolderTo(parent, d);
  database.moveFolderTo(parent, c);
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
