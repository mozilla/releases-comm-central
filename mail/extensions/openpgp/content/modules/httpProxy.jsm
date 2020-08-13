/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailHttpProxy"];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const { EnigmailPrefs } = ChromeUtils.import(
  "chrome://openpgp/content/modules/prefs.jsm"
);

function getPasswdForHost(hostname, userObj, passwdObj) {
  var loginmgr = Services.logins;

  // search HTTP password 1st
  var logins = loginmgr.findLogins({}, "http://" + hostname, "", "");
  if (logins.length > 0) {
    userObj.value = logins[0].username;
    passwdObj.value = logins[0].password;
    return true;
  }

  // look for any other password for same host
  logins = loginmgr.getAllLogins({});
  for (var i = 0; i < logins.length; i++) {
    if (hostname == logins[i].hostname.replace(/^.*:\/\//, "")) {
      userObj.value = logins[i].username;
      passwdObj.value = logins[i].password;
      return true;
    }
  }
  return false;
}

var EnigmailHttpProxy = {
  /**
   *  get Proxy for a given hostname as configured in Mozilla
   *
   *  @hostname: String - the host to check if there is a proxy.
   *
   *  @return: String - proxy host URL to provide to GnuPG
   *                    null if no proxy required
   */
  getHttpProxy(hostName) {
    var proxyHost = null;
    if (
      typeof hostName !== "undefined" &&
      EnigmailPrefs.getPref("respectHttpProxy")
    ) {
      // determine proxy host
      var prefsSvc = Services.prefs;
      var prefRoot = prefsSvc.getBranch(null);
      var useProxy = prefRoot.getIntPref("network.proxy.type");
      if (useProxy == 1) {
        var proxyHostName = prefRoot.getCharPref("network.proxy.http");
        var proxyHostPort = prefRoot.getIntPref("network.proxy.http_port");
        var noProxy = prefRoot
          .getCharPref("network.proxy.no_proxies_on")
          .split(/[ ,]/);
        for (let host of noProxy) {
          // Replace regex chars, except star.
          host = host.replace(/[.+\-?^${}()|[\]\\]/g, "\\$&");
          // Make star match anything.
          host = host.replace(/\*/g, ".*");
          var proxySearch = new RegExp(host + "$", "i");
          if (host && hostName.test(proxySearch)) {
            proxyHostName = null;
            break;
          }
        }

        if (proxyHostName) {
          var userObj = {};
          var passwdObj = {};
          if (getPasswdForHost(proxyHostName, userObj, passwdObj)) {
            proxyHostName =
              userObj.value + ":" + passwdObj.value + "@" + proxyHostName;
          }
        }
        if (proxyHostName && proxyHostPort) {
          proxyHost = "http://" + proxyHostName + ":" + proxyHostPort;
        }
      }
    }

    return proxyHost;
  },
};
