/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Testing header folding in nsParseMailMessageState::ParseHeaders(),
 * see bug 1454257 and bug 1456001.
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
  var message = do_get_file("../../../data/badly-folded-headers.eml");
  do_test_pending();
  MailServices.copy.copyFileMessage(
    message,
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
  Assert.equal(hdr.author, "sender@example.com");
  Assert.equal(
    hdr.recipients,
    '"Recipient  with  spaces" <recipient@example.com>'
  );
  Assert.equal(
    hdr.subject,
    "Badly folded headers, one line with   space   between   To and From"
  );
  hdr = null;
  do_test_finished();
}
