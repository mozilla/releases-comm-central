/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailProtocolHandler"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  EnigmailURIs: "chrome://openpgp/content/modules/uris.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID =
  "@mozilla.org/network/protocol;1?name=enigmail";
const NS_ENIGMAILPROTOCOLHANDLER_CID = Components.ID(
  "{847b3a11-7ab1-11d4-8f02-006008948af5}"
);

const nsIProtocolHandler = Ci.nsIProtocolHandler;

var EC = EnigmailCore;

const gDummyPKCS7 =
  'Content-Type: multipart/mixed;\r\n boundary="------------060503030402050102040303\r\n\r\nThis is a multi-part message in MIME format.\r\n--------------060503030402050102040303\r\nContent-Type: application/x-pkcs7-mime\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303\r\nContent-Type: application/x-enigmail-dummy\r\nContent-Transfer-Encoding: 8bit\r\n\r\n\r\n--------------060503030402050102040303--\r\n';

function EnigmailProtocolHandler() {}

EnigmailProtocolHandler.prototype = {
  classDescription: "Enigmail Protocol Handler",
  classID: NS_ENIGMAILPROTOCOLHANDLER_CID,
  contractID: NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID,
  scheme: "enigmail",
  defaultPort: -1,
  protocolFlags:
    nsIProtocolHandler.URI_INHERITS_SECURITY_CONTEXT |
    nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
    nsIProtocolHandler.URI_NORELATIVE |
    nsIProtocolHandler.URI_NOAUTH |
    nsIProtocolHandler.URI_OPENING_EXECUTES_SCRIPT,

  QueryInterface: ChromeUtils.generateQI(["nsIProtocolHandler"]),

  newURI(aSpec, originCharset, aBaseURI) {
    EnigmailLog.DEBUG(
      "protocolHandler.jsm: EnigmailProtocolHandler.newURI: aSpec='" +
        aSpec +
        "'\n"
    );

    // cut of any parameters potentially added to the URI; these cannot be handled
    if (aSpec.substr(0, 14) == "enigmail:dummy") {
      aSpec = "enigmail:dummy";
    }

    let uri;

    try {
      uri = Cc["@mozilla.org/network/simple-uri;1"].createInstance(Ci.nsIURI);
    } catch (x) {
      uri = NetUtil.newURI("data:text/plain,enigmail");
    }

    aSpec = aSpec.substr(9);
    let i = aSpec.indexOf("?");
    uri = uri
      .mutate()
      .setScheme("enigmail")
      .finalize();
    if (i >= 0) {
      uri = uri
        .mutate()
        .setQuery(aSpec.substr(i + 1))
        .finalize();
      uri = uri
        .mutate()
        .setPathQueryRef(aSpec.substr(0, i))
        .finalize();
    } else {
      uri = uri
        .mutate()
        .setPathQueryRef(aSpec)
        .finalize();
    }

    return uri;
  },

  handleMimeMessage(messageId) {
    //        EnigmailLog.DEBUG("protocolHandler.jsm: EnigmailProtocolHandler.handleMimeMessage: messageURL="+messageUriObj.originalUrl+", content length="+contentData.length+", "+contentType+", "+contentCharset+"\n");
    EnigmailLog.DEBUG(
      "protocolHandler.jsm: EnigmailProtocolHandler.handleMimeMessage: messageURL=, content length=, , \n"
    );
  },

  allowPort(port, scheme) {
    // non-standard ports are not allowed
    return false;
  },
};
