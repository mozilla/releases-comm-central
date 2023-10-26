/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * This test deletes intermediate messages, then compacts, then adds more
 * messages, testing for duplicated keys in bug 1202105.
 */

/* import-globals-from ../../../test/resources/POP3pump.js */
load("../../../resources/POP3pump.js");
const { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);

add_task(async function runPump() {
  gPOP3Pump.files = [
    "../../../data/bugmail1",
    "../../../data/bugmail1",
    "../../../data/bugmail1",
    "../../../data/bugmail1",
    "../../../data/bugmail1",
  ];
  await gPOP3Pump.run();

  // get message headers for the inbox folder
  var hdrs = showMessages(localAccountUtils.inboxFolder);
  Assert.equal(hdrs.length, 5, "Check initial db count");

  // Deletes 2 middle messages.
  const deletes = [hdrs[1], hdrs[2]];

  // Note the listener won't work because this is a sync delete,
  // but it should!
  localAccountUtils.inboxFolder.deleteMessages(
    deletes,
    null, // in nsIMsgWindow msgWindow,
    true, // in boolean deleteStorage,
    true, // in boolean isMove,
    null, // in nsIMsgCopyServiceListener,
    false
  ); // in boolean allowUndo

  dump("Messages after delete\n");
  hdrs = showMessages(localAccountUtils.inboxFolder);
  Assert.equal(hdrs.length, 3, "Check db length after deleting two messages");

  // compact
  var listener = new PromiseTestUtils.PromiseUrlListener();
  localAccountUtils.inboxFolder.compact(listener, null);
  await listener.promise;

  dump("Messages after compact\n");
  hdrs = showMessages(localAccountUtils.inboxFolder);
  Assert.equal(hdrs.length, 3, "Check db length after compact");

  // Add some more messages. This fails in nsMsgDatabase::AddNewHdrToDB with
  // NS_ERROR("adding hdr that already exists") before bug 1202105.
  gPOP3Pump.files = ["../../../data/draft1"];
  await gPOP3Pump.run();

  dump("Messages after new message\n");
  hdrs = showMessages(localAccountUtils.inboxFolder);
  Assert.equal(hdrs.length, 4, "Check db length after adding one message");

  gPOP3Pump = null;
});

function showMessages(folder) {
  var hdrs = [];
  for (const hdr of folder.msgDatabase.enumerateMessages()) {
    hdrs.push(hdr);
    dump(
      "key " +
        (hdrs.length - 1) +
        " is " +
        hdrs[hdrs.length - 1].messageKey +
        "\n"
    );
  }
  return hdrs;
}
