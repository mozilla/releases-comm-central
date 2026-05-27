/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

const { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);

const kDecodedMarker = "Hello World";
// A thousand layers is a tractable xpcshell fixture for proving that nesting is
// bounded while keeping the test safe if it runs against an unfixed build. The
// resource exhaustion risk comes from accepting arbitrary depth.
const kExcessiveDepth = 1000;
const kAcceptedDepth = 50;
const kMultipartTypes = [
  "multipart/mixed",
  "multipart/alternative",
  "multipart/related",
  "multipart/digest",
  "multipart/parallel",
];

const messageInjection = new MessageInjection({ mode: "local" });

function makeNestedRfc822Message(depth) {
  let message = [
    "From: inner@example.invalid",
    "To: recipient@example.invalid",
    "Subject: inner",
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "",
    kDecodedMarker,
  ].join("\r\n");

  for (let i = 0; i < depth; i++) {
    message = [
      `From: layer-${i}@example.invalid`,
      "To: recipient@example.invalid",
      `Subject: layer ${i}`,
      "MIME-Version: 1.0",
      "Content-Type: message/rfc822",
      "",
      message,
    ].join("\r\n");
  }
  return message;
}

function makeNestedMultipartMessage(depth) {
  let part = [
    "Content-Type: text/plain; charset=UTF-8",
    "",
    kDecodedMarker,
  ].join("\r\n");

  for (let i = depth - 1; i >= 0; i--) {
    const boundary = `nested-boundary-${i}`;
    const contentType = kMultipartTypes[i % kMultipartTypes.length];
    part = [
      `Content-Type: ${contentType}; boundary="${boundary}"`,
      "",
      `--${boundary}`,
      part,
      "",
      `--${boundary}--`,
      "",
    ].join("\r\n");
  }

  return [
    "From: outer@example.invalid",
    "To: recipient@example.invalid",
    "Subject: nested multipart",
    "MIME-Version: 1.0",
    part,
  ].join("\r\n");
}

async function streamMessage(message) {
  const folder = await messageInjection.makeEmptyFolder();
  folder.QueryInterface(Ci.nsIMsgLocalMailFolder);
  folder.addMessage(message);

  const msgHdr = [...folder.messages][0];
  const msgURI = folder.getUriForMsg(msgHdr);
  const msgService = MailServices.messageServiceFromURI(msgURI);
  const streamListener = new PromiseTestUtils.PromiseStreamListener();

  msgService.streamMessage(
    msgURI,
    streamListener,
    null,
    null,
    true,
    "filter",
    false
  );

  return streamListener.promise;
}

async function assertMessageDecodes(message, description) {
  const streamedData = await streamMessage(message);

  Assert.ok(
    streamedData.includes(kDecodedMarker),
    `${description} should decode the inner payload`
  );
}

async function assertDeepMessageDoesNotDecode(message, description) {
  let streamedData = "";
  try {
    streamedData = await streamMessage(message);
  } catch (ex) {
    Assert.ok(true, `${description} should stop with a stream error`);
    return;
  }

  Assert.ok(
    !streamedData.includes(kDecodedMarker),
    `${description} should not render ${kDecodedMarker}`
  );
}

add_task(async function test_deeply_nested_rfc822_does_not_decode() {
  await assertDeepMessageDoesNotDecode(
    makeNestedRfc822Message(kExcessiveDepth),
    "deep nested message/rfc822 fixture"
  );
});

add_task(async function test_deeply_nested_multipart_does_not_decode() {
  await assertDeepMessageDoesNotDecode(
    makeNestedMultipartMessage(kExcessiveDepth),
    "deep nested multipart fixture"
  );
});

add_task(async function test_accepted_depth_rfc822_decodes() {
  await assertMessageDecodes(
    makeNestedRfc822Message(kAcceptedDepth),
    "accepted-depth message/rfc822 fixture"
  );
});

add_task(async function test_accepted_depth_multipart_decodes() {
  await assertMessageDecodes(
    makeNestedMultipartMessage(kAcceptedDepth),
    "accepted-depth multipart fixture"
  );
});
