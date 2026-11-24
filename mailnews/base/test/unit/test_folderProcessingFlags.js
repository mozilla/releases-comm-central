/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests the flags that folders keep for messages being processed.
 */

"use strict";

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { localAccountUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/LocalAccountUtils.sys.mjs"
);

const { ClassifyJunk, FiltersDone, NotReportedClassified, TraitsDone } =
  Ci.nsMsgProcessingFlags;

// Keys on both sides of the sign bit, not in order.
const KEYS = [0x80000010, 7, 0xfffff000, 1, 0x7fffffff, 300, 0x80000000];

add_setup(function () {
  localAccountUtils.loadLocalMailAccount();
});

add_task(function testFlags() {
  const folder = localAccountUtils.inboxFolder;
  for (const key of KEYS) {
    Assert.equal(folder.getProcessingFlags(key), 0);
    folder.orProcessingFlags(key, FiltersDone | TraitsDone);
  }
  for (const key of KEYS) {
    Assert.equal(folder.getProcessingFlags(key), FiltersDone | TraitsDone);
  }
  // Not a member, though a neighbour of one.
  Assert.equal(folder.getProcessingFlags(8), 0);
  Assert.equal(folder.getProcessingFlags(0x80000007), 0);

  folder.orProcessingFlags(7, ClassifyJunk);
  folder.andProcessingFlags(7, ~FiltersDone);
  Assert.equal(folder.getProcessingFlags(7), ClassifyJunk | TraitsDone);
  Assert.equal(
    folder.getProcessingFlags(0x80000010),
    FiltersDone | TraitsDone,
    "flags of other messages should not change"
  );
  for (const key of KEYS) {
    folder.andProcessingFlags(key, 0);
    Assert.equal(folder.getProcessingFlags(key), 0);
  }
});

add_task(function testNotReportedClassified() {
  const folder = localAccountUtils.inboxFolder;
  const db = folder.msgDatabase;
  for (const key of KEYS) {
    db.addNewHdrToDB(db.createNewHdrWithSpecificMsgKey(key), false);
    folder.orProcessingFlags(key, NotReportedClassified);
  }

  const notified = [];
  const listener = {
    msgsClassified(msgs) {
      notified.push(msgs.map(m => m.messageKey));
    },
  };
  MailServices.mfn.addListener(listener, MailServices.mfn.msgsClassified);
  folder.callFilterPlugins(null);
  folder.callFilterPlugins(null);
  MailServices.mfn.removeListener(listener);

  Assert.deepEqual(
    notified,
    [KEYS.toSorted((a, b) => a - b)],
    "each message should be reported once, in the order of keys"
  );
});
