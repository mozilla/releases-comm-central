/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Module for handling PGP/MIME encrypted and/or signed messages
 * implemented as an XPCOM object.
 * Data is processed from libmime -> nsPgpMimeProxy.
 */

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  MimeDecryptHandler: "chrome://openpgp/content/modules/mimeDecrypt.sys.mjs",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.sys.mjs",
});

/**
 * @implements {nsIStreamListener}
 */
export class PgpMimeHandler {
  QueryInterface = ChromeUtils.generateQI(["nsIStreamListener"]);

  /**
   * @param {nsIRequest} request
   */
  onStartRequest(request) {
    const proxy = request.QueryInterface(Ci.nsIPgpMimeProxy);
    const ct = proxy.contentType;
    const uri = proxy.messageURI;

    let cth;
    if (ct.search(/^multipart\/encrypted/i) === 0) {
      // PGP/MIME encrypted message
      cth = new lazy.MimeDecryptHandler();
    } else if (ct.search(/application\/pgp-signature/i) > 0) {
      // PGP/MIME signed message
      cth = lazy.EnigmailVerify.newVerifier();
    } else {
      // mime_find_class() sends only multipart/encrypted and OpenPGP signed
      // parts here.
      throw Components.Exception(
        `Unexpected content type: ${ct}`,
        Cr.NS_ERROR_UNEXPECTED
      );
    }

    this._onDataAvailable = cth.onDataAvailable.bind(cth);
    this._onStopRequest = cth.onStopRequest.bind(cth);
    cth.onStartRequest(request, uri);
  }

  /**
   * @param {nsIRequest} request
   * @param {integer} status
   */
  onStopRequest(request, status) {
    if (this._onStopRequest) {
      this._onStopRequest(request, status);
    }
    delete this._onDataAvailable;
    delete this._onStopRequest;
  }

  /**
   * @param {nsIRequest} req
   * @param {nsIInputStream} stream
   * @param {integer} offset
   * @param {integer} count
   */
  onDataAvailable(req, stream, offset, count) {
    if (this._onDataAvailable) {
      this._onDataAvailable(req, stream, offset, count);
    }
  }
}
