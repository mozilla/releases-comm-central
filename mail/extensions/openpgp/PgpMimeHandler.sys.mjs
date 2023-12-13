/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 *  Module for handling PGP/MIME encrypted and/or signed messages
 *  implemented as an XPCOM object
 */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailMimeDecrypt: "chrome://openpgp/content/modules/mimeDecrypt.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
});

////////////////////////////////////////////////////////////////////
// handler for PGP/MIME encrypted and PGP/MIME signed messages
// data is processed from libmime -> nsPgpMimeProxy

var gConv;
var inStream;

var gLastEncryptedUri = "";

const throwErrors = {
  onDataAvailable() {
    throw new Error("error");
  },
  onStartRequest() {
    throw new Error("error");
  },
  onStopRequest() {
    throw new Error("error");
  },
};

/**
 * UnknownProtoHandler is a default handler for unknown protocols. It ensures that the
 * signed message part is always displayed without any further action.
 */
function UnknownProtoHandler() {
  if (!gConv) {
    gConv = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
      Ci.nsIStringInputStream
    );
  }

  if (!inStream) {
    inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
      Ci.nsIScriptableInputStream
    );
  }
}

UnknownProtoHandler.prototype = {
  onStartRequest(request, ctxt) {
    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    if (!("outputDecryptedData" in this.mimeSvc)) {
      this.mimeSvc.onStartRequest(null, ctxt);
    }
    this.bound = lazy.EnigmailMime.getBoundary(this.mimeSvc.contentType);
    /*
      readMode:
        0: before message
        1: inside message
        2: after message
    */
    this.readMode = 0;
  },

  onDataAvailable(p1, p2, p3, p4) {
    this.processData(p1, p2, p3, p4);
  },

  processData(req, stream, offset, count) {
    if (count > 0) {
      inStream.init(stream);
      const data = inStream.read(count);
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

          if ("outputDecryptedData" in this.mimeSvc) {
            // TB >= 57
            this.mimeSvc.outputDecryptedData(out, out.length);
          } else {
            gConv.setData(out, out.length);
            this.mimeSvc.onDataAvailable(null, null, gConv, 0, out.length);
          }
        }
      }
    }
  },

  onStopRequest() {
    if (!("outputDecryptedData" in this.mimeSvc)) {
      this.mimeSvc.onStopRequest(null, 0);
    }
  },
};

export function PgpMimeHandler() {
  lazy.EnigmailLog.DEBUG("pgpmimeHandler.js: PgpMimeHandler()\n"); // always log this one
}

PgpMimeHandler.prototype = {
  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),
  inStream: Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  ),

  onStartRequest(request, ctxt) {
    const mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    const ct = mimeSvc.contentType;

    let uri = null;
    if ("messageURI" in mimeSvc) {
      uri = mimeSvc.messageURI;
    } else {
      uri = ctxt;
    }

    lazy.EnigmailCore.init();

    lazy.EnigmailLog.DEBUG("pgpmimeHandler.js: onStartRequest\n");
    lazy.EnigmailLog.DEBUG("pgpmimeHandler.js: ct= " + ct + "\n");

    let cth = null;

    if (ct.search(/^multipart\/encrypted/i) === 0) {
      if (uri) {
        const u = uri.QueryInterface(Ci.nsIURI);
        gLastEncryptedUri = u.spec;
      }
      // PGP/MIME encrypted message

      cth = lazy.EnigmailMimeDecrypt.newPgpMimeHandler();
    } else if (ct.search(/^multipart\/signed/i) === 0) {
      if (ct.search(/application\/pgp-signature/i) > 0) {
        // PGP/MIME signed message
        cth = lazy.EnigmailVerify.newVerifier();
      } else if (ct.search(/application\/(x-)?pkcs7-signature/i) > 0) {
        let lastUriSpec = "";
        if (uri) {
          const u = uri.QueryInterface(Ci.nsIURI);
          lastUriSpec = u.spec;
        }
        // S/MIME signed message
        if (lastUriSpec !== gLastEncryptedUri) {
          // if message is displayed then handle like S/MIME message
          return this.handleSmime(mimeSvc, uri);
        }

        // otherwise just make sure message body is returned
        cth = lazy.EnigmailVerify.newVerifier(
          "application/(x-)?pkcs7-signature"
        );
      }
    }

    if (!cth) {
      lazy.EnigmailLog.ERROR(
        "pgpmimeHandler.js: unknown protocol for content-type: " + ct + "\n"
      );
      cth = new UnknownProtoHandler();
    }

    if (cth) {
      this._onDataAvailable = cth.onDataAvailable.bind(cth);
      this._onStopRequest = cth.onStopRequest.bind(cth);
      return cth.onStartRequest(request, uri);
    }

    return null;
  },

  onDataAvailable(req, stream, offset, count) {
    if (this._onDataAvailable) {
      this._onDataAvailable(req, stream, offset, count);
    }
  },

  onStopRequest(request, status) {
    if (this._onStopRequest) {
      this._onStopRequest(request, status);
    }
    delete this._onDataAvailable;
    delete this._onStopRequest;
  },

  handleSmime(mimeSvc, uri) {
    this.contentHandler = throwErrors;

    if (uri) {
      uri = uri.QueryInterface(Ci.nsIURI);
    }

    mimeSvc.mailChannel?.smimeHeaderSink?.handleSMimeMessage(uri);
  },

  getMessengerWindow() {
    const windowManager = Services.wm;

    for (const win of windowManager.getEnumerator(null)) {
      if (win.location.href.search(/\/messenger.xhtml$/) > 0) {
        return win;
      }
    }

    return null;
  },
};
