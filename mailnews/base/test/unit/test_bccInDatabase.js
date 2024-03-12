/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing of bcc in message summary file added in bug 481667
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

var hdr;

function run_test() {
  localAccountUtils.loadLocalMailAccount();

  var copyListener = {
    OnStartCopy() {},
    OnProgress(aProgress, aProgressMax) {},
    SetMessageKey(aKey) {
      hdr = localAccountUtils.inboxFolder.GetMessageHeader(aKey);
    },
    SetMessageId(aMessageId) {},
    OnStopCopy(aStatus) {
      continueTest();
    },
  };

  // Get a message into the local filestore.
  var draft = do_get_file("../../../data/draft1");
  do_test_pending();
  MailServices.copy.copyFileMessage(
    draft,
    localAccountUtils.inboxFolder,
    null,
    false,
    0,
    "",
    copyListener,
    null
  );
}

function continueTest() {
  // dump("\nbccList >" + hdr.bccList);
  // dump("\nccList >" + hdr.ccList);
  // dump("\n");
  Assert.ok(hdr.bccList.includes("Another Person"));
  Assert.ok(hdr.bccList.includes("<u1@example.com>"));
  Assert.ok(!hdr.bccList.includes("IDoNotExist"));
  hdr = null;
  do_test_finished();
}
