/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks handling of bad content type of the
 * type reported in bug 659355.
 * Adapted from test_attachment_size.js
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

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();

const IMAGE_ATTACHMENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";

add_task(async function test_image_attachment_normal_content_type() {
  await test_message_attachments({
    attachments: [
      {
        body: IMAGE_ATTACHMENT,
        contentType: "image/png",
        filename: "lines.png",
        encoding: "base64",
        format: "",
      },
    ],
    testContentType: "image/png",
  });
});

add_task(async function test_image_attachment_bad_content_type() {
  await test_message_attachments({
    attachments: [
      {
        body: IMAGE_ATTACHMENT,
        contentType: "=?windows-1252?q?application/pdf",
        filename: "lines.pdf",
        encoding: "base64",
        format: "",
      },
    ],
    testContentType: "application/pdf",
  });
});

add_task(function endTest() {
  messageInjection.teardownMessageInjection();
});

async function test_message_attachments(info) {
  const synMsg = messageGenerator.makeMessage(info);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const msgURI = synSet.getMsgURI(0);
  const msgService = MailServices.messageServiceFromURI(msgURI);

  const streamListener = new PromiseTestUtils.PromiseStreamListener({
    onStopRequest(request, statusCode) {
      request.QueryInterface(Ci.nsIMailChannel);
      const msgHdrSinkContentType =
        request.attachments[0].getProperty("contentType");
      Assert.equal(msgHdrSinkContentType, info.testContentType);
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

function MsgHeaderSinkHandleAttachments() {
  this._promise = new Promise(resolve => {
    this._resolve = resolve;
  });
}

MsgHeaderSinkHandleAttachments.prototype = {
  handleAttachment(
    aContentType,
    aUrl,
    aDisplayName,
    aUri,
    aIsExternalAttachment
  ) {
    this._resolve(aContentType);
  },

  get promise() {
    return this._promise;
  },
};
