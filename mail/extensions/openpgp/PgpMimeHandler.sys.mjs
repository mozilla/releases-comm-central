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
  EnigmailCore: "chrome://openpgp/content/modules/core.sys.mjs",
  EnigmailMime: "chrome://openpgp/content/modules/mime.sys.mjs",
  EnigmailMimeDecrypt: "chrome://openpgp/content/modules/mimeDecrypt.sys.mjs",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.sys.mjs",
});

var log = console.createInstance({
  prefix: "openpgp",
  maxLogLevel: "Warn",
  maxLogLevelPref: "openpgp.loglevel",
});

var gLastEncryptedUri = "";

/**
 * UnknownProtoHandler is a default handler for unknown protocols. It ensures
 * that the signed message part is always displayed without any further action.
 */
class UnknownProtoHandler {
  constructor() {
    this.inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
  }

  onStartRequest(request) {
    this.proxy = request.QueryInterface(Ci.nsIPgpMimeProxy);
    this.bound = lazy.EnigmailMime.getBoundary(this.proxy.contentType);
    /*
      readMode:
        0: before message
        1: inside message
        2: after message
    */
    this.readMode = 0;
  }

  onStopRequest() {}

  onDataAvailable(p1, p2, p3, p4) {
    this.processData(p1, p2, p3, p4);
  }

  /**
   * @param {nsIRequest} req
   * @param {nsIInputStream} stream
   * @param {integer} offset
   * @param {integer} count
   */
  processData(req, stream, offset, count) {
    if (count > 0) {
      this.inStream.init(stream);
      const data = this.inStream.read(count);
      const l = data.replace(/\r\n/g, "\n").split(/\n/);

      if (data.search(/\n$/) >= 0) {
        l.pop();
      }

      let startIndex = 0;
      let endIndex = l.length;

      if (this.readMode < 2) {
        for (let i = 0; i < l.length; i++) {
          if (l[i].indexOf("--") === 0 && l[i].indexOf(this.bound) === 2) {
            ++this.readMode;
            if (this.readMode === 1) {
              startIndex = i + 1;
            } else if (this.readMode === 2) {
              endIndex = i - 1;
            }
          }
        }

        if (this.readMode >= 1 && startIndex < l.length) {
          const out = l.slice(startIndex, endIndex).join("\n") + "\n";
          this.proxy.outputDecryptedData(out, out.length);
        }
      }
    }
  }
}

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

    lazy.EnigmailCore.init();

    let cth = null;
    if (ct.search(/^multipart\/encrypted/i) === 0) {
      if (uri) {
        gLastEncryptedUri = uri.spec;
      }
      // PGP/MIME encrypted message

      cth = lazy.EnigmailMimeDecrypt.newPgpMimeHandler();
    } else if (ct.search(/^multipart\/signed/i) === 0) {
      if (ct.search(/application\/pgp-signature/i) > 0) {
        // PGP/MIME signed message
        cth = lazy.EnigmailVerify.newVerifier();
      } else if (ct.search(/application\/(x-)?pkcs7-signature/i) > 0) {
        // S/MIME signed message
        if (uri.spec !== gLastEncryptedUri) {
          // if message is displayed then handle like S/MIME message
          this.handleSmime(proxy, uri);
          return;
        }

        // otherwise just make sure message body is returned
        cth = lazy.EnigmailVerify.newVerifier(
          "application/(x-)?pkcs7-signature"
        );
      }
    }

    if (!cth) {
      log.warn(`Unknown protocol: ${ct}`);
      cth = new UnknownProtoHandler();
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

  /**
   * @param {sIPgpMimeProxy} proxy
   * @param {nsIURI} uri
   */
  handleSmime(proxy, uri) {
    this.contentHandler = {
      onDataAvailable() {
        throw new Error("handleSmime error");
      },
      onStartRequest() {
        throw new Error("handleSmime error");
      },
      onStopRequest() {
        throw new Error("handleSmime error");
      },
    };
    proxy.mailChannel?.openpgpSink?.handleSMimeMessage(uri.spec);
  }
}
