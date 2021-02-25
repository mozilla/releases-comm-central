/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function createAddressBook() {
  Assert.ok(!MailServices.ab.getDirectoryFromUID("nonsense"));

  let pabFromURI = MailServices.ab.getDirectory(kPABData.URI);
  let pabFromId = MailServices.ab.getDirectoryFromId(kPABData.dirPrefID);
  let pabFromUID = MailServices.ab.getDirectoryFromUID(pabFromURI.UID);

  Assert.equal(pabFromId, pabFromURI);
  Assert.equal(pabFromUID, pabFromURI);

  let historyFromURI = MailServices.ab.getDirectory(kCABData.URI);
  let historyFromId = MailServices.ab.getDirectoryFromId(kCABData.dirPrefID);
  let historyFromUID = MailServices.ab.getDirectoryFromUID(historyFromURI.UID);

  Assert.equal(historyFromId, historyFromURI);
  Assert.equal(historyFromUID, historyFromURI);
  Assert.notEqual(historyFromUID, pabFromUID);

  let newPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    kPABData.dirType
  );
  let newFromId = MailServices.ab.getDirectoryFromId(newPrefId);

  let newFromURI = MailServices.ab.getDirectory(newFromId.URI);
  let newFromUID = MailServices.ab.getDirectoryFromUID(newFromId.UID);

  Assert.equal(newFromId, newFromURI);
  Assert.equal(newFromUID, newFromURI);
  Assert.notEqual(newFromUID, pabFromUID);
  Assert.notEqual(newFromUID, historyFromUID);

  await promiseDirectoryRemoved(newFromId.URI);

  Assert.ok(!MailServices.ab.getDirectoryFromUID(newFromId.UID));
});
