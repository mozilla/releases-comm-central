/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailHttpProxy"];





const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;

const NS_PREFS_SERVICE_CID = "@mozilla.org/preferences-service;1";

function getPasswdForHost(hostname, userObj, passwdObj) {
  var loginmgr = Cc["@mozilla.org/login-manager;1"].getService(Ci.nsILoginManager);

  // search HTTP password 1st
  var logins = loginmgr.findLogins({}, "http://" + hostname, "", "");
  if (logins.length > 0) {
    userObj.value = logins[0].username;
    passwdObj.value = logins[0].password;
    return true;
  }

  // look for any other password for same host
  logins = loginmgr.getAllLogins({});
  for (var i = 0; i < logins.lenth; i++) {
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
  getHttpProxy: function(hostName) {
    var proxyHost = null;
    if (((typeof hostName) !== 'undefined') && EnigmailPrefs.getPref("respectHttpProxy")) {
      // determine proxy host
      var prefsSvc = Cc[NS_PREFS_SERVICE_CID].getService(Ci.nsIPrefService);
      var prefRoot = prefsSvc.getBranch(null);
      var useProxy = prefRoot.getIntPref("network.proxy.type");
      if (useProxy == 1) {
        var proxyHostName = prefRoot.getCharPref("network.proxy.http");
        var proxyHostPort = prefRoot.getIntPref("network.proxy.http_port");
        var noProxy = prefRoot.getCharPref("network.proxy.no_proxies_on").split(/[ ,]/);
        for (var i = 0; i < noProxy.length; i++) {
          var proxySearch = new RegExp(noProxy[i].replace(/\./g, "\\.").replace(/\*/g, ".*") + "$", "i");
          if (noProxy[i] && hostName.search(proxySearch) >= 0) {
            i = noProxy.length + 1;
            proxyHostName = null;
          }
        }

        if (proxyHostName) {
          var userObj = {};
          var passwdObj = {};
          if (getPasswdForHost(proxyHostName, userObj, passwdObj)) {
            proxyHostName = userObj.value + ":" + passwdObj.value + "@" + proxyHostName;
          }
        }
        if (proxyHostName && proxyHostPort) {
          proxyHost = "http://" + proxyHostName + ":" + proxyHostPort;
        }
      }
    }

    return proxyHost;
  }
};
