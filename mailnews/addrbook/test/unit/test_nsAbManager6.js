/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/**
 * Tests getMailListFromName() and mailListNameExists() which relies on it.
 */
add_task(function testGetMailListFromName() {
  loadABFile("../../../data/abLists1", kPABData.fileName);

  for (const listName of ["TestList1", "TestList2", "TestList3"]) {
    Assert.ok(
      MailServices.ab.mailListNameExists(listName),
      `AddrBookManager has ${listName}`
    );

    const list = MailServices.ab.getMailListFromName(listName);
    Assert.ok(list, `"${listName}" is not null`);
    Assert.equal(
      list.dirName,
      listName,
      `"${listName}" dirName is "${listName}"`
    );
  }
});
