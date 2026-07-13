/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MockRegistrar: gMockRegistrar } = ChromeUtils.importESModule(
  "resource://testing-common/MockRegistrar.sys.mjs"
);
var { FileTestUtils: gFileTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/FileTestUtils.sys.mjs"
);

const BODY = [
  "ordinary tail",
  "valid =41",
  "soft=\r\nbreak",
  "short=\nbreak",
  "malformed =Qx",
  "incomplete =Q",
].join("\r\n");

const MESSAGE = [
  "From: sender@example.invalid",
  "To: recipient@example.invalid",
  "Subject: Quoted-printable draft",
  "MIME-Version: 1.0",
  "Content-Type: text/plain; charset=UTF-8",
  "Content-Transfer-Encoding: quoted-printable",
  "",
  BODY,
].join("\r\n");

const EXPECTED_BODY = [
  "ordinary tail",
  "valid A",
  "softbreak",
  "shortbreak",
  "malformed =Qx",
  "incomplete =Q",
].join("\n");

async function makeChannel() {
  const file = gFileTestUtils.getTempFile("quoted-printable-draft.eml");
  await IOUtils.write(file.path, new TextEncoder().encode(MESSAGE));
  const uri = Services.io.newFileURI(file);
  uri.scheme = "mailbox";
  uri.query = "number=0";
  return Services.io.newChannel(
    uri.spec,
    null,
    null,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
}

function makeStream(data) {
  const stream = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
    Ci.nsIStringInputStream
  );
  stream.setByteStringData(data);
  return stream;
}

async function convertMessage(
  chunks,
  outputType,
  outputListener = null,
  configureConverter = null
) {
  const channel = await makeChannel();
  const converter = Cc[
    "@mozilla.org/streamconv;1?from=message/rfc822&to=application/xhtml+xml"
  ].createInstance(Ci.nsIMimeStreamConverter);
  converter.setMimeOutputType(outputType);
  configureConverter?.(converter);
  converter
    .QueryInterface(Ci.nsIStreamConverter)
    .asyncConvertData(null, null, outputListener, channel);

  const listener = converter.QueryInterface(Ci.nsIStreamListener);
  listener.onStartRequest(channel);
  let offset = 0;
  for (const chunk of chunks) {
    listener.onDataAvailable(channel, makeStream(chunk), offset, chunk.length);
    offset += chunk.length;
  }
  listener.onStopRequest(channel, Cr.NS_OK);
}

async function renderMessage(chunks) {
  let output = "";
  const outputListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
    onStartRequest() {},
    onDataAvailable(request, stream, offset, count) {
      output += NetUtil.readInputStreamToString(stream, count);
    },
    onStopRequest(request, status) {
      Assert.equal(status, Cr.NS_OK, "rendering should finish successfully");
    },
  };
  await convertMessage(
    chunks,
    Ci.nsMimeOutput.nsMimeMessageBodyQuoting,
    outputListener
  );
  return output;
}

function getRenderedBody(rendered) {
  const match = /^<pre[^>]*>\n([\s\S]*)\n<\/pre>$/.exec(rendered);
  Assert.ok(match, "quoting should render the decoded message body");
  return match[1];
}

add_task(async function testQuotedPrintableChunking() {
  const rendered = await renderMessage([MESSAGE]);
  Assert.equal(
    getRenderedBody(rendered),
    EXPECTED_BODY,
    "valid escapes should decode, while invalid or incomplete escapes are emitted literally"
  );

  const bodyStart = MESSAGE.indexOf(BODY);
  const splitOffsets = new Set([bodyStart + 1, MESSAGE.length - 1]);
  for (let offset = bodyStart; offset < MESSAGE.length; offset++) {
    if (MESSAGE[offset] == "=") {
      splitOffsets.add(offset);
      splitOffsets.add(offset + 1);
      splitOffsets.add(offset + 2);
    }
  }
  for (const offset of splitOffsets) {
    const splitRendered = await renderMessage([
      MESSAGE.slice(0, offset),
      MESSAGE.slice(offset),
    ]);
    Assert.equal(
      getRenderedBody(splitRendered),
      EXPECTED_BODY,
      `decoding should not depend on a stream split at offset ${offset}`
    );
  }
});

add_task(async function testMalformedDraftCompletes() {
  let conversionStopped = false;
  const outputListener = {
    QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
    onStartRequest() {},
    onDataAvailable(request, stream, offset, count) {
      NetUtil.readInputStreamToString(stream, count);
    },
    onStopRequest(request, status) {
      Assert.equal(status, Cr.NS_OK, "draft conversion should succeed");
      conversionStopped = true;
    },
  };
  const composeCid = gMockRegistrar.register(
    "@mozilla.org/messengercompose/compose;1",
    {
      QueryInterface: ChromeUtils.generateQI(["nsIMsgCompose"]),
    }
  );
  try {
    await convertMessage(
      [MESSAGE],
      Ci.nsMimeOutput.nsMimeMessageDraftOrTemplate,
      outputListener,
      converter => {
        // Follow the filter path so draft processing hands off the body without
        // trying to open a compose window in xpcshell.
        converter.forwardInline = true;
        converter.forwardInlineFilter = true;
        converter.forwardToAddress = "recipient@example.invalid";
      }
    );
    Assert.ok(
      conversionStopped,
      "draft conversion should hand malformed body data to completion"
    );
  } finally {
    gMockRegistrar.unregister(composeCid);
  }
});
