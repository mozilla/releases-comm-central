/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utility code for converting encoded MIME data.
 */

var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
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
