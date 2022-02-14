/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test checks handling of bad content type of the
 * type reported in bug 659355.
 * Adapted from test_attachment_size.js
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

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);
var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

const IMAGE_ATTACHMENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";

add_task(function setupTest() {
  // Stub.
});

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
  let synMsg = messageGenerator.makeMessage(info);
  let synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  let msgURI = synSet.getMsgURI(0);
  let msgService = messenger.messageServiceFromURI(msgURI);

  let msgHeaderSinkProm = new MsgHeaderSinkHandleAttachments();
  msgWindow.msgHeaderSink = msgHeaderSinkProm;
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
  let msgHdrSinkContentType = await msgHeaderSinkProm.promise;
  Assert.equal(msgHdrSinkContentType, info.testContentType);
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
