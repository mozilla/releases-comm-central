/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * This test creates some messages with attachments of different types and
 * checks that libmime reports the expected size for each of them.
 */

var {
  MessageGenerator,
  SyntheticPartLeaf,
  SyntheticPartMultiMixed,
  SyntheticMessageSet,
} = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageGenerator.sys.mjs"
);
var { MessageInjection } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MessageInjection.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);

// Somehow we hit the blocklist service, and that needs appInfo defined
const { updateAppInfo } = ChromeUtils.importESModule(
  "resource://testing-common/AppInfo.sys.mjs"
);
updateAppInfo();

var messenger = Cc["@mozilla.org/messenger;1"].createInstance(Ci.nsIMessenger);

// Create a message generator
var msgGen = new MessageGenerator();
var messageInjection = new MessageInjection({ mode: "local" });
var inbox = messageInjection.getInboxFolder();

/* Today's gory details (thanks to Jonathan Protzenko): libmime somehow
 * counts the trailing newline for an attachment MIME part. Most of the time,
 * assuming attachment has N bytes (no matter what's inside, newlines or
 * not), libmime will return N + 1 bytes. On Linux and Mac, this always
 * holds. However, on Windows, if the attachment is not encoded (that is, is
 * inline text), libmime will return N + 2 bytes.
 */
const EPSILON = "@mozilla.org/windows-registry-key;1" in Cc ? 4 : 2;

const TEXT_ATTACHMENT =
  "Can't make the frug contest, Helen; stomach's upset. I'll fix you, " +
  "Ubik! Ubik drops you back in the thick of things fast. Taken as " +
  "directed, Ubik speeds relief to head and stomach. Remember: Ubik is " +
  "only seconds away. Avoid prolonged use.";

const BINARY_ATTACHMENT = TEXT_ATTACHMENT;

const IMAGE_ATTACHMENT =
  "iVBORw0KGgoAAAANSUhEUgAAAAwAAAAMCAYAAABWdVznAAAABHNCSVQICAgIfAhkiAAAAAlwS" +
  "FlzAAAN1wAADdcBQiibeAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAA" +
  "A5SURBVCiRY/z//z8DKYCJJNXkaGBgYGD4D8NQ5zUgiTVAxeBqSLaBkVRPM0KtIhrQ3km0jwe" +
  "SNQAAlmAY+71EgFoAAAAASUVORK5CYII=";
const IMAGE_SIZE = 188;

const UU_ATTACHMENT =
  "begin 644 /home/jvporter/Desktop/out.txt\n" +
  'M0V%N)W0@;6%K92!T:&4@9G)U9R!C;VYT97-T+"!(96QE;CL@<W1O;6%C:"=S\n' +
  "M('5P<V5T+B!))VQL(&9I>\"!Y;W4L(%5B:6LA(%5B:6L@9')O<',@>6]U(&)A\n" +
  "M8VL@:6X@=&AE('1H:6-K(&]F('1H:6YG<R!F87-T+B!486ME;B!A<R!D:7)E\n" +
  "M8W1E9\"P@56)I:R!S<&5E9',@<F5L:65F('1O(&AE860@86YD('-T;VUA8V@N\n" +
  "M(%)E;65M8F5R.B!58FEK(&ES(&]N;'D@<V5C;VYD<R!A=V%Y+B!!=F]I9\"!P\n" +
  ".<F]L;VYG960@=7-E+@H`\n" +
  "`\n" +
  "end";

const YENC_TEXT =
  "Hello there --\n" +
  "=ybegin line=128 size=174 name=jane\n" +
  "\x76\x99\x98\x91\x9e\x8f\x97\x9a\x9d\x56\x4a\x94\x8f\x4a\x97\x8f" +
  "\x4a\x9d\x9f\x93\x9d\x4a\x8d\x99\x9f\x8d\x92\xed\xd3\x4a\x8e\x8f" +
  "\x4a\x8c\x99\x98\x98\x8f\x4a\x92\x8f\x9f\x9c\x8f\x58\x4a\x7a\x8b" +
  "\x9c\x90\x99\x93\x9d\x56\x4a\xed\xca\x4a\x9a\x8f\x93\x98\x8f\x4a" +
  "\x97\x8b\x4a\x8c\x99\x9f\x91\x93\x8f\x4a\xed\xd3\x9e\x8f\x93\x98" +
  "\x9e\x8f\x56\x4a\x97\x8f\x9d\x4a\xa3\x8f\x9f\xa2\x4a\x9d\x8f\x4a" +
  "\x90\x8f\x9c\x97\x8b\x93\x8f\x98\x9e\x4a\x9d\x93\x4a\xa0\x93\x9e" +
  "\x8f\x4a\x9b\x9f\x8f\x4a\x94\x8f\x4a\x98\x51\x8b\xa0\x8b\x93\x9d" +
  "\x0d\x0a\x4a\x9a\x8b\x9d\x4a\x96\x8f\x4a\x9e\x8f\x97\x9a\x9d\x4a" +
  "\x8e\x8f\x4a\x97\x8f\x4a\x8e\x93\x9c\x8f\x4a\x64\x4a\xec\xd5\x4a" +
  "\x74\x8f\x4a\x97\x51\x8f\x98\x8e\x99\x9c\x9d\x58\x4a\xec\xe5\x34" +
  "\x0d\x0a" +
  "=yend size=174 crc32=7efccd8e\n";
const YENC_SIZE = 174;

const PART_HTML = new SyntheticPartLeaf(
  "<html><head></head><body>I am HTML! Woo! </body></html>",
  {
    contentType: "text/html",
  }
);

var attachedMessage1 = msgGen.makeMessage({ body: { body: TEXT_ATTACHMENT } });
var attachedMessage2 = msgGen.makeMessage({
  body: { body: TEXT_ATTACHMENT },
  attachments: [
    {
      body: IMAGE_ATTACHMENT,
      contentType: "application/x-ubik",
      filename: "ubik",
      encoding: "base64",
      format: "",
    },
  ],
});

add_task(async function test_text_attachment() {
  await test_message_attachments({
    attachments: [
      {
        body: TEXT_ATTACHMENT,
        filename: "ubik.txt",
        format: "",
      },
    ],
    size: TEXT_ATTACHMENT.length,
  });
});

// (inline) image attachment
add_task(async function test_inline_image_attachment() {
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
    size: IMAGE_SIZE,
  });
});

// binary attachment, no encoding
add_task(async function test_binary_attachment_no_encoding() {
  await test_message_attachments({
    attachments: [
      {
        body: BINARY_ATTACHMENT,
        contentType: "application/x-ubik",
        filename: "ubik",
        format: "",
      },
    ],
    size: BINARY_ATTACHMENT.length,
  });
});

// binary attachment, b64 encoding
add_task(async function test_binary_attachment_b64_encoding() {
  await test_message_attachments({
    attachments: [
      {
        body: IMAGE_ATTACHMENT,
        contentType: "application/x-ubik",
        filename: "ubik",
        encoding: "base64",
        format: "",
      },
    ],
    size: IMAGE_SIZE,
  });
});

// uuencoded attachment
add_task(async function test_uuencoded_attachment() {
  await test_message_attachments({
    attachments: [
      {
        body: UU_ATTACHMENT,
        contentType: "application/x-uuencode",
        filename: "ubik",
        format: "",
        encoding: "uuencode",
      },
    ],
    size: TEXT_ATTACHMENT.length,
  });
});

// yencoded attachment
add_task(async function test_yencoded_attachment() {
  await test_message_attachments({
    bodyPart: new SyntheticPartLeaf("I am text! Woo!\n\n" + YENC_TEXT, {
      contentType: "",
    }),
    subject: 'yEnc-Prefix: "jane" 174 yEnc bytes - yEnc test (1)',
    size: YENC_SIZE,
  });
});

// an attached eml that used to return a size that's -1
add_task(async function test_incorrect_attached_eml() {
  await test_message_attachments({
    bodyPart: new SyntheticPartMultiMixed([PART_HTML, attachedMessage1]),
    size: get_message_size(attachedMessage1),
  });
});

// this is an attached message that itself has an attachment
add_task(async function test_recursive_attachment() {
  await test_message_attachments({
    bodyPart: new SyntheticPartMultiMixed([PART_HTML, attachedMessage2]),
    size: get_message_size(attachedMessage2),
  });
});

// an "attachment" that's really the body of the message
add_task(async function test_body_attachment() {
  await test_message_attachments({
    body: {
      body: TEXT_ATTACHMENT,
      contentType: "application/x-ubik; name=attachment.ubik",
    },
    size: TEXT_ATTACHMENT.length,
  });
});

// a message/rfc822 "attachment" that's really the body of the message
add_task(async function test_rfc822_attachment() {
  await test_message_attachments({
    bodyPart: attachedMessage1,
    size: get_message_size(attachedMessage1),
  });
});

// an external http link attachment (as constructed for feed enclosures) - no 'size' parm.
add_task(async function test_external_http_link_without_size() {
  await test_message_attachments({
    attachments: [
      {
        body: "This MIME attachment is stored separately from the message.",
        contentType: 'application/unknown; name="somefile"',
        extraHeaders: {
          "X-Mozilla-External-Attachment-URL": "http://myblog.com/somefile",
        },
        disposition: 'attachment; filename="somefile"',
      },
    ],
    size: -1,
  });
});

// an external http link attachment (as constructed for feed enclosures) - file with 'size' parm.
add_task(async function test_external_http_link_wit_file_size() {
  await test_message_attachments({
    attachments: [
      {
        body: "This MIME attachment is stored separately from the message.",
        contentType: 'audio/mpeg; name="file.mp3"; size=123456789',
        extraHeaders: {
          "X-Mozilla-External-Attachment-URL": "https://myblog.com/file.mp3",
        },
        disposition: 'attachment; name="file.mp3"',
      },
    ],
    size: 123456789,
  });
});

add_task(function endTest() {
  messageInjection.teardownMessageInjection();
});

async function test_message_attachments(info) {
  const synMsg = msgGen.makeMessage(info);
  const synSet = new SyntheticMessageSet([synMsg]);
  await messageInjection.addSetsToFolders([inbox], [synSet]);

  const msgURI = synSet.getMsgURI(0);
  const msgService = MailServices.messageServiceFromURI(msgURI);
  await PromiseTestUtils.promiseDelay(200);
  const streamListener = new PromiseTestUtils.PromiseStreamListener({
    onStopRequest(request) {
      request.QueryInterface(Ci.nsIMailChannel);
      for (const attachment of request.attachments) {
        const attachmentSize = parseInt(attachment.get("X-Mozilla-PartSize"));
        dump(
          "*** Size is " + attachmentSize + " (expecting " + info.size + ")\n"
        );
        Assert.ok(Math.abs(attachmentSize - info.size) <= EPSILON);
        break;
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

/**
 * Return the size of a synthetic message. Much like the above comment, libmime
 * counts bytes differently on Windows, where it counts newlines (\r\n) as 2
 * bytes. Mac and Linux treats them as 1 byte.
 *
 * @param message a synthetic message from makeMessage()
 * @returns the message's size in bytes
 */
function get_message_size(message) {
  const messageString = message.toMessageString();
  if (EPSILON == 4) {
    // Windows
    return messageString.length;
  }
  return messageString.replace(/\r\n/g, "\n").length;
}
