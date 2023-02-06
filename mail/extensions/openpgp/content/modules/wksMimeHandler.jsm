/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailWksMimeHandler"];

const { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);

const lazy = {};

XPCOMUtils.defineLazyModuleGetters(lazy, {
  EnigmailConstants: "chrome://openpgp/content/modules/constants.jsm",
  EnigmailDecryption: "chrome://openpgp/content/modules/decryption.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailSingletons: "chrome://openpgp/content/modules/singletons.jsm",
  EnigmailVerify: "chrome://openpgp/content/modules/mimeVerify.jsm",
});

XPCOMUtils.defineLazyGetter(lazy, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

/**
 *  Module for handling response messages from OpenPGP Web Key Service
 */

var gDebugLog = false;

var EnigmailWksMimeHandler = {
  /***
   * register a PGP/MIME verify object the same way PGP/MIME encrypted mail is handled
   */
  registerContentTypeHandler() {
    lazy.EnigmailLog.DEBUG(
      "wksMimeHandler.jsm: registerContentTypeHandler()\n"
    );
    let reg = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);

    let pgpMimeClass = Cc["@mozilla.org/mimecth;1?type=multipart/encrypted"];

    reg.registerFactory(
      pgpMimeClass,
      "Enigmail WKD Response Handler",
      "@mozilla.org/mimecth;1?type=application/vnd.gnupg.wks",
      null
    );
  },

  newHandler() {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: newHandler()\n");

    let v = new PgpWkdHandler();
    return v;
  },
};

// MimeVerify Constructor
function PgpWkdHandler(protocol) {
  this.inStream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
}

// PgpWkdHandler implementation
PgpWkdHandler.prototype = {
  data: "",
  mimePartNumber: "",
  uri: null,
  backgroundJob: false,

  QueryInterface: ChromeUtils.generateQI(["nsIStreamListener"]),

  onStartRequest(request, ctxt) {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: onStartRequest\n"); // always log this one

    this.mimeSvc = request.QueryInterface(Ci.nsIPgpMimeProxy);
    if ("messageURI" in this.mimeSvc) {
      this.uri = this.mimeSvc.messageURI;
    } else {
      this.uri = ctxt;
    }

    if ("mimePart" in this.mimeSvc) {
      this.mimePartNumber = this.mimeSvc.mimePart;
    } else {
      this.mimePartNumber = "";
    }
    this.data = "";
    this.msgWindow = lazy.EnigmailVerify.lastWindow;
    this.backgroundJob = false;

    if (this.uri) {
      this.backgroundJob =
        this.uri.spec.search(/[&?]header=(print|quotebody)/) >= 0;
    }
  },

  onDataAvailable(req, dummy, stream, offset, count) {
    if ("messageURI" in this.mimeSvc) {
      // TB >= 67
      stream = dummy;
      count = offset;
    }

    LOCAL_DEBUG("wksMimeHandler.jsm: onDataAvailable: " + count + "\n");
    if (count > 0) {
      this.inStream.init(stream);
      let data = this.inStream.read(count);
      this.data += data;
    }
  },

  onStopRequest() {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: onStopRequest\n");

    if (this.data.search(/-----BEGIN PGP MESSAGE-----/i) >= 0) {
      this.decryptChallengeData();
    }

    let jsonStr = this.requestToJsonString(this.data);

    if (this.data.search(/^\s*type:\s+confirmation-request/im) >= 0) {
      lazy.l10n.formatValue("wkd-message-body-req").then(value => {
        this.returnData(value);
      });
    } else {
      lazy.l10n.formatValue("wkd-message-body-process").then(value => {
        this.returnData(value);
      });
    }

    this.displayStatus(jsonStr);
  },

  decryptChallengeData() {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: decryptChallengeData()\n");
    let windowManager = Services.wm;
    let win = windowManager.getMostRecentWindow(null);
    let statusFlagsObj = {};

    let res = lazy.EnigmailDecryption.decryptMessage(
      win,
      0,
      this.data,
      null, // date
      {},
      {},
      statusFlagsObj,
      {},
      {},
      {},
      {},
      {},
      {}
    );

    if (statusFlagsObj.value & lazy.EnigmailConstants.DECRYPTION_OKAY) {
      this.data = res;
    }
    lazy.EnigmailLog.DEBUG(
      "wksMimeHandler.jsm: decryptChallengeData: decryption result: " +
        res +
        "\n"
    );
  },

  // convert request data into JSON-string and parse it
  requestToJsonString() {
    // convert
    let lines = this.data.split(/\r?\n/);
    let s = "{";
    for (let l of lines) {
      let m = l.match(/^([^\s:]+)(:\s*)([^\s].+)$/);
      if (m && m.length >= 4) {
        s += '"' + m[1].trim().toLowerCase() + '": "' + m[3].trim() + '",';
      }
    }

    s = s.substr(0, s.length - 1) + "}";

    return s;
  },

  // return data to libMime
  returnData(message) {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: returnData():\n");

    let msg =
      'Content-Type: text/plain; charset="utf-8"\r\n' +
      "Content-Transfer-Encoding: 8bit\r\n\r\n" +
      message +
      "\r\n";

    if ("outputDecryptedData" in this.mimeSvc) {
      this.mimeSvc.outputDecryptedData(msg, msg.length);
    } else {
      let gConv = Cc["@mozilla.org/io/string-input-stream;1"].createInstance(
        Ci.nsIStringInputStream
      );
      gConv.setData(msg, msg.length);
      try {
        this.mimeSvc.onStartRequest(null);
        this.mimeSvc.onDataAvailable(null, gConv, 0, msg.length);
        this.mimeSvc.onStopRequest(null, 0);
      } catch (ex) {
        lazy.EnigmailLog.ERROR(
          "wksMimeHandler.jsm: returnData(): mimeSvc.onDataAvailable failed:\n" +
            ex.toString()
        );
      }
    }
  },

  displayStatus(jsonStr) {
    lazy.EnigmailLog.DEBUG("wksMimeHandler.jsm: displayStatus\n");
    if (this.msgWindow === null || this.backgroundJob) {
      return;
    }

    try {
      LOCAL_DEBUG("wksMimeHandler.jsm: displayStatus displaying result\n");
      let headerSink = lazy.EnigmailSingletons.messageReader;

      if (headerSink) {
        headerSink.processDecryptionResult(
          this.uri,
          "wksConfirmRequest",
          jsonStr,
          this.mimePartNumber
        );
      }
    } catch (ex) {
      lazy.EnigmailLog.writeException("wksMimeHandler.jsm", ex);
    }
  },
};

////////////////////////////////////////////////////////////////////
// General-purpose functions, not exported

function LOCAL_DEBUG(str) {
  if (gDebugLog) {
    lazy.EnigmailLog.DEBUG(str);
  }
}

function initModule() {
  let nspr_log_modules = Services.env.get("NSPR_LOG_MODULES");
  let matches = nspr_log_modules.match(/wksMimeHandler:(\d+)/);

  if (matches && matches.length > 1) {
    if (matches[1] > 2) {
      gDebugLog = true;
    }
  }
}

initModule();
