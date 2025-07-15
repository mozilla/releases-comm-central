/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests moving folders around within the data structure. This involves
 * updating the hierarchy and changing some values in the database, so we
 * check both are updated after each move.
 */

add_setup(async function () {
  await installDBFromFile("db/move.sql");
});

/**
 * Tests rearranging the folders without moving them to a new parent.
 */
add_task(function testMoveToSameParent() {
  const grandparent = 1;
  const parent = 3;
  const a = 4;
  const b = 7;
  const c = 9;
  const d = 10;

  drawTree(parent);

  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, 3, null],
    [b, 3, null],
    [c, 3, null],
    [d, 3, null],
  ]);

  Assert.throws(
    () => folderDB.moveFolderWithin(grandparent, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder within a different folder should be prevented"
  );
  Assert.throws(
    () => folderDB.moveFolderWithin(parent, a, a),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of itself should be prevented"
  );
  Assert.throws(
    () => folderDB.moveFolderWithin(parent, a, parent),
    /NS_ERROR_UNEXPECTED/,
    "moving a folder ahead of a folder with a different parent should be prevented"
  );

  // Start -> Middle.
  folderDB.moveFolderWithin(parent, a, c);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, a, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [a, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  // Middle -> Middle.
  folderDB.moveFolderWithin(parent, a, d);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c, a, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [c, parent, 2],
    [a, parent, 3],
    [d, parent, 4],
  ]);

  // Middle -> End.
  folderDB.moveFolderWithin(parent, a);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c, d, a]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [c, parent, 2],
    [d, parent, 3],
    [a, parent, 4],
  ]);

  // Start <- End.
  folderDB.moveFolderWithin(parent, a, b);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, parent, 1],
    [b, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  // Start -> End.
  folderDB.moveFolderWithin(parent, a);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c, d, a]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [c, parent, 2],
    [d, parent, 3],
    [a, parent, 4],
  ]);

  // Middle <- End.
  folderDB.moveFolderWithin(parent, a, d);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c, a, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [c, parent, 2],
    [a, parent, 3],
    [d, parent, 4],
  ]);

  // Middle <- Middle.
  folderDB.moveFolderWithin(parent, a, c);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, a, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [b, parent, 1],
    [a, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  // Start <- Middle.
  folderDB.moveFolderWithin(parent, a, b);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [a, b, c, d]);
  checkOrdinals([
    [parent, 1, null],
    [a, parent, 1],
    [b, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  folderDB.resetChildOrder(parent);
  checkOrdinals([
    [parent, 1, null],
    [a, parent, null],
    [b, parent, null],
    [c, parent, null],
    [d, parent, null],
  ]);
});

/**
 * Tests moving folders to a new parent.
 */
add_task(function testMoveToNewParent() {
  const grandparent = 1;
  const left = 2;
  const parent = 3;
  const right = 14;
  const a = 4;
  const b = 7;
  const c = 9;
  const d = 10;

  folderDB.moveFolderWithin(parent, b, a);
  folderDB.moveFolderWithin(parent, c, a);
  folderDB.moveFolderWithin(parent, d, a);
  folderDB.moveFolderWithin(parent, a, b);

  drawTree(grandparent);
  checkOrdinals([
    [left, grandparent, null],
    [parent, grandparent, null],
    [a, parent, 1],
    [b, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  Assert.throws(
    () => folderDB.moveFolderTo(parent, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a child of itself should be prevented"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(a, parent),
    /NS_ERROR_UNEXPECTED/,
    "inserted a child as a descendant of itself should be prevented"
  );

  // Append A to new parent on left.
  folderDB.moveFolderTo(left, a);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(a), left);
  Assert.deepEqual(folderDB.getFolderChildren(left), [a]);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c, d]);
  checkOrdinals([
    [left, grandparent, null],
    [a, left, null],
    [parent, grandparent, null],
    // No need to change the existing ordinals on remaining children,
    // the order remains the same.
    [b, parent, 2],
    [c, parent, 3],
    [d, parent, 4],
  ]);

  // Append D to new parent on right.
  folderDB.moveFolderTo(right, d);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(d), right);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b, c]);
  Assert.deepEqual(folderDB.getFolderChildren(right), [d]);
  checkOrdinals([
    [parent, grandparent, null],
    [b, parent, 2],
    [c, parent, 3],
    [right, grandparent, null],
    [d, right, null],
  ]);

  // Append C to new parent on left.
  folderDB.moveFolderTo(left, c);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(c), left);
  Assert.deepEqual(folderDB.getFolderChildren(left), [a, c]);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [b]);
  checkOrdinals([
    [left, grandparent, null],
    [a, left, null],
    [c, left, null],
    [parent, grandparent, null],
    [b, parent, 2],
  ]);

  // Append B to new parent on right. B and D have no ordinals (even if they
  // existed before, moving nullified them) and B is ahead of D alphabetically.
  folderDB.moveFolderTo(right, b);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(b), right);
  Assert.deepEqual(folderDB.getFolderChildren(parent), []);
  Assert.deepEqual(folderDB.getFolderChildren(right), [b, d]);
  checkOrdinals([
    [parent, grandparent, null],
    [right, grandparent, null],
    [b, right, null],
    [d, right, null],
  ]);

  // At this point I think we can trust each individual move without checking,
  // so now we'll do several moves at once.

  // Move to become siblings of the current parent.
  folderDB.moveFolderTo(grandparent, a);
  folderDB.moveFolderTo(grandparent, b);
  folderDB.moveFolderTo(grandparent, c);
  folderDB.moveFolderTo(grandparent, d);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(a), grandparent);
  Assert.equal(folderDB.getFolderParent(b), grandparent);
  Assert.equal(folderDB.getFolderParent(c), grandparent);
  Assert.equal(folderDB.getFolderParent(d), grandparent);
  // None of these have an ordinal, so we go to alphabetical order.
  Assert.deepEqual(folderDB.getFolderChildren(grandparent), [
    a,
    b,
    c,
    d,
    left,
    parent,
    right,
  ]);
  Assert.deepEqual(folderDB.getFolderChildren(left), []);
  Assert.deepEqual(folderDB.getFolderChildren(parent), []);
  Assert.deepEqual(folderDB.getFolderChildren(right), []);
  checkOrdinals([
    [grandparent, 0, null],
    [left, grandparent, null],
    [parent, grandparent, null],
    [right, grandparent, null],
    [a, grandparent, null],
    [b, grandparent, null],
    [c, grandparent, null],
    [d, grandparent, null],
  ]);

  // Move back to original positions.
  folderDB.moveFolderTo(parent, b);
  folderDB.moveFolderTo(parent, a);
  folderDB.moveFolderTo(parent, d);
  folderDB.moveFolderTo(parent, c);
  drawTree(grandparent);
  Assert.equal(folderDB.getFolderParent(a), parent);
  Assert.equal(folderDB.getFolderParent(b), parent);
  Assert.equal(folderDB.getFolderParent(c), parent);
  Assert.equal(folderDB.getFolderParent(d), parent);
  Assert.deepEqual(folderDB.getFolderChildren(grandparent), [
    left,
    parent,
    right,
  ]);
  Assert.deepEqual(folderDB.getFolderChildren(parent), [a, b, c, d]);
  checkOrdinals([
    [grandparent, 0, null],
    [left, grandparent, null],
    [parent, grandparent, null],
    [a, parent, null],
    [b, parent, null],
    [c, parent, null],
    [d, parent, null],
    [right, grandparent, null],
  ]);
});

/**
 * Tests moving folders between trees. This should not be allowed.
 */
add_task(function testMoveToNewRoot() {
  const grandparent = 1;
  const parent = 3;
  const otherRoot = 15;
  const otherChild = 16;

  Assert.throws(
    () => folderDB.moveFolderTo(grandparent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(parent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(grandparent, otherChild),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(parent, otherChild),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(otherRoot, grandparent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(otherChild, grandparent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(otherRoot, parent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(otherChild, parent),
    /NS_ERROR_UNEXPECTED/,
    "folder should be prevented from moving to another tree"
  );
  Assert.throws(
    () => folderDB.moveFolderTo(grandparent, otherRoot),
    /NS_ERROR_UNEXPECTED/,
    "root folders should be prevented from moving"
  );
});
