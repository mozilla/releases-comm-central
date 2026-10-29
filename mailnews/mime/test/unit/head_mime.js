/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utility code for converting encoded MIME data.
 */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/MailTestUtils.sys.mjs"
);
var { PromiseTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/PromiseTestUtils.sys.mjs"
);
const { NetUtil } = ChromeUtils.importESModule(
  "resource://gre/modules/NetUtil.sys.mjs"
);

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

registerCleanupFunction(function () {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});

function apply_mime_conversion(msgUri, smimeSink, openpgpSink = null) {
  const service = MailServices.messageServiceFromURI(msgUri);

  // This is what we listen on in the end.
  const listener = new PromiseTestUtils.PromiseStreamListener();

  // Make the underlying channel--we need this for the converter parameter.
  const url = service.getUrlForUri(msgUri);

  const channel = Services.io
    .newChannelFromURI(
      url,
      null,
      Services.scriptSecurityManager.getSystemPrincipal(),
      null,
      Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
      Ci.nsIContentPolicy.TYPE_OTHER
    )
    .QueryInterface(Ci.nsIMailChannel);
  channel.openpgpSink = openpgpSink;
  channel.smimeSink = smimeSink;

  // Make the MIME converter, using the listener we first set up.
  const converter = Cc["@mozilla.org/streamConverters;1"]
    .getService(Ci.nsIStreamConverterService)
    .asyncConvertData("message/rfc822", "text/html", listener, channel);

  // Now load the message, run it through the converter, and wait for all the
  // data to stream through.
  channel.asyncOpen(converter);
  return listener;
}

/**
 * Stream a raw RFC822 message through the MIME converter.
 *
 * A file channel is used instead of MessageInjection because the mbox store
 * appends a newline to a body that ends mid-line.
 *
 * @param {string} raw - The complete message source.
 * @returns {Promise<string>} The rendered HTML.
 */
async function render_raw_message(raw) {
  const { FileTestUtils } = ChromeUtils.importESModule(
    "resource://testing-common/FileTestUtils.sys.mjs"
  );
  const file = FileTestUtils.getTempFile("raw.eml");
  await IOUtils.write(file.path, new TextEncoder().encode(raw));

  const listener = new PromiseTestUtils.PromiseStreamListener();
  const channel = Services.io.newChannelFromURI(
    Services.io.newFileURI(file),
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );
  const converter = Cc["@mozilla.org/streamConverters;1"]
    .getService(Ci.nsIStreamConverterService)
    .asyncConvertData("message/rfc822", "text/html", listener, channel);
  channel.asyncOpen(converter);
  return listener.promise;
}
