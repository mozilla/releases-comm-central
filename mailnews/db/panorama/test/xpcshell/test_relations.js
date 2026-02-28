/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the hierarchical attributes and functions of folders.
 */

add_setup(async function () {
  await installDBFromFile("db/relations.sql");
});

const grandparent = 3;
const parent = 6;
const child = 4;
const grandchild = 1;
const sibling = 2;

const otherRoot = 5;
const otherChild = 7;

add_task(function testRelations() {
  drawTree(grandparent);

  const expectedRelations = [
    {
      folderId: grandparent,
      rootId: grandparent, // Root folders are their own root.
      parentId: 0, // Root folders have no parent.
      childIds: [parent],
      descendantIds: [parent, child, grandchild, sibling],
      ancestorIds: [],
    },
    {
      folderId: parent,
      rootId: grandparent,
      parentId: grandparent,
      childIds: [child, sibling, parent],
      descendantIds: [child, grandchild, sibling],
      ancestorIds: [grandparent],
    },
    {
      folderId: child,
      rootId: grandparent,
      parentId: parent,
      childIds: [grandchild],
      descendantIds: [grandchild],
      ancestorIds: [parent, grandparent],
    },
    {
      folderId: grandchild,
      rootId: grandparent,
      parentId: child,
      childIds: [],
      descendantIds: [],
      ancestorIds: [child, parent, grandparent],
    },
    {
      folderId: sibling,
      rootId: grandparent,
      parentId: parent,
      childIds: [],
      descendantIds: [],
      ancestorIds: [parent, grandparent],
    },
    {
      folderId: otherRoot,
      rootId: otherRoot,
      parentId: 0,
      childIds: [otherChild],
      descendantIds: [otherChild],
      ancestorIds: [],
    },
    {
      folderId: otherChild,
      rootId: otherRoot,
      parentId: otherRoot,
      childIds: [],
      descendantIds: [],
      ancestorIds: [otherRoot],
    },
  ];

  for (const expect of expectedRelations) {
    const id = expect.folderId;
    Assert.equal(folderDB.getFolderRoot(id), expect.rootId);
    Assert.equal(folderDB.getFolderParent(id), expect.parentId);

    Assert.deepEqual(folderDB.getFolderAncestors(id), expect.ancestorIds);
    for (const ancestorId of expect.ancestorIds) {
      // Ancestors and descendants should be mutually exclusive.
      Assert.ok(!folderDB.getFolderIsAncestorOf(id, ancestorId));
      Assert.ok(folderDB.getFolderIsDescendantOf(id, ancestorId));
    }
    Assert.deepEqual(folderDB.getFolderDescendants(id), expect.descendantIds);
    for (const descendantId of expect.descendantIds) {
      Assert.ok(!folderDB.getFolderIsDescendantOf(id, descendantId));
      Assert.ok(folderDB.getFolderIsAncestorOf(id, descendantId));
    }
  }
});

add_task(function testChildFunctions() {
  Assert.equal(folderDB.getFolderChildNamed(parent, "child"), child);

  // Using composed unicode character.
  Assert.equal(folderDB.getFolderChildNamed(parent, "sibl\u00eeng"), sibling);

  // Temporarily disabled, bug 2019183.
  // Using decomposed unicode character.
  // Assert.equal(folderDB.getFolderChildNamed(parent, "sibli\u0302ng"), sibling);

  // getFolderChildNamed() returns 0 if no match.
  Assert.equal(folderDB.getFolderChildNamed(parent, "imaginary friend"), 0);
});

add_task(function testRootAccess() {
  // getFolderChildren() can access root folders.
  Assert.deepEqual(
    folderDB.getFolderChildren(0).toSorted(),
    [grandparent, otherRoot].toSorted()
  );
  // getFolderChildNamed() can access root folders.
  Assert.equal(folderDB.getFolderChildNamed(0, "grandparent"), grandparent);
  Assert.equal(folderDB.getFolderChildNamed(0, "child"), 0);
  // getFolderDescendants() can be called with folder 0 to list _all_ folders.
  Assert.deepEqual(
    folderDB.getFolderDescendants(0).toSorted(),
    [
      grandparent,
      parent,
      child,
      grandchild,
      sibling,
      otherRoot,
      otherChild,
    ].toSorted()
  );
  // getFolderAncestors() cannot be called with folder 0.
  Assert.throws(
    () => folderDB.getFolderAncestors(0),
    /NS_ERROR_/,
    "getFolderAncestors() can't be called with 0 folder"
  );
});
