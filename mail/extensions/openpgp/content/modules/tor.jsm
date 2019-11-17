/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";




const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailRNG = ChromeUtils.import("chrome://openpgp/content/modules/rng.jsm").EnigmailRNG;
const EnigmailVersioning = ChromeUtils.import("chrome://openpgp/content/modules/versioning.jsm").EnigmailVersioning;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailSocks5Proxy = ChromeUtils.import("chrome://openpgp/content/modules/socks5Proxy.jsm").EnigmailSocks5Proxy;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;

const EXPORTED_SYMBOLS = ["EnigmailTor"];

// Minimum for using socks5h:// prefix
const MINIMUM_CURL_SOCKS5H_VERSION = "7.21.7";

// Minimum for using socks5 proxies with curl
const MINIMUM_CURL_SOCKS5_PROXY_VERSION = "7.18.0";

const TORSOCKS_VERSION_2 = "2.0.0";

const TOR_SERVICE_PORT_PREF = "torServicePort";
const TOR_BROWSER_BUNDLE_PORT_PREF = "torBrowserBundlePort";
const NEW_CURL_PROTOCOL = "socks5h://";
const OLD_CURL_PROTOCOL = "socks5-hostname://";

const TOR_USER_PREFERENCES = {
  DOWNLOAD: {
    requires: "downloadKeyRequireTor",
    uses: "downloadKeyWithTor",
    constant: EnigmailConstants.DOWNLOAD_KEY
  },
  SEARCH: {
    requires: "searchKeyRequireTor",
    uses: "searchKeyWithTor",
    constant: EnigmailConstants.SEARCH_KEY
  },
  UPLOAD: {
    requires: "uploadKeyRequireTor",
    uses: "uploadKeyWithTor",
    constant: EnigmailConstants.UPLOAD_KEY
  },
  REFRESH: {
    requires: "refreshAllKeysRequireTor",
    uses: "refreshAllKeysWithTor",
    constant: EnigmailConstants.REFRESH_KEY
  }
};

function getAction(actionFlags) {
  for (let key in TOR_USER_PREFERENCES) {
    if (TOR_USER_PREFERENCES[key].constant & actionFlags) {
      return TOR_USER_PREFERENCES[key];
    }
  }
  return null;
}

/**
 * Sets user preference about requiring requests only to be made over Tor
 *
 * @param actionFlags - long: A Keyserver action flag
 *
 * @return true if user has requested gpg requests to be attempted over Tor, false otherwise
 */
function isPreferred(actionFlags) {
  const action = getAction(actionFlags);
  return EnigmailPrefs.getPref(action.requires) || EnigmailPrefs.getPref(action.uses);
}

/**
 * Sets user preference about requiring requests only to be made over Tor
 *
 * @param actionFlags - long: A Keyserver action flag
 *
 * @return true if user has requested gpg requests ONLY to be attempted over Tor, false otherwise
 */
function isRequired(actionFlags) {
  return EnigmailPrefs.getPref(getAction(actionFlags).requires);
}

function combineIntoProxyhostURI(protocol, tor) {
  EnigmailLog.DEBUG("tor.jsm: combineIntoProxyhostURI()\n");
  return protocol + createRandomCredential() + ":" + createRandomCredential() + "@" + tor.ip + ":" + tor.port;
}

function gpgProxyArgs(tor, versioning) {
  EnigmailLog.DEBUG("tor.jsm: gpgProxyArgs()\n");
  if (EnigmailOS.isDosLike || !versioning.versionFoundMeetsMinimumVersionRequired("curl", MINIMUM_CURL_SOCKS5H_VERSION)) {
    return combineIntoProxyhostURI(OLD_CURL_PROTOCOL, tor);
  }
  else {
    return combineIntoProxyhostURI(NEW_CURL_PROTOCOL, tor);
  }
}

function createHelperArgs(helper, addAuth) {
  EnigmailLog.DEBUG("tor.jsm: createHelperArgs()\n");
  let args = [];
  if (addAuth) {
    args = ["--user", createRandomCredential(), "--pass", createRandomCredential()];
  }
  args.push(EnigmailGpg.agentPath);
  return args;
}

function buildEnvVars() {
  return [
    "TORSOCKS_USERNAME=" + createRandomCredential(),
    "TORSOCKS_PASSWORD=" + createRandomCredential()
  ];
}

function createRandomCredential() {
  return EnigmailRNG.generateRandomUint32().toString();
}

function torOn(portPref) {
  EnigmailLog.DEBUG("tor.jsm: torOn()\n");
  if (EnigmailSocks5Proxy.checkTorExists(portPref)) {
    const port = EnigmailPrefs.getPref(portPref);

    EnigmailLog.CONSOLE("Tor found on IP: " + EnigmailSocks5Proxy.torIpAddr() + ", port: " + port + "\n\n");

    return {
      ip: EnigmailSocks5Proxy.torIpAddr(),
      port: port
    };
  }
  return null;
}

function meetsOSConstraints() {
  if (EnigmailOS.isDosLike) {
    return EnigmailGpg.getGpgFeature("socks-on-windows");
  }
  else {
    return EnigmailVersioning.versionFoundMeetsMinimumVersionRequired("curl", MINIMUM_CURL_SOCKS5_PROXY_VERSION);
  }
}

function useAuthOverArgs(helper, versioning) {
  if (helper === "torsocks2") {
    return versioning.versionFoundMeetsMinimumVersionRequired("torsocks2", TORSOCKS_VERSION_2);
  }
  return versioning.versionFoundMeetsMinimumVersionRequired("torsocks", TORSOCKS_VERSION_2);
}

function usesDirmngr() {
  return EnigmailGpg.getGpgFeature("supports-dirmngr");
}

function findTorExecutableHelper(versioning) {
  EnigmailLog.DEBUG("tor.jsm: findTorExecutableHelper()\n");
  const helper = EnigmailFiles.resolvePathWithEnv("torsocks2") || EnigmailFiles.resolvePathWithEnv("torsocks");
  if (helper !== null) {
    const authOverArgs = useAuthOverArgs(helper, versioning);
    return {
      envVars: (authOverArgs ? [] : buildEnvVars()),
      command: helper,
      args: createHelperArgs(helper, authOverArgs)
    };
  }
  else {
    return null;
  }
}

/**
 * Checks if Tor is running on specified ports in preferences for Tor browser bundle and Tor service
 *
 * @return true if Tor is running on either port, false if Tor is not running on either
 */
function findTor() {
  EnigmailLog.DEBUG("tor.jsm: findTor()\n");
  const torOnBrowser = torOn(TOR_BROWSER_BUNDLE_PORT_PREF);
  if (torOnBrowser !== null) {
    return torOnBrowser;
  }
  return torOn(TOR_SERVICE_PORT_PREF);
}

const systemCaller = {
  findTor: findTor,
  findTorExecutableHelper: findTorExecutableHelper
};

function buildSocksProperties(tor) {
  EnigmailLog.DEBUG("tor.jsm: buildSocksProperties()\n");
  return {
    command: "gpg",
    args: gpgProxyArgs(tor, EnigmailVersioning),
    envVars: []
  };
}

function torNotAvailableProperties() {
  EnigmailLog.DEBUG("tor.jsm: torNotAvailableProperties()\n");
  return {
    isAvailable: false,
    useTorMode: false,
    socks: null,
    helper: null
  };
}

/**
 * Constructs object with properites about how we will use tor for key refreshes
 *
 * @param system - object with functions to locate Tor and Tor helpers
 *
 * @return object with
      * isAvailable   - boolean, true if Tor is available, false otherwise
      * useTorMode    - boolean, true if dirManager is available and configured to use Tor, false otherwise
      * socks         - object with
                          * command -  the name of the gpg executable
                          * args    -  proxy host URI
                          * envVars -  an empty array

                        null if Tor is not available

      * helper        - object with
                          * envVars    - environment variables, if we need them for the helper
                          * command    - the path to the helper executable
                          * args       - flags used with the helper, if we do not use environment variables

                          If no helper is found, return null
 */

function torProperties(system) {
  EnigmailLog.DEBUG("tor.jsm: torProperties()\n");

  const tor = system.findTor();

  if (!meetsOSConstraints()) {
    EnigmailLog.DEBUG("tor.jsm: this version of curl does not support socks5 proxies \n");
    return torNotAvailableProperties();
  }

  if (tor === null) {
    return torNotAvailableProperties();
  }

  const helper = system.findTorExecutableHelper(EnigmailVersioning);
  let socks = null;
  let useTorMode = false;

  if (usesDirmngr()) {
    useTorMode = EnigmailGpg.dirmngrConfiguredWithTor();
  }
  else {
    socks = buildSocksProperties(tor);
  }

  return {
    isAvailable: true,
    useTorMode: useTorMode,
    socks: socks,
    helper: helper
  };
}

var EnigmailTor = {
  torProperties: function() {
    return torProperties(systemCaller);
  },
  getTorNotAvailableProperties: torNotAvailableProperties,
  isPreferred: isPreferred,
  isRequired: isRequired
};
