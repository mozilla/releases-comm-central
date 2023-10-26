/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * attachment test using non-ascii character
 */

const nonAsciiUrl = "http://\u65e5\u672c\u8a9e.jp";
const prettyResult = "\u65e5\u672c\u8a9e.jp";

function doAttachmentUrlTest() {
  // handles non-ascii url in nsIMsgAttachment

  const attachment = Cc[
    "@mozilla.org/messengercompose/attachment;1"
  ].createInstance(Ci.nsIMsgAttachment);
  attachment.url = nonAsciiUrl;

  Assert.equal(attachment.url, nonAsciiUrl);
}

function doPrettyNameTest() {
  // handles non-ascii url in nsIMsgCompose

  const msgCompose = Cc[
    "@mozilla.org/messengercompose/compose;1"
  ].createInstance(Ci.nsIMsgCompose);
  const params = Cc[
    "@mozilla.org/messengercompose/composeparams;1"
  ].createInstance(Ci.nsIMsgComposeParams);
  msgCompose.initialize(params);

  Assert.equal(
    msgCompose.AttachmentPrettyName(nonAsciiUrl, null),
    prettyResult
  );
}

function run_test() {
  doAttachmentUrlTest();
  doPrettyNameTest();

  do_test_finished();
}
