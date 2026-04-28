/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that multipart/related messages with a "start" parameter correctly
 * display the root part identified by the start Content-ID, rather than
 * showing a blank message. See bug 471402.
 */

var {
  MessageGenerator,
  SyntheticMessageSet,
  SyntheticPartLeaf,
  SyntheticPartMultiRelated,
} = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

var msgGen = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

async function streamMessage(msgURI) {
  const msgService = MailServices.messageServiceFromURI(msgURI);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  msgService.streamMessage(
    msgURI,
    streamListener,
    msgWindow,
    null,
    true,
    "filter",
    false
  );
  return streamListener.promise;
}

/**
 * The start parameter uses angle brackets around the Content-ID (per RFC 2387).
 * The HTML part is the first child, same as default ordering, but the start
 * parameter must still be respected.
 */
add_task(async function test_start_param_with_angle_brackets() {
  const htmlPart = new SyntheticPartLeaf("<p>This text must be visible.</p>", {
    contentType: "text/html",
    contentId: "root-part@test.invalid",
  });
  const imagePart = new SyntheticPartLeaf("fake-image-data", {
    contentType: "image/png",
    filename: "test.png",
    contentId: "image-part@test.invalid",
  });
  const relatedPart = new SyntheticPartMultiRelated([htmlPart, imagePart]);
  relatedPart._contentTypeExtra = {
    start: "<root-part@test.invalid>",
  };

  const synMsg = msgGen.makeMessage({ bodyPart: relatedPart });
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const data = await streamMessage(synSet.getMsgURI(0));
  Assert.stringContains(
    data,
    "This text must be visible",
    "HTML root part identified by start parameter should be rendered"
  );
});

/**
 * Image part comes first, HTML part second. The start parameter points to the
 * HTML part's Content-ID. Without start parameter support, only the image
 * (first part) would be treated as root and the text would be missing.
 * Regression test for bug 1149663.
 */
add_task(async function test_start_param_non_first_root() {
  const imagePart = new SyntheticPartLeaf("fake-image-data", {
    contentType: "image/png",
    filename: "icon.png",
    contentId: "image-part@test.invalid",
  });
  const htmlPart = new SyntheticPartLeaf(
    "<p>Second part selected as root via start.</p>",
    { contentType: "text/html", contentId: "html-body@test.invalid" }
  );
  const relatedPart = new SyntheticPartMultiRelated([imagePart, htmlPart]);
  relatedPart._contentTypeExtra = {
    start: "<html-body@test.invalid>",
  };

  const synMsg = msgGen.makeMessage({ bodyPart: relatedPart });
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const data = await streamMessage(synSet.getMsgURI(0));
  Assert.stringContains(
    data,
    "Second part selected as root via start",
    "Non-first part designated by start parameter should be rendered as root"
  );
});
