/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test verifies that we don't display text attachments inline
 * when mail.inline_attachments is false.
 */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

const TEXT_ATTACHMENT = "inline text attachment";

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var msgGen = new MessageGenerator();
var inbox;
var messageInjection = new MessageInjection({ mode: "local" });
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

add_setup(function () {
  inbox = messageInjection.getInboxFolder();
});

add_task(async function test_message_attachments_no_inline() {
  Services.prefs.setBoolPref("mail.inline_attachments", false);
  Services.prefs.setBoolPref("mail.inline_attachments.text", true);
  await test_message_attachments({
    // text attachment
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "test.txt",
        format: "",
      },
    ],
  });
});

add_task(async function test_message_attachments_no_inline_text() {
  Services.prefs.setBoolPref("mail.inline_attachments", true);
  Services.prefs.setBoolPref("mail.inline_attachments.text", false);
  await PromiseTestUtils.promiseDelay(100);
  await test_message_attachments({
    // text attachment
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "test.txt",
        format: "",
      },
    ],
  });
});

async function test_message_attachments(info) {
  const synMsg = msgGen.makeMessage(info);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const msgURI = synSet.getMsgURI(0);
  const msgService = MailServices.messageServiceFromURI(msgURI);

  const streamListener = new PromiseTestUtils.PromiseStreamListener();

  msgService.streamMessage(
    msgURI,
    streamListener,
    msgWindow,
    null,
    true, // have them create the converter
    // additional uri payload, note that "header=" is prepended automatically
    "filter",
    false
  );

  const data = await streamListener.promise;
  // check that text attachment contents didn't end up inline.
  Assert.ok(!data.includes(TEXT_ATTACHMENT));
}
