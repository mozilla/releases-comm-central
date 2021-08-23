/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var EXPORTED_SYMBOLS = ["NewsProtocolHandler", "SnewsProtocolHandler"];

var { NntpChannel } = ChromeUtils.import("resource:///modules/NntpChannel.jsm");

/**
 * A factory to create protocol handler.
 * @param {string} scheme - The scheme of the protocol.
 * @param {number} defaultPort - The default port of the protocol.
 * @param {string} cid - The interface id of the created protocol handler.
 */
function makeProtocolHandler(scheme, defaultPort, cid) {
  return {
    QueryInterface: ChromeUtils.generateQI(["nsIProtocolHandler"]),
    classID: Components.ID(cid),

    scheme,
    defaultPort,
    protocolFlags:
      Ci.nsIProtocolHandler.URI_NORELATIVE |
      Ci.nsIProtocolHandler.URI_FORBIDS_AUTOMATIC_DOCUMENT_REPLACEMENT |
      Ci.nsIProtocolHandler.URI_LOADABLE_BY_ANYONE |
      Ci.nsIProtocolHandler.ALLOWS_PROXY |
      Ci.nsIProtocolHandler.URI_FORBIDS_COOKIE_ACCESS |
      Ci.nsIProtocolHandler.ORIGIN_IS_FULL_SPEC,

    newChannel(uri, loadInfo) {
      let channel = new NntpChannel(uri, loadInfo);
      let spec = uri.spec;
      if (
        spec.includes("part=") &&
        !spec.includes("type=message/rfc822") &&
        !spec.includes("type=application/x-message-display") &&
        !spec.includes("type=application/pdf")
      ) {
        channel.contentDisposition = Ci.nsIChannel.DISPOSITION_ATTACHMENT;
      } else {
        channel.contentDisposition = Ci.nsIChannel.DISPOSITION_INLINE;
      }
      return channel;
    },

    allowPort(port, scheme) {
      return true;
    },
  };
}

function NewsProtocolHandler() {}

NewsProtocolHandler.prototype = makeProtocolHandler(
  "news",
  Ci.nsINntpUrl.DEFAULT_NNTP_PORT,
  "{24220ecd-cb05-4676-8a47-fa1da7b86e6e}"
);

function SnewsProtocolHandler() {}

SnewsProtocolHandler.prototype = makeProtocolHandler(
  "snews",
  Ci.nsINntpUrl.DEFAULT_NNTPS_PORT,
  "{1895016d-5302-46a9-b3f5-9c47694d9eca}"
);
