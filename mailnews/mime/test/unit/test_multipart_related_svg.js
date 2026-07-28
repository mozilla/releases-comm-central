/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests that embedded SVG images remain loadable when attachments are not
 * displayed inline.
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

var messageGenerator = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();
var msgWindow = Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(
  Ci.nsIMsgWindow
);

add_setup(function () {
  Services.prefs.setBoolPref("mail.inline_attachments", false);
  registerCleanupFunction(() => {
    Services.prefs.clearUserPref("mail.inline_attachments");
  });
});

add_task(async function test_embedded_svg_with_inline_attachments_disabled() {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16">' +
    '<circle cx="8" cy="8" r="8" fill="green"/></svg>';
  const contentId = "embedded-svg@example.invalid";
  const htmlPart = new SyntheticPartLeaf(
    `<img src="cid:${contentId}" alt="embedded SVG">`,
    { contentType: "text/html" }
  );
  const imagePart = new SyntheticPartLeaf(btoa(svg), {
    contentType: "image/svg+xml",
    contentId,
    disposition: "inline",
    encoding: "base64",
    filename: "embedded.svg",
  });
  const relatedPart = new SyntheticPartMultiRelated([htmlPart, imagePart]);
  const message = messageGenerator.makeMessage({ bodyPart: relatedPart });
  const messageSet = new SyntheticMessageSet([message]);
  await messageInjection.addSetsToFolders([inbox], [messageSet]);

  const messageURI = messageSet.getMsgURI(0);
  const messageService = MailServices.messageServiceFromURI(messageURI);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();
  messageService.streamMessage(
    messageURI,
    streamListener,
    msgWindow,
    null,
    true,
    "filter",
    false
  );

  const document = new DOMParser().parseFromString(
    await streamListener.promise,
    "text/html"
  );
  const imageURL = document.querySelector("img").getAttribute("src");
  const channel = NetUtil.newChannel({
    uri: imageURL,
    loadUsingSystemPrincipal: true,
  });
  const deferred = Promise.withResolvers();
  NetUtil.asyncFetch(channel, (stream, status) => {
    if (!Components.isSuccessCode(status)) {
      deferred.reject(new Error(`Loading the embedded SVG failed: ${status}`));
      return;
    }
    deferred.resolve(
      NetUtil.readInputStreamToString(stream, stream.available())
    );
  });

  Assert.equal(await deferred.promise, svg, "The SVG bytes should be decoded");
  Assert.equal(
    channel.contentType,
    "image/svg+xml",
    "The embedded image should be served with its declared MIME type"
  );
});
