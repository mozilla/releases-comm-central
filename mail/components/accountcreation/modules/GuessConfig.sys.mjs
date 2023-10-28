/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const {
  Abortable,
  alertPrompt,
  assert,
  CancelledException,
  ddump,
  deepCopy,
  Exception,
  gAccountSetupLogger,
  getStringBundle,
  NotReached,
  UserCancelledException,
} = AccountCreationUtils;

/**
 * Try to guess the config, by:
 * - guessing hostnames (pop3.<domain>, pop.<domain>, imap.<domain>,
 *                       mail.<domain> etc.)
 * - probing known ports (for IMAP, POP3 etc., with SSL, STARTTLS etc.)
 * - opening a connection via the right protocol and checking the
 *   protocol-specific CAPABILITIES like that the server returns.
 *
 * Final verification is not done here, but in verifyConfig().
 *
 * This function is async.
 *
 * @param domain {String} the domain part of the email address
 * @param progressCallback {function(type, hostname, port, socketType, done)}
 *   Called when we try a new hostname/port.
 *   type {String-enum} @see AccountConfig type - "imap", "pop3", "smtp"
 *   hostname {String}
 *   port {Integer}
 *   socketType {nsMsgSocketType} @see MailNewsTypes2.idl
 *      0 = plain, 2 = STARTTLS, 3 = SSL
 *   done {Boolean}   false, if we start probing this host/port, true if we're
 *       done and the host is good.  (there is no notification when a host is
 *       bad, we'll just tell about the next host tried)
 * @param successCallback {function(config {AccountConfig})}
 *   Called when we could guess the config.
 *   param accountConfig {AccountConfig} The guessed account config.
 *       username, password, realname, emailaddress etc. are not filled out,
 *       but placeholders to be filled out via replaceVariables().
 * @param errorCallback function(ex)
 *   Called when we could guess not the config, either
 *   because we have not found anything or
 *   because there was an error (e.g. no network connection).
 *   The ex.message will contain a user-presentable message.
 * @param resultConfig {AccountConfig} (optional)
 *   A config which may be partially filled in. If so, it will be used as base
 *   for the guess.
 * @param which {String-enum} (optional)  "incoming", "outgoing", or "both".
 *   Default "both". Whether to guess only the incoming or outgoing server.
 * @result {Abortable} Allows you to cancel the guess
 */
function guessConfig(
  domain,
  progressCallback,
  successCallback,
  errorCallback,
  resultConfig,
  which
) {
  assert(typeof progressCallback == "function", "need progressCallback");
  assert(typeof successCallback == "function", "need successCallback");
  assert(typeof errorCallback == "function", "need errorCallback");

  // Servers that we know enough that they support OAuth2 do not need guessing.
  if (resultConfig.incoming.auth == Ci.nsMsgAuthMethod.OAuth2) {
    successCallback(resultConfig);
    return new Abortable();
  }

  if (!resultConfig) {
    resultConfig = new lazy.AccountConfig();
  }
  resultConfig.source = lazy.AccountConfig.kSourceGuess;

  if (!which) {
    which = "both";
  }

  if (!Services.prefs.getBoolPref("mailnews.auto_config.guess.enabled")) {
    errorCallback("Guessing config disabled per user preference");
    return new Abortable();
  }

  var incomingHostDetector = null;
  var outgoingHostDetector = null;
  var incomingEx = null; // if incoming had error, store ex here
  var outgoingEx = null; // if incoming had error, store ex here
  var incomingDone = which == "outgoing";
  var outgoingDone = which == "incoming";
  // If we're offline, we're going to pick the most common settings.
  // (Not the "best" settings, but common).
  if (Services.io.offline) {
    // TODO: don't do this. Bug 599173.
    resultConfig.source = lazy.AccountConfig.kSourceUser;
    resultConfig.incoming.hostname = "mail." + domain;
    resultConfig.incoming.username = resultConfig.identity.emailAddress;
    resultConfig.outgoing.username = resultConfig.identity.emailAddress;
    resultConfig.incoming.type = "imap";
    resultConfig.incoming.port = 143;
    resultConfig.incoming.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
    resultConfig.incoming.auth = Ci.nsMsgAuthMethod.passwordCleartext;
    resultConfig.outgoing.hostname = "smtp." + domain;
    resultConfig.outgoing.socketType = Ci.nsMsgSocketType.alwaysSTARTTLS;
    resultConfig.outgoing.port = 587;
    resultConfig.outgoing.auth = Ci.nsMsgAuthMethod.passwordCleartext;
    resultConfig.incomingAlternatives.push({
      hostname: "mail." + domain,
      username: resultConfig.identity.emailAddress,
      type: "pop3",
      port: 110,
      socketType: Ci.nsMsgSocketType.alwaysSTARTTLS,
      auth: Ci.nsMsgAuthMethod.passwordCleartext,
    });
    successCallback(resultConfig);
    return new Abortable();
  }
  var progress = function (thisTry) {
    progressCallback(
      protocolToString(thisTry.protocol),
      thisTry.hostname,
      thisTry.port,
      thisTry.socketType,
      false,
      resultConfig
    );
  };

  var checkDone = function () {
    if (incomingEx) {
      try {
        errorCallback(incomingEx, resultConfig);
      } catch (e) {
        console.error(e);
        alertPrompt("Error in errorCallback for guessConfig()", e);
      }
      return;
    }
    if (outgoingEx) {
      try {
        errorCallback(outgoingEx, resultConfig);
      } catch (e) {
        console.error(e);
        alertPrompt("Error in errorCallback for guessConfig()", e);
      }
      return;
    }
    if (incomingDone && outgoingDone) {
      try {
        successCallback(resultConfig);
      } catch (e) {
        try {
          errorCallback(e);
        } catch (e) {
          console.error(e);
          alertPrompt("Error in errorCallback for guessConfig()", e);
        }
      }
    }
  };

  var logger = gAccountSetupLogger;
  var HostTryToAccountServer = function (thisTry, server) {
    server.type = protocolToString(thisTry.protocol);
    server.hostname = thisTry.hostname;
    server.port = thisTry.port;
    server.socketType = thisTry.socketType;
    server.auth =
      thisTry.authMethod || chooseBestAuthMethod(thisTry.authMethods);
    server.authAlternatives = thisTry.authMethods;
    // TODO
    // cert is also bad when targetSite is set. (Same below for incoming.)
    // Fix SSLErrorHandler and security warning dialog in accountSetup.js.
    server.badCert = thisTry.selfSignedCert;
    server.targetSite = thisTry.targetSite;
    logger.info(
      "CHOOSING " +
        server.type +
        " " +
        server.hostname +
        ":" +
        server.port +
        ", auth method " +
        server.auth +
        (server.authAlternatives.length
          ? " " + server.authAlternatives.join(",")
          : "") +
        ", socketType " +
        server.socketType +
        (server.badCert ? " (bad cert!)" : "")
    );
  };

  var outgoingSuccess = function (thisTry, alternativeTries) {
    assert(thisTry.protocol == SMTP, "I only know SMTP for outgoing");
    // Ensure there are no previously saved outgoing errors, if we've got
    // success here.
    outgoingEx = null;
    HostTryToAccountServer(thisTry, resultConfig.outgoing);

    for (const alternativeTry of alternativeTries) {
      // resultConfig.createNewOutgoing(); misses username etc., so copy
      const altServer = deepCopy(resultConfig.outgoing);
      HostTryToAccountServer(alternativeTry, altServer);
      assert(resultConfig.outgoingAlternatives);
      resultConfig.outgoingAlternatives.push(altServer);
    }

    progressCallback(
      resultConfig.outgoing.type,
      resultConfig.outgoing.hostname,
      resultConfig.outgoing.port,
      resultConfig.outgoing.socketType,
      true,
      resultConfig
    );
    outgoingDone = true;
    checkDone();
  };

  var incomingSuccess = function (thisTry, alternativeTries) {
    // Ensure there are no previously saved incoming errors, if we've got
    // success here.
    incomingEx = null;
    HostTryToAccountServer(thisTry, resultConfig.incoming);

    for (const alternativeTry of alternativeTries) {
      // resultConfig.createNewIncoming(); misses username etc., so copy
      const altServer = deepCopy(resultConfig.incoming);
      HostTryToAccountServer(alternativeTry, altServer);
      assert(resultConfig.incomingAlternatives);
      resultConfig.incomingAlternatives.push(altServer);
    }

    progressCallback(
      resultConfig.incoming.type,
      resultConfig.incoming.hostname,
      resultConfig.incoming.port,
      resultConfig.incoming.socketType,
      true,
      resultConfig
    );
    incomingDone = true;
    checkDone();
  };

  var incomingError = function (ex) {
    incomingEx = ex;
    checkDone();
    incomingHostDetector.cancel(new CancelOthersException());
    outgoingHostDetector.cancel(new CancelOthersException());
  };

  var outgoingError = function (ex) {
    outgoingEx = ex;
    checkDone();
    incomingHostDetector.cancel(new CancelOthersException());
    outgoingHostDetector.cancel(new CancelOthersException());
  };

  incomingHostDetector = new IncomingHostDetector(
    progress,
    incomingSuccess,
    incomingError
  );
  outgoingHostDetector = new OutgoingHostDetector(
    progress,
    outgoingSuccess,
    outgoingError
  );
  if (which == "incoming" || which == "both") {
    incomingHostDetector.start(
      resultConfig.incoming.hostname ? resultConfig.incoming.hostname : domain,
      !!resultConfig.incoming.hostname,
      resultConfig.incoming.type,
      resultConfig.incoming.port,
      resultConfig.incoming.socketType,
      resultConfig.incoming.auth
    );
  }
  if (which == "outgoing" || which == "both") {
    outgoingHostDetector.start(
      resultConfig.outgoing.hostname ? resultConfig.outgoing.hostname : domain,
      !!resultConfig.outgoing.hostname,
      "smtp",
      resultConfig.outgoing.port,
      resultConfig.outgoing.socketType,
      resultConfig.outgoing.auth
    );
  }

  return new GuessAbortable(incomingHostDetector, outgoingHostDetector);
}

function GuessAbortable(incomingHostDetector, outgoingHostDetector) {
  Abortable.call(this);
  this._incomingHostDetector = incomingHostDetector;
  this._outgoingHostDetector = outgoingHostDetector;
}
GuessAbortable.prototype = Object.create(Abortable.prototype);
GuessAbortable.prototype.constructor = GuessAbortable;
GuessAbortable.prototype.cancel = function (ex) {
  this._incomingHostDetector.cancel(ex);
  this._outgoingHostDetector.cancel(ex);
};

// --------------
// Implementation

// Objects, functions and constants that follow are not to be used outside
// this file.
var kNotTried = 0;
var kOngoing = 1;
var kFailed = 2;
var kSuccess = 3;

/**
 * Internal object holding one server that we should try or did try.
 * Used as |thisTry|.
 *
 * Note: The consts it uses for protocol is defined towards the end of this file
 * and not the same as those used in AccountConfig (type). (fix
 * this)
 */
function HostTry() {}
HostTry.prototype = {
  // IMAP, POP or SMTP
  protocol: UNKNOWN,
  // {String}
  hostname: undefined,
  // {Integer}
  port: undefined,
  // {nsMsgSocketType}
  socketType: UNKNOWN,
  // {String} what to send to server
  commands: null,
  // {Integer-enum} kNotTried, kOngoing, kFailed or kSuccess
  status: kNotTried,
  // {Abortable} allows to cancel the socket comm
  abortable: null,

  // {Array of {Integer-enum}} @see _advertisesAuthMethods() result
  // Info about the server, from the protocol and SSL chat
  authMethods: null,
  // {String} Whether the SSL cert is not from a proper CA
  selfSignedCert: false,
  // {String} Which host the SSL cert is made for, if not hostname.
  // If set, this is an SSL error.
  targetSite: null,
};

/**
 * When the success or errorCallbacks are called to abort the other requests
 * which happened in parallel, this ex is used as param for cancel(), so that
 * the cancel doesn't trigger another callback.
 */
function CancelOthersException() {
  CancelledException.call(this, "we're done, cancelling the other probes");
}
CancelOthersException.prototype = Object.create(CancelledException.prototype);
CancelOthersException.prototype.constructor = CancelOthersException;

/**
 * @param successCallback {function(result {HostTry}, alts {Array of HostTry})}
 *    Called when the config is OK
 *    |result| is the most preferred server.
 *    |alts| currently exists only for |IncomingHostDetector| and contains
 *    some servers of the other type (POP3 instead of IMAP), if available.
 * @param errorCallback {function(ex)} Called when we could not find a config
 * @param progressCallback { function(server {HostTry}) } Called when we tried
 *    (will try?) a new hostname and port
 */
function HostDetector(progressCallback, successCallback, errorCallback) {
  this.mSuccessCallback = successCallback;
  this.mProgressCallback = progressCallback;
  this.mErrorCallback = errorCallback;
  this._cancel = false;
  // {Array of {HostTry}}, ordered by decreasing preference
  this._hostsToTry = [];

  // init logging
  this._log = gAccountSetupLogger;
  this._log.info("created host detector");
}

HostDetector.prototype = {
  cancel(ex) {
    this._cancel = true;
    // We have to actively stop the network calls, as they may result in
    // callbacks e.g. to the cert handler. If the dialog is gone by the time
    // this happens, the javascript stack is horked.
    for (let i = 0; i < this._hostsToTry.length; i++) {
      const thisTry = this._hostsToTry[i]; // {HostTry}
      if (thisTry.abortable) {
        thisTry.abortable.cancel(ex);
      }
      thisTry.status = kFailed; // or don't set? Maybe we want to continue.
    }
    if (ex instanceof CancelOthersException) {
      return;
    }
    if (!ex) {
      ex = new CancelledException();
    }
    this.mErrorCallback(ex);
  },

  /**
   * Start the detection.
   *
   * @param {string} domain - Domain to be used as base for guessing.
   *   Should be a domain (e.g. yahoo.co.uk).
   *   If hostIsPrecise == true, it should be a full hostname.
   * @param {boolean} hostIsPrecise - If true, use only this hostname,
   *   do not guess hostnames.
   * @param {"pop3"|"imap"|"exchange"|"smtp"|""} - Account type.
   * @param {integer} port - The port to use. 0 to autodetect
   * @param {nsMsgSocketType|-1} socketType - Socket type. -1 to autodetect.
   * @param {nsMsgAuthMethod|0} authMethod - Authentication method. 0 to autodetect.
   */
  start(domain, hostIsPrecise, type, port, socketType, authMethod) {
    domain = domain.replace(/\s*/g, ""); // Remove whitespace
    if (!hostIsPrecise) {
      hostIsPrecise = false;
    }
    var protocol = lazy.Sanitizer.translate(
      type,
      { imap: IMAP, pop3: POP, smtp: SMTP },
      UNKNOWN
    );
    if (!port) {
      port = UNKNOWN;
    }
    var ssl_only = Services.prefs.getBoolPref(
      "mailnews.auto_config.guess.sslOnly"
    );
    this._cancel = false;
    this._log.info(
      `Starting ${protocol} detection on ${
        !hostIsPrecise ? "~ " : ""
      }${domain}:${port} with socketType=${socketType} and authMethod=${authMethod}`
    );

    // fill this._hostsToTry
    this._hostsToTry = [];
    var hostnamesToTry = [];
    // if hostIsPrecise is true, it's because that's what the user input
    // explicitly, and we'll just try it, nothing else.
    if (hostIsPrecise) {
      hostnamesToTry.push(domain);
    } else {
      hostnamesToTry = this._hostnamesToTry(protocol, domain);
    }

    for (let i = 0; i < hostnamesToTry.length; i++) {
      const hostname = hostnamesToTry[i];
      const hostEntries = this._portsToTry(
        hostname,
        protocol,
        socketType,
        port
      );
      for (let j = 0; j < hostEntries.length; j++) {
        const hostTry = hostEntries[j]; // from getHostEntry()
        if (ssl_only && hostTry.socketType == NONE) {
          continue;
        }
        hostTry.hostname = hostname;
        hostTry.status = kNotTried;
        hostTry.desc =
          hostTry.hostname +
          ":" +
          hostTry.port +
          " socketType=" +
          hostTry.socketType +
          " " +
          protocolToString(hostTry.protocol);
        hostTry.authMethod = authMethod;
        this._hostsToTry.push(hostTry);
      }
    }

    this._hostsToTry = sortTriesByPreference(this._hostsToTry);
    this._tryAll();
  },

  // We make all host/port combinations run in parallel, store their
  // results in an array, and as soon as one finishes successfully and all
  // higher-priority ones have failed, we abort all lower-priority ones.

  _tryAll() {
    if (this._cancel) {
      return;
    }
    var me = this;
    var timeout = Services.prefs.getIntPref(
      "mailnews.auto_config.guess.timeout"
    );
    // We assume we'll resolve the same proxy for all tries, and
    // proceed to use the first resolved proxy for all tries. This
    // assumption is generally sound, but not always: mechanisms like
    // the pref network.proxy.no_proxies_on can make imap.domain and
    // pop.domain resolve differently.
    doProxy(this._hostsToTry[0].hostname, function (proxy) {
      for (let i = 0; i < me._hostsToTry.length; i++) {
        const thisTry = me._hostsToTry[i]; // {HostTry}
        if (thisTry.status != kNotTried) {
          continue;
        }
        me._log.info(thisTry.desc + ": initializing probe...");
        if (i == 0) {
          // showing 50 servers at once is pointless
          me.mProgressCallback(thisTry);
        }

        thisTry.abortable = SocketUtil(
          thisTry.hostname,
          thisTry.port,
          thisTry.socketType,
          thisTry.commands,
          timeout,
          proxy,
          new SSLErrorHandler(thisTry, me._log),
          function (wiredata) {
            // result callback
            if (me._cancel) {
              // Don't use response anymore.
              return;
            }
            me.mProgressCallback(thisTry);
            me._processResult(thisTry, wiredata);
            me._checkFinished();
          },
          function (e) {
            // error callback
            if (me._cancel) {
              // Who set cancel to true already called mErrorCallback().
              return;
            }
            me._log.warn(thisTry.desc + ": " + e);
            thisTry.status = kFailed;
            me._checkFinished();
          }
        );
        thisTry.status = kOngoing;
      }
    });
  },

  /**
   * @param {HostTry} thisTry
   * @param {string[]} wiredata - What the server returned in response to our protocol chat.
   */
  _processResult(thisTry, wiredata) {
    if (thisTry._gotCertError) {
      if (thisTry._gotCertError == Ci.nsICertOverrideService.ERROR_MISMATCH) {
        thisTry._gotCertError = 0;
        thisTry.status = kFailed;
        return;
      }

      if (
        thisTry._gotCertError == Ci.nsICertOverrideService.ERROR_UNTRUSTED ||
        thisTry._gotCertError == Ci.nsICertOverrideService.ERROR_TIME
      ) {
        this._log.info(
          thisTry.desc + ": TRYING AGAIN, hopefully with exception recorded"
        );
        thisTry._gotCertError = 0;
        thisTry.selfSignedCert = true; // _next_ run gets this exception
        thisTry.status = kNotTried; // try again (with exception)
        this._tryAll();
        return;
      }
    }

    if (wiredata == null || wiredata === undefined) {
      this._log.info(thisTry.desc + ": no data");
      thisTry.status = kFailed;
      return;
    }
    this._log.info(thisTry.desc + ": wiredata: " + wiredata.join(""));
    thisTry.authMethods = this._advertisesAuthMethods(
      thisTry.protocol,
      wiredata
    );
    if (
      thisTry.socketType == STARTTLS &&
      !this._hasSTARTTLS(thisTry, wiredata)
    ) {
      this._log.info(thisTry.desc + ": STARTTLS wanted, but not offered");
      thisTry.status = kFailed;
      return;
    }
    this._log.info(
      thisTry.desc +
        ": success" +
        (thisTry.selfSignedCert ? " (selfSignedCert)" : "")
    );
    thisTry.status = kSuccess;

    if (thisTry.selfSignedCert) {
      // eh, ERROR_UNTRUSTED or ERROR_TIME
      // We clear the temporary override now after success. If we clear it
      // earlier we get into an infinite loop, probably because the cert
      // remembering is temporary and the next try gets a new connection which
      // isn't covered by that temporariness.
      this._log.info(
        thisTry.desc + ": clearing validity override for " + thisTry.hostname
      );
      Cc["@mozilla.org/security/certoverride;1"]
        .getService(Ci.nsICertOverrideService)
        .clearValidityOverride(thisTry.hostname, thisTry.port, {});
    }
  },

  _checkFinished() {
    var successfulTry = null;
    var successfulTryAlternative = null; // POP3
    var unfinishedBusiness = false;
    // this._hostsToTry is ordered by decreasing preference
    for (let i = 0; i < this._hostsToTry.length; i++) {
      const thisTry = this._hostsToTry[i];
      if (thisTry.status == kNotTried || thisTry.status == kOngoing) {
        unfinishedBusiness = true;
      } else if (thisTry.status == kSuccess && !unfinishedBusiness) {
        // thisTry is good, and all higher preference tries failed, so use this
        if (!successfulTry) {
          successfulTry = thisTry;
          if (successfulTry.protocol == SMTP) {
            break;
          }
        } else if (successfulTry.protocol != thisTry.protocol) {
          successfulTryAlternative = thisTry;
          break;
        }
      }
    }
    if (successfulTry && (successfulTryAlternative || !unfinishedBusiness)) {
      this.mSuccessCallback(
        successfulTry,
        successfulTryAlternative ? [successfulTryAlternative] : []
      );
      this.cancel(new CancelOthersException());
    } else if (!unfinishedBusiness) {
      // all failed
      this._log.info("ran out of options");
      var errorMsg = getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_find_server.error");
      this.mErrorCallback(new Exception(errorMsg));
      // no need to cancel, all failed
    }
    // else let ongoing calls continue
  },

  /**
   * Which auth mechanism the server claims to support.
   * That doesn't necessarily reflect reality, it is more an upper bound.
   *
   * @param {integer} protocol - IMAP, POP or SMTP
   * @param {string[]} capaResponse - On the wire data that the server returned.
   *   May be the full exchange or just capa.
   * @returns {nsMsgAuthMethod[]} Advertised authentication methods,
   *   in decreasing order of preference.
   *   E.g. [ nsMsgAuthMethod.GSSAPI, nsMsgAuthMethod.passwordEncrypted ]
   *   for a server that supports only Kerberos and encrypted passwords.
   */
  _advertisesAuthMethods(protocol, capaResponse) {
    // For IMAP, capabilities include e.g.:
    // "AUTH=CRAM-MD5", "AUTH=NTLM", "AUTH=GSSAPI", "AUTH=MSN", "AUTH=PLAIN"
    // for POP3, the auth mechanisms are returned in capa as the following:
    // "CRAM-MD5", "NTLM", "MSN", "GSSAPI"
    // For SMTP, EHLO will return AUTH and then a list of the
    // mechanism(s) supported, e.g.,
    // AUTH LOGIN NTLM MSN CRAM-MD5 GSSAPI
    var supported = new Set();
    var line = capaResponse.join("\n").toUpperCase();
    var prefix = "";
    if (protocol == POP) {
      prefix = "";
    } else if (protocol == IMAP) {
      prefix = "AUTH=";
    } else if (protocol == SMTP) {
      prefix = "AUTH.*";
    } else {
      throw NotReached("must pass protocol");
    }
    // add in decreasing order of preference
    if (new RegExp(prefix + "GSSAPI").test(line)) {
      supported.add(Ci.nsMsgAuthMethod.GSSAPI);
    }
    if (new RegExp(prefix + "CRAM-MD5").test(line)) {
      supported.add(Ci.nsMsgAuthMethod.passwordEncrypted);
    }
    if (new RegExp(prefix + "(NTLM|MSN)").test(line)) {
      supported.add(Ci.nsMsgAuthMethod.NTLM);
    }
    if (new RegExp(prefix + "LOGIN").test(line)) {
      supported.add(Ci.nsMsgAuthMethod.passwordCleartext);
    }
    if (new RegExp(prefix + "PLAIN").test(line)) {
      supported.add(Ci.nsMsgAuthMethod.passwordCleartext);
    }
    if (protocol != IMAP || !line.includes("LOGINDISABLED")) {
      supported.add(Ci.nsMsgAuthMethod.passwordCleartext);
    }
    // The array elements will be in the Set's order of addition.
    return Array.from(supported);
  },

  _hasSTARTTLS(thisTry, wiredata) {
    var capa = thisTry.protocol == POP ? "STLS" : "STARTTLS";
    return (
      thisTry.socketType == STARTTLS &&
      wiredata.join("").toUpperCase().includes(capa)
    );
  },
};

/**
 * @param {nsMsgAuthMethod[]} authMethods - Authentication methods to choose from.
 *   See return value of _advertisesAuthMethods()
 *   Note: the returned auth method will be removed from the array.
 * @returns {nsMsgAuthMethod} one of them, the preferred one
 * Note: this might be Kerberos, which might not actually work,
 * so you might need to try the others, too.
 */
function chooseBestAuthMethod(authMethods) {
  if (!authMethods || !authMethods.length) {
    return Ci.nsMsgAuthMethod.passwordCleartext;
  }
  return authMethods.shift(); // take first (= most preferred)
}

function IncomingHostDetector(
  progressCallback,
  successCallback,
  errorCallback
) {
  HostDetector.call(this, progressCallback, successCallback, errorCallback);
}
IncomingHostDetector.prototype = {
  __proto__: HostDetector.prototype,
  _hostnamesToTry(protocol, domain) {
    var hostnamesToTry = [];
    if (protocol != POP) {
      hostnamesToTry.push("imap." + domain);
    }
    if (protocol != IMAP) {
      hostnamesToTry.push("pop3." + domain);
      hostnamesToTry.push("pop." + domain);
    }
    hostnamesToTry.push("mail." + domain);
    hostnamesToTry.push(domain);
    return hostnamesToTry;
  },
  _portsToTry: getIncomingTryOrder,
};

function OutgoingHostDetector(
  progressCallback,
  successCallback,
  errorCallback
) {
  HostDetector.call(this, progressCallback, successCallback, errorCallback);
}
OutgoingHostDetector.prototype = {
  __proto__: HostDetector.prototype,
  _hostnamesToTry(protocol, domain) {
    var hostnamesToTry = [];
    hostnamesToTry.push("smtp." + domain);
    hostnamesToTry.push("mail." + domain);
    hostnamesToTry.push(domain);
    return hostnamesToTry;
  },
  _portsToTry: getOutgoingTryOrder,
};

// ---------------------------------------------
// Encode protocol ports and order of preference

// Protocol Types
var UNKNOWN = -1;
var IMAP = 0;
var POP = 1;
var SMTP = 2;
// Security Types
var NONE = Ci.nsMsgSocketType.plain;
var STARTTLS = Ci.nsMsgSocketType.alwaysSTARTTLS;
var SSL = Ci.nsMsgSocketType.SSL;

var IMAP_PORTS = {};
IMAP_PORTS[NONE] = 143;
IMAP_PORTS[STARTTLS] = 143;
IMAP_PORTS[SSL] = 993;

var POP_PORTS = {};
POP_PORTS[NONE] = 110;
POP_PORTS[STARTTLS] = 110;
POP_PORTS[SSL] = 995;

var SMTP_PORTS = {};
SMTP_PORTS[NONE] = 587;
SMTP_PORTS[STARTTLS] = 587;
SMTP_PORTS[SSL] = 465;

var CMDS = {};
CMDS[IMAP] = ["1 CAPABILITY\r\n", "2 LOGOUT\r\n"];
CMDS[POP] = ["CAPA\r\n", "QUIT\r\n"];
CMDS[SMTP] = ["EHLO we-guess.mozilla.org\r\n", "QUIT\r\n"];

/**
 * Sort by preference of SSL, IMAP etc.
 *
 * @param tries {Array of {HostTry}}
 * @returns {Array of {HostTry}}
 */
function sortTriesByPreference(tries) {
  return tries.sort(function (a, b) {
    // -1 = a is better; 1 = b is better; 0 = equal
    // Prefer SSL/STARTTLS above all else
    if (a.socketType != NONE && b.socketType == NONE) {
      return -1;
    }
    if (b.socketType != NONE && a.socketType == NONE) {
      return 1;
    }
    // Prefer IMAP over POP
    if (a.protocol == IMAP && b.protocol == POP) {
      return -1;
    }
    if (b.protocol == IMAP && a.protocol == POP) {
      return 1;
    }
    // Prefer SSL/TLS over STARTTLS
    if (a.socketType == SSL && b.socketType == STARTTLS) {
      return -1;
    }
    if (a.socketType == STARTTLS && b.socketType == SSL) {
      return 1;
    }
    // For hostnames, leave existing sorting, as in _hostnamesToTry()
    // For ports, leave existing sorting, as in getOutgoingTryOrder()
    return 0;
  });
}

/**
 * @returns {HostTry[]} Hosts to try.
 */
function getIncomingTryOrder(host, protocol, socketType, port) {
  var lowerCaseHost = host.toLowerCase();

  if (
    protocol == UNKNOWN &&
    (lowerCaseHost.startsWith("pop.") || lowerCaseHost.startsWith("pop3."))
  ) {
    protocol = POP;
  } else if (protocol == UNKNOWN && lowerCaseHost.startsWith("imap.")) {
    protocol = IMAP;
  }

  if (protocol != UNKNOWN) {
    if (socketType == UNKNOWN) {
      return [
        getHostEntry(protocol, STARTTLS, port),
        getHostEntry(protocol, SSL, port),
        getHostEntry(protocol, NONE, port),
      ];
    }
    return [getHostEntry(protocol, socketType, port)];
  }
  if (socketType == UNKNOWN) {
    return [
      getHostEntry(IMAP, STARTTLS, port),
      getHostEntry(IMAP, SSL, port),
      getHostEntry(POP, STARTTLS, port),
      getHostEntry(POP, SSL, port),
      getHostEntry(IMAP, NONE, port),
      getHostEntry(POP, NONE, port),
    ];
  }
  return [
    getHostEntry(IMAP, socketType, port),
    getHostEntry(POP, socketType, port),
  ];
}

/**
 * @returns {Array of {HostTry}}
 */
function getOutgoingTryOrder(host, protocol, socketType, port) {
  assert(protocol == SMTP, "need SMTP as protocol for outgoing");
  if (socketType == UNKNOWN) {
    if (port == UNKNOWN) {
      // neither SSL nor port known
      return [
        getHostEntry(SMTP, STARTTLS, UNKNOWN),
        getHostEntry(SMTP, STARTTLS, 25),
        getHostEntry(SMTP, SSL, UNKNOWN),
        getHostEntry(SMTP, NONE, UNKNOWN),
        getHostEntry(SMTP, NONE, 25),
      ];
    }
    // port known, SSL not
    return [
      getHostEntry(SMTP, STARTTLS, port),
      getHostEntry(SMTP, SSL, port),
      getHostEntry(SMTP, NONE, port),
    ];
  }
  // SSL known, port not
  if (port == UNKNOWN) {
    if (socketType == SSL) {
      return [getHostEntry(SMTP, SSL, UNKNOWN)];
    }
    return [
      getHostEntry(SMTP, socketType, UNKNOWN),
      getHostEntry(SMTP, socketType, 25),
    ];
  }
  // SSL and port known
  return [getHostEntry(SMTP, socketType, port)];
}

/**
 * @returns {HostTry} with proper default port and commands,
 *     but without hostname.
 */
function getHostEntry(protocol, socketType, port) {
  if (!port || port == UNKNOWN) {
    switch (protocol) {
      case POP:
        port = POP_PORTS[socketType];
        break;
      case IMAP:
        port = IMAP_PORTS[socketType];
        break;
      case SMTP:
        port = SMTP_PORTS[socketType];
        break;
      default:
        throw new NotReached("unsupported protocol " + protocol);
    }
  }

  var r = new HostTry();
  r.protocol = protocol;
  r.socketType = socketType;
  r.port = port;
  r.commands = CMDS[protocol];
  return r;
}

// here -> AccountConfig
function protocolToString(type) {
  if (type == IMAP) {
    return "imap";
  }
  if (type == POP) {
    return "pop3";
  }
  if (type == SMTP) {
    return "smtp";
  }
  throw new NotReached("unexpected protocol");
}

// ----------------------
// SSL cert error handler

/**
 * @param thisTry {HostTry}
 * @param logger {ConsoleAPI}
 */
function SSLErrorHandler(thisTry, logger) {
  this._try = thisTry;
  this._log = logger;
  // _ gotCertError will be set to an error code (one of those defined in
  // nsICertOverrideService)
  this._gotCertError = 0;
}
SSLErrorHandler.prototype = {
  processCertError(secInfo, targetSite) {
    this._log.error("Got Cert error for " + targetSite);

    if (!secInfo) {
      return;
    }

    const cert = secInfo.serverCert;

    const parts = targetSite.split(":");
    const host = parts[0];
    const port = parts[1];

    /* The following 2 cert problems are unfortunately common:
     * 1) hostname mismatch:
     * user is customer at a domain hoster, he owns yourname.org,
     * and the IMAP server is imap.hoster.com (but also reachable as
     * imap.yourname.org), and has a cert for imap.hoster.com.
     * 2) self-signed:
     * a company has an internal IMAP server, and it's only for
     * 30 employees, and they didn't want to buy a cert, so
     * they use a self-signed cert.
     *
     * We would like the above to pass, somehow, with user confirmation.
     * The following case should *not* pass:
     *
     * 1) MITM
     * User has @gmail.com, and an attacker is between the user and
     * the Internet and runs a man-in-the-middle (MITM) attack.
     * Attacker controls DNS and sends imap.gmail.com to his own
     * imap.attacker.com. He has either a valid, CA-issued
     * cert for imap.attacker.com, or a self-signed cert.
     * Of course, attacker.com could also be legit-sounding gmailservers.com.
     *
     * What makes it dangerous is that we (!) propose the server to the user,
     * and he cannot judge whether imap.gmailservers.com is correct or not,
     * and he will likely approve it.
     */

    if (secInfo.isDomainMismatch) {
      this._try._gotCertError = Ci.nsICertOverrideService.ERROR_MISMATCH;
    } else if (secInfo.isUntrusted) {
      // e.g. self-signed
      this._try._gotCertError = Ci.nsICertOverrideService.ERROR_UNTRUSTED;
    } else if (secInfo.isNotValidAtThisTime) {
      this._try._gotCertError = Ci.nsICertOverrideService.ERROR_TIME;
    } else {
      this._try._gotCertError = -1; // other
    }

    /* We will add a temporary cert exception here, so that
     * we can continue and connect and try.
     * But we will remove it again as soon as we close the
     * connection, in _processResult().
     * _gotCertError will serve as the marker that we
     * have to clear the override later.
     *
     * In verifyConfig(), before we send the password, we *must*
     * get another cert exception, this time with dialog to the user
     * so that he gets informed about this and can make a choice.
     */
    this._try.targetSite = targetSite;
    Cc["@mozilla.org/security/certoverride;1"]
      .getService(Ci.nsICertOverrideService)
      .rememberValidityOverride(host, port, {}, cert, true); // temporary override
    this._log.warn(`Added temporary override of bad cert for: ${host}:${port}`);
  },
};

// -----------
// Socket Util

/**
 * @param hostname {String} The DNS hostname to connect to.
 * @param port {Integer} The numeric port to connect to on the host.
 * @param socketType {nsMsgSocketType} SSL, STARTTLS or NONE
 * @param commands {Array of String}: protocol commands
 *          to send to the server.
 * @param timeout {Integer} seconds to wait for a server response, then cancel.
 * @param proxy {nsIProxyInfo} The proxy to use (or null to not use any).
 * @param sslErrorHandler {SSLErrorHandler}
 * @param resultCallback {function(wiredata)} This function will
 *            be called with the result string array from the server
 *            or null if no communication occurred.
 * @param errorCallback {function(e)}
 */
function SocketUtil(
  hostname,
  port,
  socketType,
  commands,
  timeout,
  proxy,
  sslErrorHandler,
  resultCallback,
  errorCallback
) {
  assert(commands && commands.length, "need commands");

  var index = 0; // commands[index] is next to send to server
  var initialized = false;
  var aborted = false;

  function _error(e) {
    if (aborted) {
      return;
    }
    aborted = true;
    errorCallback(e);
  }

  function timeoutFunc() {
    if (!initialized) {
      _error("timeout");
    }
  }

  // In case DNS takes too long or does not resolve or another blocking
  // issue occurs before the timeout can be set on the socket, this
  // ensures that the listener callback will be fired in a timely manner.
  // XXX There might to be some clean up needed after the timeout is fired
  // for socket and io resources.

  // The timeout value plus 2 seconds
  setTimeout(timeoutFunc, timeout * 1000 + 2000);

  var transportService = Cc[
    "@mozilla.org/network/socket-transport-service;1"
  ].getService(Ci.nsISocketTransportService);

  // @see NS_NETWORK_SOCKET_CONTRACTID_PREFIX
  var socketTypeName;
  if (socketType == SSL) {
    socketTypeName = ["ssl"];
  } else if (socketType == STARTTLS) {
    socketTypeName = ["starttls"];
  } else {
    socketTypeName = [];
  }
  var transport = transportService.createTransport(
    socketTypeName,
    hostname,
    port,
    proxy,
    null
  );

  transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_CONNECT, timeout);
  transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, timeout);

  var outstream = transport.openOutputStream(0, 0, 0);
  var stream = transport.openInputStream(0, 0, 0);
  var instream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  instream.init(stream);

  var dataListener = {
    data: [],
    onStartRequest(request) {
      try {
        initialized = true;
        if (!aborted) {
          // Send the first request
          const outputData = commands[index++];
          outstream.write(outputData, outputData.length);
        }
      } catch (e) {
        _error(e);
      }
    },
    async onStopRequest(request, status) {
      try {
        instream.close();
        outstream.close();
        // Did it fail because of a bad certificate?
        let isCertError = false;
        if (!Components.isSuccessCode(status)) {
          const nssErrorsService = Cc[
            "@mozilla.org/nss_errors_service;1"
          ].getService(Ci.nsINSSErrorsService);
          try {
            const errorType = nssErrorsService.getErrorClass(status);
            if (errorType == Ci.nsINSSErrorsService.ERROR_CLASS_BAD_CERT) {
              isCertError = true;
            }
          } catch (e) {
            // nsINSSErrorsService.getErrorClass throws if given a non-STARTTLS,
            // non-cert error, so ignore this.
          }
        }
        if (isCertError) {
          if (
            Services.prefs.getBoolPref(
              "mailnews.auto_config.guess.requireGoodCert",
              true
            )
          ) {
            gAccountSetupLogger.info(
              `Bad (overridable) certificate for ${hostname}:${port}. Set mailnews.auto_config.guess.requireGoodCert to false to allow detecting this as a valid SSL/TLS configuration`
            );
          } else {
            const socketTransport = transport.QueryInterface(
              Ci.nsISocketTransport
            );
            const secInfo =
              await socketTransport.tlsSocketControl?.asyncGetSecurityInfo();
            sslErrorHandler.processCertError(secInfo, hostname + ":" + port);
          }
        }
        resultCallback(this.data.length ? this.data : null);
      } catch (e) {
        _error(e);
      }
    },
    onDataAvailable(request, inputStream, offset, count) {
      try {
        if (!aborted) {
          const inputData = instream.read(count);
          this.data.push(inputData);
          if (index < commands.length) {
            // Send the next request to the server.
            const outputData = commands[index++];
            outstream.write(outputData, outputData.length);
          }
        }
      } catch (e) {
        _error(e);
      }
    },
  };

  try {
    var pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
      Ci.nsIInputStreamPump
    );

    pump.init(stream, 0, 0, false);
    pump.asyncRead(dataListener);
    return new SocketAbortable(transport);
  } catch (e) {
    _error(e);
  }
  return null;
}

function SocketAbortable(transport) {
  Abortable.call(this);
  assert(transport instanceof Ci.nsITransport, "need transport");
  this._transport = transport;
}
SocketAbortable.prototype = Object.create(Abortable.prototype);
SocketAbortable.prototype.constructor = UserCancelledException;
SocketAbortable.prototype.cancel = function (ex) {
  try {
    this._transport.close(Cr.NS_ERROR_ABORT);
  } catch (e) {
    ddump("canceling socket failed: " + e);
  }
};

/**
 * Resolve a proxy for some domain and expose it via a callback.
 *
 * @param hostname {String} The hostname which a proxy will be resolved for
 * @param resultCallback {function(proxyInfo)}
 *   Called after the proxy has been resolved for hostname.
 *   proxy {nsIProxyInfo} The resolved proxy, or null if none were found
 *         for hostname
 */
function doProxy(hostname, resultCallback) {
  // This implements the nsIProtocolProxyCallback interface:
  function ProxyResolveCallback() {}
  ProxyResolveCallback.prototype = {
    onProxyAvailable(req, uri, proxy, status) {
      // Anything but a SOCKS proxy will be unusable for email.
      if (proxy != null && proxy.type != "socks" && proxy.type != "socks4") {
        proxy = null;
      }
      resultCallback(proxy);
    },
  };
  var proxyService = Cc[
    "@mozilla.org/network/protocol-proxy-service;1"
  ].getService(Ci.nsIProtocolProxyService);
  // Use some arbitrary scheme just because it is required...
  var uri = Services.io.newURI("http://" + hostname);
  // ... we'll ignore it any way. We prefer SOCKS since that's the
  // only thing we can use for email protocols.
  var proxyFlags =
    Ci.nsIProtocolProxyService.RESOLVE_IGNORE_URI_SCHEME |
    Ci.nsIProtocolProxyService.RESOLVE_PREFER_SOCKS_PROXY;
  if (Services.prefs.getBoolPref("network.proxy.socks_remote_dns")) {
    proxyFlags |= Ci.nsIProtocolProxyService.RESOLVE_ALWAYS_TUNNEL;
  }
  proxyService.asyncResolve(uri, proxyFlags, new ProxyResolveCallback());
}

export const GuessConfig = {
  UNKNOWN,
  IMAP,
  POP,
  SMTP,
  NONE,
  STARTTLS,
  SSL,
  getHostEntry,
  getIncomingTryOrder,
  getOutgoingTryOrder,
  guessConfig,
};
