/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailSocks5Proxy"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailCompat: "chrome://openpgp/content/modules/compat.jsm",
  EnigmailLazy: "chrome://openpgp/content/modules/lazy.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const CC = Components.Constructor;

const getEnigmailPrefs = EnigmailLazy.loader(
  "enigmail/prefs.jsm",
  "EnigmailPrefs"
);

const CHECK_TOR_URI = "https://check.torproject.org/api/ip";
const EXPECTED_TOR_EXISTS_RESPONSE = '"IsTor":true';
const TOR_IP_ADDR_PREF = "torIpAddr";

function createCheckTorURIChannel() {
  EnigmailLog.DEBUG("socks5proxy.jsm: createCheckTorURIChannel()\n");
  const ioservice = Services.io;
  return ioservice.newChannel2(
    CHECK_TOR_URI,
    "UTF-8",
    null,
    null,
    null,
    null,
    null,
    null
  );
}

function createScriptableInputStream(inputStream) {
  return CC(
    "@mozilla.org/scriptableinputstream;1",
    "nsIScriptableInputStream",
    "init"
  )(inputStream);
}

function buildListener(hasFoundTor, isDoneChecking) {
  EnigmailLog.DEBUG("socks5proxy.jsm: buildListener()\n");
  let listener = {
    onStartRequest(request) {},
    onStopRequest(request, statusCode) {
      isDoneChecking();
    },
    QueryInterface: EnigmailCompat.generateQI([
      "nsIRequestObserver",
      "nsIStreamListener",
    ]),
  };

  listener.onDataAvailable = function(request, inputStream, offset, count) {
    const response = createScriptableInputStream(inputStream).read(count);
    hasFoundTor(response.includes(EXPECTED_TOR_EXISTS_RESPONSE));
  };

  return listener;
}

function getCurrentThread() {
  return Services.tm.currentThread;
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
  createCheckTorURIChannel().asyncOpen(listener, sharedContext);
  const currentThread = getCurrentThread();

  while (!doneCheckingTor) {
    currentThread.processNextEvent(true);
  }

  return foundTor;
}

var EnigmailSocks5Proxy = {
  checkTorExists,
  torIpAddr() {
    EnigmailLog.DEBUG("socks5proxy.jsm: torIpAddr()\n");
    return getEnigmailPrefs().getPref(TOR_IP_ADDR_PREF);
  },
};
