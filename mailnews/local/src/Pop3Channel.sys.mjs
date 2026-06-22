/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MailServices } from "resource:///modules/MailServices.sys.mjs";

/**
 * A channel to interact with POP3 server.
 *
 * @implements {nsIChannel}
 * @implements {nsIRequest}
 */
export class Pop3Channel {
  QueryInterface = ChromeUtils.generateQI(["nsIChannel", "nsIRequest"]);

  _logger = console.createInstance({
    prefix: "mailnews.pop3",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.pop3.loglevel",
  });

  /**
   * @param {nsIURI} uri - The uri to construct the channel from.
   * @param {nsILoadInfo} loadInfo - The loadInfo associated with the channel.
   */
  constructor(uri, loadInfo) {
    this._server = MailServices.accounts
      .findServerByURI(uri)
      .QueryInterface(Ci.nsIPop3IncomingServer);

    // nsIChannel attributes.
    this.originalURI = uri;
    this.URI = uri;
    this.loadInfo = loadInfo;
    this.contentLength = 0;
    this._status = Cr.NS_OK;
  }

  /**
   * @see nsIRequest
   */
  get status() {
    return this._status;
  }

  /**
   * @see nsIChannel
   */
  get contentType() {
    return this._contentType || "message/rfc822";
  }

  set contentType(value) {
    this._contentType = value;
  }

  get isDocument() {
    return true;
  }

  open() {
    throw Components.Exception(
      "Pop3Channel.open() not implemented",
      Cr.NS_ERROR_NOT_IMPLEMENTED
    );
  }

  asyncOpen(listener) {
    this._logger.debug(`asyncOpen ${this.URI.spec}`);

    if (Services.io.offline) {
      throw Components.Exception(
        "The requested action could not be completed in the offline state",
        Cr.NS_ERROR_OFFLINE
      );
    }

    // Extract uidl, optional number, and optional folderURI from the query.
    const spec = this.URI.spec;
    const uidlMatch = spec.match(/[?&]uidl=([^&]+)/);
    const uidl = decodeURIComponent(uidlMatch?.[1] || "");
    if (!uidl) {
      throw Components.Exception(
        `Unrecognized url=${spec}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }

    const numberMatch = spec.match(/[?&]number=([^&]+)/);
    const number = numberMatch ? parseInt(numberMatch[1], 10) : 0;

    // folderURI is stored raw (no percent-decoding) because getFolderForURL
    // expects the canonical percent-escaped form.
    const folderURIMatch = spec.match(/[?&]folderURI=([^&]+)/);
    if (!folderURIMatch) {
      throw Components.Exception(
        `Missing folderURI in url=${spec}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }
    const folderURI = folderURIMatch[1];
    const folder = MailServices.folderLookup.getFolderForURL(folderURI);
    if (!folder) {
      throw Components.Exception(
        `Folder not found for folderURI=${folderURI}`,
        Cr.NS_ERROR_ILLEGAL_VALUE
      );
    }

    // Create the nsIPop3Sink and configure it.
    const sink = Cc["@mozilla.org/messenger/pop3-sink;1"].createInstance(
      Ci.nsIPop3Sink
    );
    sink.popServer = this._server;
    sink.folder = folder;
    sink.buildMessageUri = true;
    if (folder.baseMessageURI) {
      sink.baseMessageUri = folder.baseMessageURI;
    }
    if (number > 0) {
      // Build origMessageUri in the form mailbox-message://folderpath#number.
      let folderPath = folder.URI;
      // Replace mailbox:// with mailbox-message: for local folders.
      if (folderPath.startsWith("mailbox:")) {
        folderPath = folderPath.replace(/^mailbox:/, "mailbox-message:");
      }
      sink.origMessageUri = folderPath + "#" + number;
    }

    this._server.wrappedJSObject.withClient(client => {
      client.runningUri = this.URI;
      client.onOpen = () => {
        listener.onStartRequest(this);
        client.fetchBodyForUidl(sink, uidl);
      };
      client.onDone = status => {
        this._status = status;
        listener.onStopRequest(this, status);
      };
    });
  }
}
