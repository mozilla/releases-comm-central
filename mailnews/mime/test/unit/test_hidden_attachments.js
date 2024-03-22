/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test creates some messages with attachments of different types and
 * checks that libmime emits (or doesn't emit) the attachments as appropriate.
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
var { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();

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
  const synMsg = messageGenerator.makeMessage(info);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const msgURI = synSet.getMsgURI(0);
  const msgService = MailServices.messageServiceFromURI(msgURI);

  const streamListener = new PromiseTestUtils.PromiseStreamListener({
    onStopRequest(request) {
      request.QueryInterface(Ci.nsIMailChannel);
      const expectedAttachments = (info.attachments || [])
        .filter(i => i.shouldShow)
        .map(i => i.filename);
      Assert.equal(request.attachments.length, expectedAttachments.length);

      for (let i = 0; i < request.attachments.length; i++) {
        // If the expected attachment's name is empty, we probably generated a
        // name like "Part 1.2", so don't bother checking that the names match
        // (they won't).
        if (expectedAttachments[i]) {
          Assert.equal(
            request.attachments[i].getProperty("displayName"),
            expectedAttachments[i]
          );
        }
      }
    },
  });
  msgService.streamMessage(
    msgURI,
    streamListener,
    null,
    null,
    true, // have them create the converter
    // additional uri payload, note that "header=" is prepended automatically
    "filter",
    false
  );

  await streamListener.promise;
}
