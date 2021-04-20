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
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  NetUtil: "resource://gre/modules/NetUtil.jsm",
});

const NS_ENIGMAILPROTOCOLHANDLER_CONTRACTID =
  "@mozilla.org/network/protocol;1?name=enigmail";
const NS_ENIGMAILPROTOCOLHANDLER_CID = Components.ID(
  "{847b3a11-7ab1-11d4-8f02-006008948af5}"
);

const nsIProtocolHandler = Ci.nsIProtocolHandler;

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
