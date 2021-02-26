/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Utility code for converting encoded MIME data.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);
var { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
var { mailTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/MailTestUtils.jsm"
);
var { PromiseTestUtils } = ChromeUtils.import(
  "resource://testing-common/mailnews/PromiseTestUtils.jsm"
);
const { NetUtil } = ChromeUtils.import("resource://gre/modules/NetUtil.jsm");

var CC = Components.Constructor;

// Ensure the profile directory is set up
do_get_profile();

var gDEPTH = "../../../../";

registerCleanupFunction(function() {
  load(gDEPTH + "mailnews/resources/mailShutdown.js");
});

class DummyMsgHeader {
  constructor() {
    this.mProperties = {};
    this.messageSize = 0;
    this.recipients = null;
    this.from = null;
    this.subject = "";
    this.ccList = null;
    this.messageId = null;
    this.listPost = null;
    this.date = 0;
    this.accountKey = "";
    this.flags = 0;
    this.folder = null;
  }
  getStringProperty(aProperty) {
    return this.mProperties[aProperty];
  }
  setStringProperty(aProperty, aVal) {
    this.mProperties[aProperty] = aVal;
  }
  getUint32Property(aProperty) {
    if (aProperty in this.mProperties) {
      return parseInt(this.mProperties[aProperty]);
    }
    return 0;
  }
  setUint32Property(aProperty, aVal) {
    this.mProperties[aProperty] = aVal.toString();
  }
  markHasAttachments(hasAttachments) {}
  get mime2DecodedSubject() {
    return this.subject;
  }
}

function apply_mime_conversion(msgUri, headerSink = {}, msgWindow = undefined) {
  let stubHeaderSink = {
    processHeaders(aHeaderNames, aHeaderValues, dontCollectAddress) {},
    handleAttachment(contentType, url, displayName, uri, aNotDownloaded) {},
    addAttachmentField(field, value) {},
    onEndAllAttachments() {},
    onEndMsgHeaders(url) {},
    onEndMsgDownload(url) {},
    securityInfo: null,
    onMsgHasRemoteContent(aMsgHdr, aContentURI) {},
    dummyMsgHeader: new DummyMsgHeader(),
    get properties() {
      return null;
    },
    resetProperties() {},
    QueryInterface: ChromeUtils.generateQI(["nsIMsgHeaderSink"]),
  };

  // Copy the descriptors from headerSink to stubHeaderSink.
  let fullHeaderSink = Object.create(headerSink);
  for (let name of Object.getOwnPropertyNames(stubHeaderSink)) {
    if (!(name in headerSink)) {
      Object.defineProperty(
        fullHeaderSink,
        name,
        Object.getOwnPropertyDescriptor(stubHeaderSink, name)
      );
    }
  }

  msgWindow =
    msgWindow ||
    Cc["@mozilla.org/messenger/msgwindow;1"].createInstance(Ci.nsIMsgWindow);

  msgWindow.msgHeaderSink = fullHeaderSink;

  let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
    Ci.nsIMessenger
  );
  let service = messenger.messageServiceFromURI(msgUri);

  // This is what we listen on in the end.
  let listener = new PromiseTestUtils.PromiseStreamListener();

  // Make the underlying channel--we need this for the converter parameter.
  let url = service.getUrlForUri(msgUri, msgWindow);

  let channel = Services.io.newChannelFromURI(
    url,
    null,
    Services.scriptSecurityManager.getSystemPrincipal(),
    null,
    Ci.nsILoadInfo.SEC_ALLOW_CROSS_ORIGIN_SEC_CONTEXT_IS_NULL,
    Ci.nsIContentPolicy.TYPE_OTHER
  );

  // Make the MIME converter, using the listener we first set up.
  let converter = Cc["@mozilla.org/streamConverters;1"]
    .getService(Ci.nsIStreamConverterService)
    .asyncConvertData("message/rfc822", "text/html", listener, channel);

  // Now load the message, run it through the converter, and wait for all the
  // data to stream through.
  channel.asyncOpen(converter);
  return listener;
}
