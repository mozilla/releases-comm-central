/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
const { MailChannel } = ChromeUtils.importESModule(
  "resource:///modules/MailChannel.sys.mjs"
);

class TestPlainChannel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel"]);
  contentType = "";

  constructor(uri) {
    this.URI = Services.io.newURI(uri);
  }
}

class TestMailChannel extends MailChannel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel", "nsIMailChannel"]);
  contentType = "";

  /**
   * @param {string} uri
   */
  constructor(uri) {
    super();
    this.URI = Services.io.newURI(uri);
  }

  /**
   * @param {string[][]} expectedHeaders - An array of key/value pairs.
   */
  checkHeaders(expectedHeaders) {
    const { headerNames, headerValues, mimeHeaders } = this;
    Assert.equal(
      headerNames.length,
      expectedHeaders.length,
      "number of header names"
    );
    Assert.equal(
      headerValues.length,
      expectedHeaders.length,
      "number of header values"
    );
    for (let i = 0; i < expectedHeaders.length; i++) {
      Assert.equal(headerNames[i], expectedHeaders[i][0], `header name ${i}`);
      Assert.equal(headerValues[i], expectedHeaders[i][1], `header value ${i}`);
    }
    for (const [name, value] of expectedHeaders) {
      if (name != "X-Mozilla-LocalizedDate") {
        Assert.equal(
          mimeHeaders.extractHeader(name, true).replaceAll("\t", " "),
          value,
          `mimeHeaders value for ${name}`
        );
      }
    }
  }

  /**
   * @param {object[]} expectedAttachments - An array of objects, each
   *   representing the properties of an attachment.
   */
  checkAttachments(expectedAttachments) {
    const { attachments } = this;
    Assert.equal(
      attachments.length,
      expectedAttachments.length,
      "number of attachments"
    );
    for (let i = 0; i < expectedAttachments.length; i++) {
      for (const property of attachments[i].enumerator) {
        Assert.equal(
          property.value,
          expectedAttachments[i][property.name],
          `attachment ${i} property ${property.name}`
        );
        delete expectedAttachments[i][property.name];
      }
      Assert.equal(
        Object.entries(expectedAttachments[i]).length,
        0,
        `all attachment ${i} properties checked`
      );
    }
  }
}

/**
 * @param {string} uri
 * @param {nsIChannel} channel
 * @param {string} input
 * @returns {string}
 */
async function convertStream(uri, channel, input) {
  const converter = Cc[
    "@mozilla.org/streamconv;1?from=message/rfc822&to=*/*"
  ].createInstance(Ci.nsIStreamConverter);

  const listener = new PromiseTestUtils.PromiseStreamListener(undefined, true);
  converter.asyncConvertData("message/rfc822", "text/html", listener, channel);

  const { buffer } = new TextEncoder().encode(input);
  const inputStream = Cc[
    "@mozilla.org/io/arraybuffer-input-stream;1"
  ].createInstance(Ci.nsIArrayBufferInputStream);
  inputStream.setData(buffer, 0, buffer.byteLength);
  converter.onStartRequest(channel);
  converter.onDataAvailable(channel, inputStream, 0, buffer.byteLength);
  converter.onStopRequest(channel, Cr.NS_OK);

  return await listener.promise;
}

const sampleEmailFile = do_get_file("sampleContent.eml");
const sampleEmailURI =
  "mailbox:" + Services.io.newFileURI(sampleEmailFile).spec.slice(5);

/**
 * Test with a mailbox URL for an email file.
 */
add_task(async function testBodyMailboxURL() {
  await subtestBody(`${sampleEmailURI}?number=1`);
});

/**
 * Test with an IMAP URL. This doesn't work because the IMAP account doesn't
 * exist, so the I/O service will refuse to create the URI.
 */
add_task(async function testBodyImapURL() {
  await subtestBody("imap://somebody@somewhere.tld/fetch%3EUID%3E/INBOX%3E1");
}).skip();

/**
 * Test with a file URL, with the query parameters we add.
 */
add_task(async function testBodyFileURL1() {
  await subtestBody(
    "file:///somewhere/out/there.eml?type=application/x-message-display&number=0"
  );
});

/**
 * Test with a file URL, without the query parameters we add.
 */
add_task(async function testBodyFileURL2() {
  await subtestBody("file:///somewhere/out/there.eml");
});

/**
 * Test with some completely unknown URL format.
 * FIXME: This doesn't work, but we'll fix it in the next patch.
 */
add_task(async function testBodyNewURL() {
  await subtestBody("odd:///?p=file%3A%2F%2F%2Fsomewhere%2Fout%2Fthere.eml");
}).skip();

/**
 * Simulates a load of sampleContent.eml from the given URI. The converter
 * output can vary based on the URI, but should be (almost) exactly the same
 * for every test that runs this subtest.
 *
 * @param {string} uri
 */
async function subtestBody(uri) {
  const channel = new TestMailChannel(uri);
  const input = await IOUtils.readUTF8(sampleEmailFile.path);
  const output = await convertStream(uri, channel, input);

  // Test the channel output.

  // FIXME: The content type is set multiple times, and the last time is the
  // content type of the attachment displayed inline. Bug 2064295.
  // Assert.equal(
  //   channel.contentType,
  //   "text/html",
  //   "body channel should have the HTML content type"
  // );
  channel.checkHeaders([
    ["Content-Type", `multipart/mixed; boundary="--------------CHOPCHOP0"`],
    ["Subject", "Big Meeting Today"],
    ["From", `"Andy Anway" <andy@anway.invalid>`],
    ["To", `"Bob Bell" <bob@bell.invalid>`],
    ["Message-Id", "<sample.content@made.up.invalid>"],
    ["Date", "Tue, 01 Feb 2000 00:00:00 +1300"],
    [
      "X-Mozilla-LocalizedDate",
      new Services.intl.DateTimeFormat(undefined, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date("2000-02-01T00:00:00+1300")),
    ],
  ]);

  let expectedAttachmentURI;
  if (uri.startsWith("mailbox:")) {
    expectedAttachmentURI = "mailbox-message:" + uri.slice(8) + "#1";
  } else {
    expectedAttachmentURI = uri;
  }

  const expectedAttachment1URL = URL.parse(uri);
  expectedAttachment1URL.searchParams.delete("type");
  expectedAttachment1URL.searchParams.set("part", "1.2");
  expectedAttachment1URL.searchParams.set("filename", "attachment.txt");

  const expectedAttachment2URL = URL.parse(uri);
  expectedAttachment2URL.searchParams.delete("type");
  expectedAttachment2URL.searchParams.set("part", "1.3");
  expectedAttachment2URL.searchParams.set("filename", "attachment.svg");

  channel.checkAttachments([
    {
      uri: expectedAttachmentURI,
      url: expectedAttachment1URL,
      displayName: "attachment.txt",
      contentType: "text/plain",
      "X-Mozilla-PartSize": "51",
      notDownloaded: false,
      "X-Mozilla-PartDownloaded": "1",
    },
    {
      uri: expectedAttachmentURI,
      url: expectedAttachment2URL,
      displayName: "attachment.svg",
      contentType: "image/svg+xml",
      "X-Mozilla-PartSize": "474",
      notDownloaded: false,
      "X-Mozilla-PartDownloaded": "1",
    },
  ]);

  // Test the HTML output.

  // info(output);
  Assert.equal(
    output.slice(0, 28),
    "\xEF\xBB\xBF<!DOCTYPE html>\r\n<html>\r\n",
    "output should begin with UTF-8 BOM and HTML doctype"
  );
  // FIXME: `output` should end with a </html> tag, and maybe some white space,
  // but it doesn't. Bug 2064299.

  // Test the <img> tag in the HTML output.

  const expectedImgURL = URL.parse(uri);
  expectedImgURL.searchParams.delete("type");
  expectedImgURL.searchParams.set("part", "1.1.2");
  expectedImgURL.searchParams.set("type", "image/png");
  expectedImgURL.searchParams.set("filename", "tb-logo.png");

  // FIXME: The image URL is encoded incorrectly.
  // That will be fixed in the next patch.
  // const document = new DOMParser().parseFromString(output, "text/html");
  // const img = document.querySelector("img");
  // Assert.equal(
  //   img.src,
  //   expectedImgURL.toString(),
  //   "inline image URL should be rewritten relative to the message URL"
  // );

  // Test a request for the image.

  const imgChannel = new TestPlainChannel(expectedImgURL);
  const imgOutput = await convertStream(expectedImgURL, imgChannel, input);

  Assert.equal(
    imgChannel.contentType,
    "image/png",
    "image channel should have the image content type"
  );
  Assert.equal(
    imgOutput.slice(0, 8),
    "\x89PNG\x0D\x0A\x1A\x0A",
    "output should start at the start of the PNG image"
  );
  Assert.equal(
    imgOutput.slice(-8),
    "IEND\xAE\x42\x60\x82",
    "output should end at the end of the PNG image"
  );

  // Test a request for the first attachment.

  const attachment1Channel = new TestPlainChannel(expectedAttachment1URL);
  const attachment1Output = await convertStream(
    expectedAttachment1URL,
    attachment1Channel,
    input
  );

  Assert.equal(
    attachment1Channel.contentType,
    "application/x-unknown-content-type", // text/plain?
    "attachment channel should have the attachment content type"
  );
  Assert.equal(
    attachment1Output,
    "I'm a text attachment! I won't be displayed inline\n",
    "output should contain the attachment"
  );

  // Test a request for the second attachment.

  const attachment2Channel = new TestPlainChannel(expectedAttachment2URL);
  const attachment2Output = await convertStream(
    expectedAttachment2URL,
    attachment2Channel,
    input
  );

  Assert.equal(
    attachment2Channel.contentType,
    "image/svg+xml",
    "attachment channel should have the attachment content type"
  );
  Assert.equal(
    attachment2Output.slice(0, 5),
    "<svg ",
    "output should start at the start of the SVG image"
  );
  Assert.equal(
    attachment2Output.slice(-8),
    "\n</svg>\n",
    "output should end at the end of the SVG image"
  );
}

/**
 * Test the inline attachments when enabled.
 */
add_task(async function testInlineAttachments() {
  const uri = `${sampleEmailURI}?number=2`;
  const channel = new TestMailChannel(uri);
  const input = await IOUtils.readUTF8(sampleEmailFile.path);
  const output = await convertStream(uri, channel, input);

  const document = new DOMParser().parseFromString(output, "text/html");
  const fieldsets = document.querySelectorAll(
    "fieldset.moz-mime-attachment-header"
  );
  Assert.equal(
    fieldsets.length,
    2,
    "there should be fieldsets for the inline attachment and printed list"
  );

  Assert.ok(!fieldsets[0].classList.contains("moz-print-only"));
  Assert.equal(fieldsets[0].textContent, "attachment.svg");
  const inlineContainer = fieldsets[0].nextElementSibling;
  Assert.equal(inlineContainer.localName, "div");
  Assert.equal(inlineContainer.className, "moz-attached-image-container");
  const img = inlineContainer.querySelector("img");
  Assert.equal(img.className, "moz-attached-image");
  Assert.equal(
    img.src,
    `${sampleEmailURI}?number=2&part=1.3&type=image/svg+xml&filename=attachment.svg`
  );

  subtestPrintedAttachmentList(fieldsets[1]);
});

/**
 * Test the inline attachments when inline text attachments are enabled.
 */
add_task(async function testInlineTextAttachments() {
  Services.prefs.setBoolPref("mail.inline_attachments.text", true);

  const uri = `${sampleEmailURI}?number=3`;
  const channel = new TestMailChannel(uri);
  const input = await IOUtils.readUTF8(sampleEmailFile.path);
  const output = await convertStream(uri, channel, input);

  const document = new DOMParser().parseFromString(output, "text/html");
  const fieldsets = document.querySelectorAll(
    "fieldset.moz-mime-attachment-header"
  );
  Assert.equal(
    fieldsets.length,
    3,
    "there should be fieldsets for both the inline attachments and printed list"
  );

  Assert.ok(!fieldsets[0].classList.contains("moz-print-only"));
  Assert.equal(fieldsets[0].textContent, "attachment.txt");
  const inlineContainer0 = fieldsets[0].nextElementSibling;
  Assert.equal(inlineContainer0.localName, "div");
  Assert.equal(inlineContainer0.className, "moz-text-plain");
  const pre0 = inlineContainer0.querySelector("pre.moz-quote-pre[wrap]");
  Assert.equal(
    pre0.textContent,
    "I'm a text attachment! I won't be displayed inline\n"
  );

  Assert.ok(!fieldsets[1].classList.contains("moz-print-only"));
  Assert.equal(fieldsets[1].textContent, "attachment.svg");
  const inlineContainer1 = fieldsets[1].nextElementSibling;
  Assert.equal(inlineContainer1.localName, "div");
  Assert.equal(inlineContainer1.className, "moz-attached-image-container");
  const img1 = inlineContainer1.querySelector("img.moz-attached-image");
  Assert.equal(
    img1.src,
    `${sampleEmailURI}?number=3&part=1.3&type=image/svg+xml&filename=attachment.svg`
  );

  subtestPrintedAttachmentList(fieldsets[2]);

  Services.prefs.clearUserPref("mail.inline_attachments.text");
});

/**
 * Test the inline attachments when disabled.
 */
add_task(async function testNoInlineAttachments() {
  Services.prefs.setBoolPref("mail.inline_attachments", false);

  const uri = `${sampleEmailURI}?number=4`;
  const channel = new TestMailChannel(uri);
  const input = await IOUtils.readUTF8(sampleEmailFile.path);
  const output = await convertStream(uri, channel, input);

  const document = new DOMParser().parseFromString(output, "text/html");
  const fieldsets = document.querySelectorAll(
    "fieldset.moz-mime-attachment-header"
  );
  Assert.equal(
    fieldsets.length,
    1,
    "there should only be a fieldset for the printed list"
  );

  subtestPrintedAttachmentList(fieldsets[0]);

  Services.prefs.clearUserPref("mail.inline_attachments");
});

/**
 * @param {HTMLFieldSetElement} fieldset
 */
function subtestPrintedAttachmentList(fieldset) {
  Assert.ok(fieldset.classList.contains("moz-print-only"));
  Assert.equal(fieldset.textContent, "Attachments:");
  const listContainer = fieldset.nextElementSibling;
  Assert.equal(listContainer.localName, "div");
  Assert.equal(
    listContainer.className,
    "moz-mime-attachment-wrap moz-print-only"
  );
  const table = listContainer.querySelector("table");
  Assert.equal(table.tBodies[0].rows.length, 2);
  Assert.equal(table.tBodies[0].rows[0].cells[0].textContent, "attachment.txt");
  Assert.equal(table.tBodies[0].rows[0].cells[1].textContent, "51 bytes");
  Assert.equal(table.tBodies[0].rows[1].cells[0].textContent, "attachment.svg");
  Assert.equal(table.tBodies[0].rows[1].cells[1].textContent, "474 bytes");
}
