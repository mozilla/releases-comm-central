/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

add_task(async function createAddressBook() {
  Assert.ok(!MailServices.ab.getDirectoryFromUID("nonsense"));

  const pabFromURI = MailServices.ab.getDirectory(kPABData.URI);
  const pabFromId = MailServices.ab.getDirectoryFromId(kPABData.dirPrefID);
  const pabFromUID = MailServices.ab.getDirectoryFromUID(pabFromURI.UID);

  Assert.equal(pabFromId, pabFromURI);
  Assert.equal(pabFromUID, pabFromURI);

  const historyFromURI = MailServices.ab.getDirectory(kCABData.URI);
  const historyFromId = MailServices.ab.getDirectoryFromId(kCABData.dirPrefID);
  const historyFromUID = MailServices.ab.getDirectoryFromUID(
    historyFromURI.UID
  );

  Assert.equal(historyFromId, historyFromURI);
  Assert.equal(historyFromUID, historyFromURI);
  Assert.notEqual(historyFromUID, pabFromUID);

  const newPrefId = MailServices.ab.newAddressBook(
    "new book",
    "",
    kPABData.dirType
  );
  const newFromId = MailServices.ab.getDirectoryFromId(newPrefId);

  const newFromURI = MailServices.ab.getDirectory(newFromId.URI);
  const newFromUID = MailServices.ab.getDirectoryFromUID(newFromId.UID);

  Assert.equal(newFromId, newFromURI);
  Assert.equal(newFromUID, newFromURI);
  Assert.notEqual(newFromUID, pabFromUID);
  Assert.notEqual(newFromUID, historyFromUID);

  await promiseDirectoryRemoved(newFromId.URI);

  Assert.ok(!MailServices.ab.getDirectoryFromUID(newFromId.UID));
});
