/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test verifies that we generate proper attachment filenames.
 */

var {
  MessageGenerator,
  SyntheticMessageSet,
  SyntheticPartMultiMixed,
  SyntheticPartLeaf,
} = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

// Create a message generator
var msgGen = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

// The attachments need to have some content or the stream converter won't
// display them inline. In the case of the email attachment it must have
// trailing CRLFs or it will fail to parse.
const TEXT_ATTACHMENT = "inline text attachment";
const EMAIL_ATTACHMENT = "Subject: fake email\r\n\r\n";
const HTML_ATTACHMENT = "<html><body></body></html>";

add_setup(function () {
  Services.prefs.setBoolPref("mail.inline_attachments.text", true);
});

// Unnamed email attachment.
add_task(async function test_unnamed_email_attachment() {
  await test_message_attachments({
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "test.txt",
        format: "",
      },
      {
        body: EMAIL_ATTACHMENT,
        expectedFilename: "ForwardedMessage.eml",
        contentType: "message/rfc822",
      },
    ],
  });
});

// Named email attachment.
add_task(async function test_named_email_attachment() {
  await test_message_attachments({
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "test.txt",
        format: "",
      },
      {
        body: EMAIL_ATTACHMENT,
        filename: "Attached Message",
        contentType: "message/rfc822",
      },
    ],
  });
});

// Escaped html attachment.
add_task(async function test_foo() {
  await test_message_attachments({
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "test.html",
        format: "",
      },
      {
        body: HTML_ATTACHMENT,
        filename:
          "<iframe src=&quote;http://www.example.com&quote></iframe>.htm",
        expectedFilename:
          "&lt;iframe src=&amp;quote;http://www.example.com&amp;quote&gt;&lt;/iframe&gt;.htm",
        contentType: "text/html;",
      },
    ],
  });
});

// No named email attachment with subject header.
add_task(async function test_no_named_email_attachment_with_subject_header() {
  await test_message_attachments({
    attachments: [
      {
        body: "",
        expectedFilename: "testSubject.eml",
      },
    ],
    bodyPart: new SyntheticPartMultiMixed([
      new SyntheticPartLeaf("plain body text"),
      msgGen.makeMessage({
        subject: "=?UTF-8?B?dGVzdFN1YmplY3Q=?=", // This string is 'testSubject'.
        charset: "UTF-8",
      }),
    ]),
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
    true, // Have them create the converter.
    "header=filter",
    false
  );

  const streamedData = await streamListener.promise;

  // Check that the attachments' filenames are as expected. Just use a regex
  // here because it's simple.
  const regex1 =
    /<legend class="moz-mime-attachment-header-name">(.*?)<\/legend>/gi;

  for (const attachment of info.attachments) {
    const match = regex1.exec(streamedData);
    Assert.notEqual(match, null);
    Assert.equal(match[1], attachment.expectedFilename || attachment.filename);
  }
  Assert.equal(regex1.exec(streamedData), null);

  // Check the attachments' filenames are listed for printing.
  const regex2 = /<td class="moz-mime-attachment-file">(.*?)<\/td>/gi;

  for (const attachment of info.attachments) {
    const match = regex2.exec(streamedData);
    Assert.notEqual(match, null);
    Assert.equal(match[1], attachment.expectedFilename || attachment.filename);
  }
  Assert.equal(regex2.exec(streamedData), null);
}

add_task(function endTest() {
  messageInjection.teardownMessageInjection();
});
