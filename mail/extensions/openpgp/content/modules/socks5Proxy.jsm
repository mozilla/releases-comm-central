/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailSocks5Proxy"];

const CC = Components.Constructor;

const EnigmailCompat = ChromeUtils.import("chrome://openpgp/content/modules/compat.jsm").EnigmailCompat;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const getEnigmailPrefs = EnigmailLazy.loader("enigmail/prefs.jsm", "EnigmailPrefs");

const CHECK_TOR_URI = "https://check.torproject.org/api/ip";
const EXPECTED_TOR_EXISTS_RESPONSE = "\"IsTor\":true";
const TOR_IP_ADDR_PREF = "torIpAddr";

const CONNECTION_FLAGS = 0;
const SECONDS_TO_WAIT_FOR_CONNECTION = -1;

function createCheckTorURIChannel() {
  EnigmailLog.DEBUG("socks5proxy.jsm: createCheckTorURIChannel()\n");
  const ioservice = Cc["@mozilla.org/network/io-service;1"].getService(Ci.nsIIOService);
  return ioservice.newChannel2(CHECK_TOR_URI, "UTF-8", null, null, null, null, null, null);
}

function protocolProxyService() {
  return Cc["@mozilla.org/network/protocol-proxy-service;1"].getService(Ci.nsIProtocolProxyService);
}

function createScriptableInputStream(inputStream) {
  return CC("@mozilla.org/scriptableinputstream;1", "nsIScriptableInputStream", "init")(inputStream);
}

function buildListener(hasFoundTor, isDoneChecking) {
  EnigmailLog.DEBUG("socks5proxy.jsm: buildListener()\n");
  let listener = {
    onStartRequest: function(request) {},
    onStopRequest: function(request, statusCode) {
      isDoneChecking();
    },
    QueryInterface: EnigmailCompat.generateQI(["nsIRequestObserver", "nsIStreamListener"])
  };

  listener.onDataAvailable = function(request, inputStream, offset, count) {
    const response = createScriptableInputStream(inputStream).read(count);
    hasFoundTor(response.indexOf(EXPECTED_TOR_EXISTS_RESPONSE) !== -1);
  };

  return listener;
}

function getCurrentThread() {
  return Cc["@mozilla.org/thread-manager;1"].getService(Ci.nsIThreadManager).currentThread;
}

function filterWith(portPref) {
  EnigmailLog.DEBUG("socks5proxy.jsm: filterWith()\n");

  const port = getEnigmailPrefs().getPref(portPref);
  const failoverProxy = null;
  return {
    applyFilter: function(proxyService, uri, proxyInfo) {
      return proxyService.newProxyInfo("socks", getEnigmailPrefs().getPref(TOR_IP_ADDR_PREF), port, CONNECTION_FLAGS, SECONDS_TO_WAIT_FOR_CONNECTION, failoverProxy);
    },
    QueryInterface: EnigmailCompat.generateQI(["nsIProtocolProxyFilter"])
  };
}

/**
 * Checks if Tor is running
 *
 * @param portPref - string: the preferences key of either torServicePort or torBrowserBundlePort
 *
 * @return true if a running Tor service has been found, false otherwise
 */
function checkTorExists(portPref) {
  EnigmailLog.DEBUG("socks5proxy.jsm: checkTorExists()\n");
  const pps = protocolProxyService().registerFilter(filterWith(portPref), 1);

  let doneCheckingTor = false;
  let foundTor = false;

  function isDoneChecking() {
    doneCheckingTor = true;
  }

  function hasFoundTor(val) {
    foundTor = val;
  }

  const listener = buildListener(hasFoundTor, isDoneChecking);

  const sharedContext = null;
  const ioservice = createCheckTorURIChannel().asyncOpen(listener, sharedContext);
  const currentThread = getCurrentThread();

  while (!doneCheckingTor) {
    currentThread.processNextEvent(true);
  }

  return foundTor;
}

var EnigmailSocks5Proxy = {
  checkTorExists: checkTorExists,
  torIpAddr: function() {
    EnigmailLog.DEBUG("socks5proxy.jsm: torIpAddr()\n");
    return getEnigmailPrefs().getPref(TOR_IP_ADDR_PREF);
  }
};
