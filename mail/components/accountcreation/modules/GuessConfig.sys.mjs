/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AccountCreationUtils } from "resource:///modules/accountcreation/AccountCreationUtils.sys.mjs";
import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  AccountConfig: "resource:///modules/accountcreation/AccountConfig.sys.mjs",
  Sanitizer: "resource:///modules/accountcreation/Sanitizer.sys.mjs",
});
XPCOMUtils.defineLazyServiceGetter(
  lazy,
  "nssErrorsService",
  "@mozilla.org/nss_errors_service;1",
  Ci.nsINSSErrorsService
);

import { setTimeout } from "resource://gre/modules/Timer.sys.mjs";

const {
  assert,
  CancelledException,
  deepCopy,
  gAccountSetupLogger,
  getStringBundle,
  NotReached,
  abortSignalTimeout,
  abortableTimeout,
} = AccountCreationUtils;

// Constants that follow are not to be used outside this file.
const kNotTried = 0;
const kOngoing = 1;
const kFailed = 2;
const kSuccess = 3;

// Protocol Types
const UNKNOWN = -1;
const IMAP = 0;
const POP = 1;
const SMTP = 2;

const IMAP_PORTS = {
  [Ci.nsMsgSocketType.plain]: 143,
  [Ci.nsMsgSocketType.alwaysSTARTTLS]: 143,
  [Ci.nsMsgSocketType.SSL]: 993,
};

const POP_PORTS = {
  [Ci.nsMsgSocketType.plain]: 110,
  [Ci.nsMsgSocketType.alwaysSTARTTLS]: 110,
  [Ci.nsMsgSocketType.SSL]: 995,
};

const SMTP_PORTS = {
  [Ci.nsMsgSocketType.plain]: 587,
  [Ci.nsMsgSocketType.alwaysSTARTTLS]: 587,
  [Ci.nsMsgSocketType.SSL]: 465,
};

const CMDS = {
  [IMAP]: ["1 CAPABILITY\r\n", "2 LOGOUT\r\n"],
  [POP]: ["CAPA\r\n", "QUIT\r\n"],
  [SMTP]: ["EHLO we-guess.mozilla.org\r\n", "QUIT\r\n"],
};

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
 * @param {string} domain - The domain part of the email address.
 * @param {function(string,string,integer,nsMsgSocketType,boolean):void} progressCallback - A function: {function(type, hostname, port, socketType, done)}
 *   Called when we try a new hostname/port.
 *   - type {String-enum} @see AccountConfig type - "imap", "pop3", "smtp"
 *   - hostname {String}
 *   - port {Integer}
 *   - socketType {nsMsgSocketType} @see MailNewsTypes2.idl
 *      0 = plain, 2 = STARTTLS, 3 = SSL
 *   - done {Boolean} - false, if we start probing this host/port, true if we're
 *       done and the host is good.  (there is no notification when a host is
 *       bad, we'll just tell about the next host tried)
 * @param {AccountConfig} [resultConfig] - A config which may be partially
 *   filled in. If so, it will be used as base for the guess.
 * @param {"incoming"|"outgoing"|"both"} [which="both"] - Whether to guess only
 *   the incoming or outgoing server.
 * @param {AbortSignal} abortSignal
 */
async function guessConfig(
  domain,
  progressCallback,
  resultConfig,
  which,
  abortSignal
) {
  assert(typeof progressCallback == "function", "need progressCallback");

  // Servers that we know enough that they support OAuth2 do not need guessing.
  if (resultConfig?.incoming.auth == Ci.nsMsgAuthMethod.OAuth2) {
    return resultConfig;
  }

  resultConfig ??= new lazy.AccountConfig();
  resultConfig.source = lazy.AccountConfig.kSourceGuess;

  which ??= "both";

  if (!Services.prefs.getBoolPref("mailnews.auto_config.guess.enabled")) {
    throw new Error("Guessing config disabled per user preference");
  }

  let incomingHostDetector = null;
  let outgoingHostDetector = null;
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
    resultConfig.outgoing.type = "smtp";
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
    return resultConfig;
  }
  const progress = thisTry => {
    progressCallback(
      protocolToString(thisTry.protocol),
      thisTry.hostname,
      thisTry.port,
      thisTry.socketType,
      false,
      resultConfig
    );
  };

  const hostTryToAccountServer = (thisTry, server) => {
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
    gAccountSetupLogger.info(
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

  const outgoingSuccess = (thisTry, alternativeTries) => {
    assert(thisTry.protocol == SMTP, "I only know SMTP for outgoing");
    hostTryToAccountServer(thisTry, resultConfig.outgoing);

    for (const alternativeTry of alternativeTries) {
      // resultConfig.createNewOutgoing(); misses username etc., so copy
      const altServer = deepCopy(resultConfig.outgoing);
      hostTryToAccountServer(alternativeTry, altServer);
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
  };

  const incomingSuccess = (thisTry, alternativeTries) => {
    hostTryToAccountServer(thisTry, resultConfig.incoming);

    for (const alternativeTry of alternativeTries) {
      // resultConfig.createNewIncoming(); misses username etc., so copy
      const altServer = deepCopy(resultConfig.incoming);
      hostTryToAccountServer(alternativeTry, altServer);
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
  };

  incomingHostDetector = new IncomingHostDetector(progress, abortSignal);
  outgoingHostDetector = new OutgoingHostDetector(progress, abortSignal);
  const promises = [];
  if (which == "incoming" || which == "both") {
    promises.push(
      incomingHostDetector
        .start(
          resultConfig.incoming.hostname || domain,
          !!resultConfig.incoming.hostname,
          resultConfig.incoming.type,
          resultConfig.incoming.port,
          resultConfig.incoming.socketType,
          resultConfig.incoming.auth
        )
        .then(({ successful, alternative }) =>
          incomingSuccess(successful, alternative)
        )
    );
  }
  if (which == "outgoing" || which == "both") {
    promises.push(
      outgoingHostDetector
        .start(
          resultConfig.outgoing.hostname || domain,
          !!resultConfig.outgoing.hostname,
          "smtp",
          resultConfig.outgoing.port,
          resultConfig.outgoing.socketType,
          resultConfig.outgoing.auth
        )
        .then(({ successful, alternative }) =>
          outgoingSuccess(successful, alternative)
        )
    );
  }

  if (!promises.length) {
    return resultConfig;
  }

  try {
    await Promise.all(promises);
  } catch (error) {
    incomingHostDetector.cancel(new CancelOthersException());
    outgoingHostDetector.cancel(new CancelOthersException());
    throw error;
  }

  return resultConfig;
}

// --------------
// Implementation

/**
 * Internal object holding one server that we should try or did try.
 * Used as |thisTry|.
 *
 * Note: The consts it uses for protocol is defined towards the end of this file
 * and not the same as those used in AccountConfig (type). (fix
 * this)
 */
class HostTry {
  /** @type {integer} - IMAP, POP or SMTP */
  protocol = UNKNOWN;
  /** @type {string} */
  hostname = undefined;
  /** @type {integer} */
  port = undefined;
  /** @type {nsMsgSocketType} */
  socketType = UNKNOWN;
  /** @type {string} - What to send to server. */
  commands = null;
  /** @type {integer} - kNotTried, kOngoing, kFailed or kSuccess */
  status = kNotTried;

  /** @type {?AbortSignal} */
  signal = null;

  /**
   * @type {integer[]}
   * @see _advertisesAuthMethods() result
   * Info about the server, from the protocol and SSL chat.
   */
  authMethods = null;

  /** @type {boolean} - Whether the SSL cert is not from a proper CA. */
  selfSignedCert = false;
  /**
   * @type {string} - If set, this is an SSL error. Which host the SSL cert
   * is made for, if not hostname.
   */
  targetSite = null;
}

/**
 * When the success or errorCallbacks are called to abort the other requests
 * which happened in parallel, this ex is used as param for cancel(), so that
 * the cancel doesn't trigger another callback.
 */
class CancelOthersException extends CancelledException {
  constructor() {
    super("we're done, cancelling the other probes");
  }
}

class HostDetector {
  #abortSignal = null;
  #abortController = new AbortController();

  /**
   * @param {function(HostTry):void} progressCallback - A function
   *   {function(server {HostTry})}. Called when we tried(will try?) a new
   *   hostname and port.
   */
  constructor(progressCallback, abortSignal) {
    this.mProgressCallback = progressCallback;
    this._cancel = false;
    /**
     * ordered by decreasing preference
     *
     * @type {HostTry[]}
     */
    this._hostsToTry = [];

    this.#abortSignal = AbortSignal.any([
      abortSignal,
      this.#abortController.signal,
    ]);

    // init logging
    this._log = gAccountSetupLogger;
    this._log.info("created host detector");
  }

  cancel(ex) {
    if (!ex) {
      ex = new CancelledException();
    }
    this.#abortController.abort(ex);
    // We have to actively stop the network calls, as they may result in
    // callbacks e.g. to the cert handler. If the dialog is gone by the time
    // this happens, the javascript stack is horked.
    for (const thisTry of this._hostsToTry) {
      if (thisTry.status != kSuccess) {
        thisTry.status = kFailed;
      }
    }
  }

  /**
   * Start the detection.
   *
   * @param {string} domain - Domain to be used as base for guessing.
   *   Should be a domain (e.g. yahoo.co.uk).
   *   If hostIsPrecise == true, it should be a full hostname.
   * @param {boolean} hostIsPrecise - If true, use only this hostname,
   *   do not guess hostnames.
   * @param {"pop3"|"imap"|"exchange"|"smtp"|""} type - Account type.
   * @param {integer} port - The port to use. 0 to autodetect
   * @param {nsMsgSocketType|-1} socketType - Socket type. -1 to autodetect.
   * @param {nsMsgAuthMethod|0} authMethod - Authentication method. 0 to autodetect.
   */
  start(domain, hostIsPrecise, type, port, socketType, authMethod) {
    domain = domain.replace(/\s*/g, ""); // Remove whitespace
    if (!hostIsPrecise) {
      hostIsPrecise = false;
    }
    const protocol = lazy.Sanitizer.translate(
      type,
      { imap: IMAP, pop3: POP, smtp: SMTP },
      UNKNOWN
    );
    if (!port) {
      port = UNKNOWN;
    }
    const sslOnly = Services.prefs.getBoolPref(
      "mailnews.auto_config.guess.sslOnly"
    );
    this._log.info(
      `Starting ${protocol} detection on ${
        !hostIsPrecise ? "~ " : ""
      }${domain}:${port} with socketType=${socketType} and authMethod=${authMethod}`
    );

    // fill this._hostsToTry
    this._hostsToTry = [];
    let hostnamesToTry = [];
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
      for (const hostTry of hostEntries) {
        if (sslOnly && hostTry.socketType == Ci.nsMsgSocketType.plain) {
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
        hostTry.signal = this.#abortSignal;
        this._hostsToTry.push(hostTry);
      }
    }

    this._hostsToTry = sortTriesByPreference(this._hostsToTry);
    return this._tryAll();
  }

  // We make all host/port combinations run in parallel, store their
  // results in an array, and as soon as one finishes successfully and all
  // higher-priority ones have failed, we abort all lower-priority ones.

  async _tryAll() {
    this.#abortSignal.throwIfAborted();
    // We assume we'll resolve the same proxy for all tries, and
    // proceed to use the first resolved proxy for all tries. This
    // assumption is generally sound, but not always: mechanisms like
    // the pref network.proxy.no_proxies_on can make imap.domain and
    // pop.domain resolve differently.
    const proxy = await doProxy(this._hostsToTry[0].hostname);
    this.#abortSignal.throwIfAborted();
    const timeout = Services.prefs.getIntPref(
      "mailnews.auto_config.guess.timeout"
    );
    const promises = this._hostsToTry.map(async (thisTry, index) => {
      if (thisTry.status != kNotTried) {
        return Promise.resolve();
      }
      this._log.info(thisTry.desc + ": initializing probe...");
      if (index == 0) {
        // showing 50 servers at once is pointless
        this.mProgressCallback(thisTry);
      } else {
        // Stagger testing the next candidate. This is to stop
        // the fake servers failing in a test, but giving the UI a moment
        // to breathe can't hurt.
        await abortableTimeout(index * 100, thisTry.signal);
      }

      thisTry.status = kOngoing;
      try {
        await this.#runTry(thisTry, timeout, proxy);
        return thisTry;
      } catch (error) {
        // error callback
        if (thisTry.signal.aborted) {
          // Who set cancel to true already called mErrorCallback().
          return Promise.resolve();
        }
        this._log.warn(thisTry.desc + ":", error);
        thisTry.status = kFailed;
        throw new Error("Try failed.", { cause: error });
      }
    });
    // Wait for promises to resolve in order, returning as soon as one
    // satisfies the finish requirements. This is different from what
    // promiseFirstSuccessful implements, since _checkFinished might want more
    // than one successful result.
    for (const promise of promises) {
      try {
        await promise;
        this.#abortSignal.throwIfAborted();
        // Consume the rejections
        Promise.allSettled(promises);
        const result = this._checkFinished();
        this.cancel(new Error("No longer needed"));
        return result;
      } catch {
        continue;
      }
    }
    this.#abortSignal.throwIfAborted();
    // If we get here all attempts probably failed.
    return this._checkFinished();
  }

  /**
   * @param {HostTry} thisTry
   * @param {string[]} wiredata - What the server returned in response to our protocol chat.
   * @returns {boolean} True if the try should be re-run
   */
  _processResult(thisTry, wiredata) {
    if (thisTry._gotCertError) {
      if (thisTry._gotCertError == "ERROR_MISMATCH") {
        thisTry._gotCertError = 0;
        thisTry.status = kFailed;
        return false;
      }

      if (
        thisTry._gotCertError == "ERROR_UNTRUSTED" ||
        thisTry._gotCertError == "ERROR_TIME"
      ) {
        this._log.info(
          thisTry.desc + ": TRYING AGAIN, hopefully with exception recorded"
        );
        thisTry._gotCertError = 0;
        thisTry.selfSignedCert = true; // _next_ run gets this exception
        thisTry.status = kNotTried; // try again (with exception)
        return true;
      }
    }

    if (wiredata == null || wiredata === undefined) {
      this._log.info(thisTry.desc + ": no data");
      thisTry.status = kFailed;
      return false;
    }
    this._log.info(thisTry.desc + ": wiredata: " + wiredata.join(""));
    thisTry.authMethods = this._advertisesAuthMethods(
      thisTry.protocol,
      wiredata
    );
    if (
      thisTry.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS &&
      !this._hasSTARTTLS(thisTry, wiredata)
    ) {
      this._log.info(thisTry.desc + ": STARTTLS wanted, but not offered");
      thisTry.status = kFailed;
      return false;
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
    return false;
  }

  /**
   * Execute a try. Will re-try if _processResult asks for it.
   *
   * @param {HostTry} thisTry - The try to attempt.
   * @param {number} timeout - Timeout before aborting the request.
   * @param {nsIProxyInfo} proxy - Proxy config for the request.
   * @param {number} [runNumber = 0] - Retry counter.
   */
  async #runTry(thisTry, timeout, proxy, runNumber = 0) {
    const wiredata = await socketUtil(
      thisTry.hostname,
      thisTry.port,
      thisTry.socketType,
      thisTry.commands,
      timeout,
      proxy,
      new SSLErrorHandler(thisTry, this._log),
      thisTry.signal
    );
    // result callback
    if (thisTry.signal.aborted) {
      // Don't use response anymore.
      return;
    }
    this.mProgressCallback(thisTry);
    const retry = this._processResult(thisTry, wiredata);
    // Only retry once.
    if (retry && runNumber < 1) {
      await this.#runTry(thisTry, timeout, proxy, runNumber + 1);
    }
    if (thisTry.status != kSuccess) {
      throw new Error("Try failed with " + thisTry.status);
    }
  }

  _checkFinished() {
    let successfulTry = null;
    let successfulTryAlternative = null; // POP3
    let unfinishedBusiness = false;
    // this._hostsToTry is ordered by decreasing preference
    for (const thisTry of this._hostsToTry) {
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
      return {
        successful: successfulTry,
        alternative: successfulTryAlternative ? [successfulTryAlternative] : [],
      };
    } else if (!unfinishedBusiness) {
      // all failed
      this._log.info("ran out of options");
      const errorMsg = getStringBundle(
        "chrome://messenger/locale/accountCreationModel.properties"
      ).GetStringFromName("cannot_find_server.error");
      throw new Error(errorMsg);
      // no need to cancel, all failed
    } else if (!this.#abortSignal.aborted) {
      throw new Error("Need more try results");
    }
    // Pretend everything is fine if we aborted.
    return {};
  }

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
    const supported = new Set();
    const line = capaResponse.join("\n").toUpperCase();
    let prefix = "";
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
  }

  _hasSTARTTLS(thisTry, wiredata) {
    const capa = thisTry.protocol == POP ? "STLS" : "STARTTLS";
    return (
      thisTry.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS &&
      wiredata.join("").toUpperCase().includes(capa)
    );
  }
}

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

class IncomingHostDetector extends HostDetector {
  _hostnamesToTry(protocol, domain) {
    const hostnamesToTry = [];
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
  }
  _portsToTry = getIncomingTryOrder;
}

class OutgoingHostDetector extends HostDetector {
  _hostnamesToTry(protocol, domain) {
    const hostnamesToTry = [];
    hostnamesToTry.push("smtp." + domain);
    hostnamesToTry.push("mail." + domain);
    hostnamesToTry.push(domain);
    return hostnamesToTry;
  }
  _portsToTry = getOutgoingTryOrder;
}

// ---------------------------------------------
// Encode protocol ports and order of preference

/**
 * Sort by preference of SSL, IMAP etc.
 *
 * @param {HostTry[]} tries
 * @returns {HostTry[]}
 */
function sortTriesByPreference(tries) {
  return tries.sort((a, b) => {
    // -1 = a is better; 1 = b is better; 0 = equal
    // Prefer SSL/STARTTLS above all else
    if (
      a.socketType != Ci.nsMsgSocketType.plain &&
      b.socketType == Ci.nsMsgSocketType.plain
    ) {
      return -1;
    }
    if (
      b.socketType != Ci.nsMsgSocketType.plain &&
      a.socketType == Ci.nsMsgSocketType.plain
    ) {
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
    if (
      a.socketType == Ci.nsMsgSocketType.SSL &&
      b.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS
    ) {
      return -1;
    }
    if (
      a.socketType == Ci.nsMsgSocketType.alwaysSTARTTLS &&
      b.socketType == Ci.nsMsgSocketType.SSL
    ) {
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
  assert(
    [UNKNOWN, IMAP, POP].includes(protocol),
    `need IMAP or POP3 as protocol for incoming, is: ${protocol}`
  );
  const lowerCaseHost = host.toLowerCase();

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
        getHostEntry(protocol, Ci.nsMsgSocketType.alwaysSTARTTLS, port),
        getHostEntry(protocol, Ci.nsMsgSocketType.SSL, port),
        getHostEntry(protocol, Ci.nsMsgSocketType.plain, port),
      ];
    }
    return [getHostEntry(protocol, socketType, port)];
  }
  if (socketType == UNKNOWN) {
    return [
      getHostEntry(IMAP, Ci.nsMsgSocketType.alwaysSTARTTLS, port),
      getHostEntry(IMAP, Ci.nsMsgSocketType.SSL, port),
      getHostEntry(POP, Ci.nsMsgSocketType.alwaysSTARTTLS, port),
      getHostEntry(POP, Ci.nsMsgSocketType.SSL, port),
      getHostEntry(IMAP, Ci.nsMsgSocketType.plain, port),
      getHostEntry(POP, Ci.nsMsgSocketType.plain, port),
    ];
  }
  return [
    getHostEntry(IMAP, socketType, port),
    getHostEntry(POP, socketType, port),
  ];
}

/**
 * @returns {HostTry[]}
 */
function getOutgoingTryOrder(host, protocol, socketType, port) {
  assert(
    protocol == SMTP,
    `need SMTP as protocol for outgoing, is: ${protocol}`
  );
  if (socketType == UNKNOWN) {
    if (port == UNKNOWN) {
      // neither SSL nor port known
      return [
        getHostEntry(SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, UNKNOWN),
        getHostEntry(SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, 25),
        getHostEntry(SMTP, Ci.nsMsgSocketType.SSL, UNKNOWN),
        getHostEntry(SMTP, Ci.nsMsgSocketType.plain, UNKNOWN),
        getHostEntry(SMTP, Ci.nsMsgSocketType.plain, 25),
      ];
    }
    // port known, SSL not
    return [
      getHostEntry(SMTP, Ci.nsMsgSocketType.alwaysSTARTTLS, port),
      getHostEntry(SMTP, Ci.nsMsgSocketType.SSL, port),
      getHostEntry(SMTP, Ci.nsMsgSocketType.plain, port),
    ];
  }
  // SSL known, port not
  if (port == UNKNOWN) {
    if (socketType == Ci.nsMsgSocketType.SSL) {
      return [getHostEntry(SMTP, Ci.nsMsgSocketType.SSL, UNKNOWN)];
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
 * @param {integer} protocol
 * @param {nsMsgSocketType|-1} socketType
 * @param {integer} port
 * @returns {HostTry} with proper default port and commands, but without hostname.
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

  const r = new HostTry();
  r.protocol = protocol;
  r.socketType = socketType;
  r.port = port;
  r.commands = CMDS[protocol];
  return r;
}

/**
 * @param {integer} type
 * @returns {string}
 */
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
  throw new NotReached(`Unexpected protocol; type=${type}`);
}

class SSLErrorHandler {
  /**
   * SSL cert error handler.
   *
   * @param {HostTry} thisTry
   * @param {Console} logger
   */
  constructor(thisTry, logger) {
    this._try = thisTry;
    this._log = logger;
    // _ gotCertError will be set to an error code (one of those defined in
    // nsICertOverrideService)
    this._gotCertError = 0;
  }

  processCertError(secInfo, targetSite) {
    this._log.error("Got Cert error for " + targetSite);

    if (!secInfo) {
      return;
    }

    const cert = secInfo.serverCert;

    const parts = targetSite.split(":");
    const host = parts[0];
    const port = parts[1];

    // The following 2 cert problems are unfortunately common:
    // 1) hostname mismatch:
    // user is customer at a domain hoster, he owns yourname.org,
    // and the IMAP server is imap.hoster.com (but also reachable as
    // imap.yourname.org), and has a cert for imap.hoster.com.
    // 2) self-signed:
    // a company has an internal IMAP server, and it's only for
    // 30 employees, and they didn't want to buy a cert, so
    // they use a self-signed cert.
    //
    // We would like the above to pass, somehow, with user confirmation.
    // The following case should *not* pass:
    //
    // 1) MITM
    // User has @gmail.com, and an attacker is between the user and
    // the Internet and runs a man-in-the-middle (MITM) attack.
    // Attacker controls DNS and sends imap.gmail.com to his own
    // imap.attacker.com. He has either a valid, CA-issued
    // cert for imap.attacker.com, or a self-signed cert.
    // Of course, attacker.com could also be legit-sounding gmailservers.com.
    //
    // What makes it dangerous is that we (!) propose the server to the user,
    // and he cannot judge whether imap.gmailservers.com is correct or not,
    // and he will likely approve it.

    if (
      secInfo.overridableErrorCategory ==
      Ci.nsITransportSecurityInfo.ERROR_DOMAIN
    ) {
      this._try._gotCertError = "ERROR_MISMATCH";
      return;
    }
    if (
      secInfo.overridableErrorCategory ==
      Ci.nsITransportSecurityInfo.ERROR_TRUST
    ) {
      // e.g. self-signed
      this._try._gotCertError = "ERROR_UNTRUSTED";
    } else if (
      secInfo.overridableErrorCategory == Ci.nsITransportSecurityInfo.ERROR_TIME
    ) {
      this._try._gotCertError = "ERROR_TIME";
    } else {
      this._try._gotCertError = -1; // other
    }

    // We will add a temporary cert exception here, so that
    // we can continue and connect and try.
    // But we will remove it again as soon as we close the
    // connection, in _processResult().
    // _gotCertError will serve as the marker that we
    // have to clear the override later.
    //
    // In verifyConfig(), before we send the password, we *must*
    // get another cert exception, this time with dialog to the user
    // so that he gets informed about this and can make a choice.
    this._try.targetSite = targetSite;
    Cc["@mozilla.org/security/certoverride;1"]
      .getService(Ci.nsICertOverrideService)
      .rememberValidityOverride(host, port, {}, cert, true); // temporary override
    this._log.warn(`Added temporary override of bad cert for: ${host}:${port}`);
  }
}

// -----------
// Socket Util

/**
 * @param {string} hostname - The DNS hostname to connect to.
 * @param {integer} port - The numeric port to connect to on the host.
 * @param {nsMsgSocketType} socketType - SSL, STARTTLS or NONE
 * @param {string[]} commands - Protocol commands to send to the server.
 * @param {integer} timeout - Seconds to wait for a server response, then cancel.
 * @param {?nsIProxyInfo} proxy - The proxy to use (or null to not use any).
 * @param {SSLErrorHandler} sslErrorHandler
 * @param {AbortSignal} abortSignal
 */
async function socketUtil(
  hostname,
  port,
  socketType,
  commands,
  timeout,
  proxy,
  sslErrorHandler,
  abortSignal
) {
  assert(commands && commands.length, "need commands");

  let index = 0; // commands[index] is next to send to server

  const promiseResolvers = Promise.withResolvers();
  const abortController = new AbortController();

  const signal = AbortSignal.any([
    // In case DNS takes too long or does not resolve or another blocking
    // issue occurs before the timeout can be set on the socket, this
    // ensures that the listener callback will be fired in a timely manner.
    // The timeout value plus 2 seconds
    abortSignalTimeout(timeout * 1000 + 2000),
    abortSignal,
    abortController.signal,
  ]);

  const transportService = Cc[
    "@mozilla.org/network/socket-transport-service;1"
  ].getService(Ci.nsISocketTransportService);

  // @see NS_NETWORK_SOCKET_CONTRACTID_PREFIX
  let socketTypeName;
  if (socketType == Ci.nsMsgSocketType.SSL) {
    socketTypeName = ["ssl"];
  } else if (socketType == Ci.nsMsgSocketType.alwaysSTARTTLS) {
    socketTypeName = ["starttls"];
  } else {
    socketTypeName = [];
  }
  const transport = transportService.createTransport(
    socketTypeName,
    hostname,
    port,
    proxy,
    null
  );

  transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_CONNECT, timeout);
  transport.setTimeout(Ci.nsISocketTransport.TIMEOUT_READ_WRITE, timeout);

  signal.addEventListener(
    "abort",
    () => {
      transport.close(Cr.NS_ERROR_ABORT);
    },
    { once: true }
  );

  const outstream = transport.openOutputStream(0, 0, 0);
  const stream = transport.openInputStream(0, 0, 0);
  const instream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  instream.init(stream);

  const dataListener = {
    data: [],
    onStartRequest() {
      try {
        if (!signal.aborted) {
          // Send the first request
          const outputData = commands[index++];
          outstream.write(outputData, outputData.length);
        }
      } catch (error) {
        abortController.abort(error);
        promiseResolvers.reject(error);
      }
    },
    async onStopRequest(request, status) {
      try {
        instream.close();
        outstream.close();
        // Did it fail because of a bad certificate?
        let isCertError = false;
        if (!Components.isSuccessCode(status)) {
          try {
            const errorType = lazy.nssErrorsService.getErrorClass(status);
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

            // Report to the error callback.
            const errorMessage = lazy.nssErrorsService.getErrorMessage(status);
            throw new Error(
              `Connection to ${hostname}:${port} failed: ${errorMessage}`
            );
          } else {
            const socketTransport = transport.QueryInterface(
              Ci.nsISocketTransport
            );
            const secInfo =
              await socketTransport.tlsSocketControl?.asyncGetSecurityInfo();
            sslErrorHandler.processCertError(secInfo, hostname + ":" + port);
          }
        } else if (!Components.isSuccessCode(status)) {
          // Some other failure. Report it to the error callback.
          throw new Components.Exception(
            `Connection to ${hostname}:${port} failed`,
            status
          );
        }
        promiseResolvers.resolve(this.data.length ? this.data : null);
      } catch (error) {
        abortController.abort(error);
        promiseResolvers.reject(error);
      }
    },
    onDataAvailable(request, inputStream, offset, count) {
      try {
        if (!signal.aborted) {
          const inputData = instream.read(count);
          this.data.push(inputData);
          if (index < commands.length) {
            // Send the next request to the server.
            const outputData = commands[index++];
            outstream.write(outputData, outputData.length);
          } else {
            // If the server doesn't hang up, do it ourselves, or we won't get
            // to onStopRequest until the connection times out.
            setTimeout(() => transport.close(Cr.NS_OK), 500);
          }
        }
      } catch (error) {
        abortController.abort(error);
        promiseResolvers.reject(error);
      }
    },
  };

  const pump = Cc["@mozilla.org/network/input-stream-pump;1"].createInstance(
    Ci.nsIInputStreamPump
  );

  pump.init(stream, 0, 0, false);
  pump.asyncRead(dataListener);

  return promiseResolvers.promise;
}

/**
 * Resolve a proxy for some domain and expose it via a callback.
 *
 * @param {string} hostname - The hostname which a proxy will be resolved for
 */
async function doProxy(hostname) {
  /** @implements {nsIProtocolProxyCallback} */
  const promiseWithResolvers = Promise.withResolvers();
  const proxyResolveCallback = {
    onProxyAvailable(req, uri, proxy) {
      // Anything but a SOCKS proxy will be unusable for email.
      if (proxy != null && proxy.type != "socks" && proxy.type != "socks4") {
        proxy = null;
      }
      promiseWithResolvers.resolve(proxy);
    },
  };
  const proxyService = Cc[
    "@mozilla.org/network/protocol-proxy-service;1"
  ].getService(Ci.nsIProtocolProxyService);
  // Use some arbitrary scheme just because it is required...
  const uri = Services.io.newURI("http://" + hostname);
  // ... we'll ignore it any way. We prefer SOCKS since that's the
  // only thing we can use for email protocols.
  let proxyFlags =
    Ci.nsIProtocolProxyService.RESOLVE_IGNORE_URI_SCHEME |
    Ci.nsIProtocolProxyService.RESOLVE_PREFER_SOCKS_PROXY;
  if (Services.prefs.getBoolPref("network.proxy.socks_remote_dns")) {
    proxyFlags |= Ci.nsIProtocolProxyService.RESOLVE_ALWAYS_TUNNEL;
  }
  proxyService.asyncResolve(uri, proxyFlags, proxyResolveCallback);
  return promiseWithResolvers.promise;
}

export const GuessConfig = {
  UNKNOWN,
  IMAP,
  POP,
  SMTP,
  getHostEntry,
  getIncomingTryOrder,
  getOutgoingTryOrder,
  guessConfig,
};

export const GuessConfigForTests = {
  doProxy,
  HostDetector,
  socketUtil,
  SSLErrorHandler,
};
