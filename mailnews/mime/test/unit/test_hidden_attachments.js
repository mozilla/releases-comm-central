/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test creates some messages with attachments of different types and
 * checks that libmime emits (or doesn't emit) the attachments as appropriate.
 */

var { MessageGenerator, SyntheticMessageSet } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageGenerator.jsm"
);
var { MessageInjection } = ChromeUtils.import(
  "resource://testing-common/mailnews/MessageInjection.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
var { TestUtils } = ChromeUtils.import(
  "resource://testing-common/TestUtils.jsm"
);

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

add_task(function setupTest() {
  // Stub.
});

add_task(async function test_without_attachment() {
  await test_message_attachments({});
});

/* Attachments with Content-Disposition: attachment */
// inline-able attachment with a name
add_task(
  async function test_content_disposition_attachment_inlineable_attachment_with_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "ubik.txt",
          disposition: "attachment",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: attachment */
// inline-able attachment with no name
add_task(
  async function test_content_disposition_attachment_inlineable_attachment_no_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "",
          disposition: "attachment",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: attachment */
// non-inline-able attachment with a name
add_task(
  async function test_content_disposition_attachment_non_inlineable_attachment_with_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "ubik.ubk",
          disposition: "attachment",
          contentType: "application/x-ubik",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: attachment */
// non-inline-able attachment with no name
add_task(
  async function test_content_disposition_attachment_non_inlineable_attachment_no_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "",
          disposition: "attachment",
          contentType: "application/x-ubik",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: inline */
// inline-able attachment with a name
add_task(
  async function test_content_disposition_inline_inlineable_attachment_with_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "ubik.txt",
          disposition: "inline",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: inline */
// inline-able attachment with no name
add_task(
  async function test_content_disposition_inline_inlineable_attachment_no_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "",
          disposition: "inline",
          format: "",
          shouldShow: false,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: inline */
// non-inline-able attachment with a name
add_task(
  async function test_content_disposition_inline_non_inlineable_attachment_with_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "ubik.ubk",
          disposition: "inline",
          contentType: "application/x-ubik",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

/* Attachments with Content-Disposition: inline */
// non-inline-able attachment with no name
add_task(
  async function test_content_disposition_inline_non_inlineable_attachment_no_name() {
    await test_message_attachments({
      attachments: [
        {
          body: "attachment",
          filename: "",
          disposition: "inline",
          contentType: "application/x-ubik",
          format: "",
          shouldShow: true,
        },
      ],
    });
  }
);

async function test_message_attachments(info) {
  let synMsg = messageGenerator.makeMessage(info);
  let synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  let msgURI = synSet.getMsgURI(0);
  let msgService = messenger.messageServiceFromURI(msgURI);

  let showedAttachments = (info.attachments || []).filter(i => i.shouldShow);
  let msgHdrSinkProm = new MsgHeaderSinkHandleAttachments(
    showedAttachments.length
  );

  msgWindow.msgHeaderSink = msgHdrSinkProm;

  let streamListener = new PromiseTestUtils.PromiseStreamListener();
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

  await streamListener.promise;
  let attachmentsHdrSink = await msgHdrSinkProm.waitForAttachmentCount();

  let expectedAttachments = (info.attachments || [])
    .filter(i => i.shouldShow)
    .map(i => i.filename);
  Assert.equal(expectedAttachments.length, attachmentsHdrSink.length);

  for (let i = 0; i < attachmentsHdrSink.length; i++) {
    // If the expected attachment's name is empty, we probably generated a
    // name like "Part 1.2", so don't bother checking that the names match
    // (they won't).
    if (expectedAttachments[i]) {
      Assert.equal(expectedAttachments[i], attachmentsHdrSink[i]);
    }
  }
}

function MsgHeaderSinkHandleAttachments(attachmentCountForResolve) {
  this._attachmentCount = attachmentCountForResolve;
  this._attachments = [];
}

MsgHeaderSinkHandleAttachments.prototype = {
  handleAttachment(
    aContentType,
    aUrl,
    aDisplayName,
    aUri,
    aIsExternalAttachment
  ) {
    this._attachments.push(aDisplayName);
  },

  /**
   * Wait for the desired attachment counts.
   * Works without any invoking of handleAttachment this way.
   *
   * @returns string[]
   */
  async waitForAttachmentCount() {
    await TestUtils.waitForCondition(
      () => this._attachments.length === this._attachmentCount,
      "waiting for reaching the desired amount of attachments through the Message Header Sink"
    );
    return this._attachments;
  },
};
