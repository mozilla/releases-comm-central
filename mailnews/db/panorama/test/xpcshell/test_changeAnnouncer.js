/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var announcer, message;

add_setup(function () {
  installDB(null);
  const account = MailServices.accounts.createLocalMailAccount();
  const rootFolder = account.incomingServer.rootFolder;
  rootFolder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const folder = rootFolder.createLocalSubfolder("testChangeAnnouncer");
  const database = folder.msgDatabase;
  announcer = database.QueryInterface(Ci.nsIDBChangeAnnouncer);

  // Some tests require an actual message.
  const messageKey = addMessage({ folderId: folder.id });
  message = database.getMsgHdrForKey(messageKey);
});

/**
 * Test that header flag change notifications are correctly propagated.
 */
add_task(function testNotifyHdrChange() {
  let hdrChanged, oldFlags, newFlags;

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),

    onHdrFlagsChanged(aHdrChanged, aOldFlags, aNewFlags, _aInstigator) {
      hdrChanged = aHdrChanged;
      oldFlags = aOldFlags;
      newFlags = aNewFlags;
    },
  };

  announcer.addListener(listener);

  announcer.notifyHdrChangeAll(
    message,
    Ci.nsMsgMessageFlags.New,
    Ci.nsMsgMessageFlags.Read,
    null
  );
  Assert.equal(
    hdrChanged,
    message,
    "the header changed should be the one we supplied"
  );
  Assert.equal(
    oldFlags,
    Ci.nsMsgMessageFlags.New,
    "the old flags should be the ones we supplied"
  );
  Assert.equal(
    newFlags,
    Ci.nsMsgMessageFlags.Read,
    "the new flags should be the ones we supplied"
  );

  Assert.throws(
    () => announcer.notifyHdrChangeAll(null, 0, 0, null),
    /NS_ERROR_ILLEGAL_VALUE/,
    "a null header should be rejected"
  );

  announcer.removeListener(listener);
});

/**
 * Test that header addition notifications are correctly propagated.
 */
add_task(function testNotifyHdrAdded() {
  let hdrAdded, parentKey, flags;

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),

    onHdrAdded(aHdrAdded, aParentKey, aFlags, _aInstigator) {
      hdrAdded = aHdrAdded;
      parentKey = aParentKey;
      flags = aFlags;
    },
  };

  announcer.addListener(listener);

  announcer.notifyHdrAddedAll(message, 2, Ci.nsMsgMessageFlags.New, null);
  Assert.equal(
    hdrAdded,
    message,
    "the header added should be the one we supplied"
  );
  Assert.equal(parentKey, 2, "the parent key should be the one we supplied");
  Assert.equal(
    flags,
    Ci.nsMsgMessageFlags.New,
    "the flags should be the ones we supplied"
  );

  Assert.throws(
    () => announcer.notifyHdrAddedAll(null, 0, 0, null),
    /NS_ERROR_ILLEGAL_VALUE/,
    "a null header should be rejected"
  );

  announcer.removeListener(listener);
});

/**
 * Test that header deletion notifications are correctly propagated.
 */
add_task(function testNotifyHdrDeleted() {
  let hdrDeleted, parentKey, flags;

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),

    onHdrDeleted(aHdrDeleted, aParentKey, aFlags, _aInstigator) {
      hdrDeleted = aHdrDeleted;
      parentKey = aParentKey;
      flags = aFlags;
    },
  };

  announcer.addListener(listener);

  announcer.notifyHdrDeletedAll(message, 2, Ci.nsMsgMessageFlags.Read, null);
  Assert.equal(
    hdrDeleted,
    message,
    "the header deleted should be the one we supplied"
  );
  Assert.equal(parentKey, 2, "the parent key should be the one we supplied");
  Assert.equal(
    flags,
    Ci.nsMsgMessageFlags.Read,
    "the flags should be the ones we supplied"
  );

  Assert.throws(
    () => announcer.notifyHdrDeletedAll(null, 0, 0, null),
    /NS_ERROR_ILLEGAL_VALUE/,
    "a null header should be rejected"
  );

  announcer.removeListener(listener);
});

/**
 * Test that reparenting notifications are correctly propagated.
 */
add_task(function testNotifyParentChanged() {
  let keyChanged, oldParent, newParent;

  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsIDBChangeListener"]),

    onParentChanged(aKeyChanged, aOldParent, aNewParent, _aInstigator) {
      keyChanged = aKeyChanged;
      oldParent = aOldParent;
      newParent = aNewParent;
    },
  };

  announcer.addListener(listener);

  announcer.notifyParentChangedAll(1, 2, 3, null);
  Assert.equal(keyChanged, 1, "the key changed should be the one we supplied");
  Assert.equal(oldParent, 2, "the old parent should be the one we supplied");
  Assert.equal(newParent, 3, "the new parent should be the one we supplied");

  announcer.removeListener(listener);
});
