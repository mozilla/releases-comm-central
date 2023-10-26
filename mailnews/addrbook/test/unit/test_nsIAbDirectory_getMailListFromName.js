/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test suite for the getMailListFromName() function.
 */

"use strict";

/**
 * Tests the getMailListFromName function returns the correct nsIAbDirectory,
 * also tests the hasMailListWithName function as it uses the same code.
 */
add_task(function testGetMailListFromName() {
  loadABFile("../../../data/abLists1", kPABData.fileName);

  // Test all top level lists are returned.
  const root = MailServices.ab.getDirectory(kPABData.URI);
  for (const listName of ["TestList1", "TestList2", "TestList3"]) {
    Assert.ok(root.hasMailListWithName(listName), `parent has "${listName}"`);

    const list = root.getMailListFromName(listName);
    Assert.ok(list, `"${listName}" is not null`);
    Assert.equal(
      list.dirName,
      listName,
      `"${listName}" dirName is "${listName}"`
    );
  }

  Assert.ok(
    !root.hasMailListWithName("Non existent"),
    "hasMailListWithName() returns false for non-existent list name"
  );
  Assert.ok(
    !root.getMailListFromName("Non existent"),
    "getMailListFromName() returns null for non-existent list name"
  );
});
