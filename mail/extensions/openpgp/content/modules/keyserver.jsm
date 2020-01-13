/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailKeyServer"];

Components.utils.importGlobalProperties(["XMLHttpRequest"]);
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
const EnigmailKeyserverURIs = ChromeUtils.import("chrome://openpgp/content/modules/keyserverUris.jsm").EnigmailKeyserverURIs;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailHttpProxy = ChromeUtils.import("chrome://openpgp/content/modules/httpProxy.jsm").EnigmailHttpProxy;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailXhrUtils = ChromeUtils.import("chrome://openpgp/content/modules/xhrUtils.jsm").EnigmailXhrUtils;
const EnigmailFuncs = ChromeUtils.import("chrome://openpgp/content/modules/funcs.jsm").EnigmailFuncs;
const EnigmailCryptoAPI = ChromeUtils.import("chrome://openpgp/content/modules/cryptoAPI.jsm").EnigmailCryptoAPI;

const IOSERVICE_CONTRACTID = "@mozilla.org/network/io-service;1";

const ENIG_DEFAULT_HKP_PORT = "11371";
const ENIG_DEFAULT_HKPS_PORT = "443";
const ENIG_DEFAULT_LDAP_PORT = "389";

const SKS_CACERT_URL = "https://sks-keyservers.net/sks-keyservers.netCA.pem";
const HKPS_POOL_HOST = "hkps.pool.sks-keyservers.net";
const SKS_CACERT_SUBJECTNAME = "CN=sks-keyservers.net CA,O=sks-keyservers.net CA,ST=Oslo,C=NO";

/**
 KeySrvListener API
 Object implementing:
  - onProgress: function(percentComplete) [only implemented for download()]
  - onCancel: function() - the body will be set by the callee
*/


function createError(errId) {
  let msg = "";
  switch (errId) {
    case EnigmailConstants.KEYSERVER_ERR_ABORTED:
      msg = EnigmailLocale.getString("keyserver.error.aborted");
      break;
    case EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR:
      msg = EnigmailLocale.getString("keyserver.error.serverError");
      break;
    case EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE:
      msg = EnigmailLocale.getString("keyserver.error.unavailable");
      break;
    case EnigmailConstants.KEYSERVER_ERR_SECURITY_ERROR:
      msg = EnigmailLocale.getString("keyserver.error.securityError");
      break;
    case EnigmailConstants.KEYSERVER_ERR_CERTIFICATE_ERROR:
      msg = EnigmailLocale.getString("keyserver.error.certificateError");
      break;
    case EnigmailConstants.KEYSERVER_ERR_IMPORT_ERROR:
      msg = EnigmailLocale.getString("keyserver.error.importError");
      break;
    case EnigmailConstants.KEYSERVER_ERR_UNKNOWN:
      msg = EnigmailLocale.getString("keyserver.error.unknown");
      break;
  }

  return {
    result: errId,
    errorDetails: msg
  };
}

/**
 * parse a keyserver specification and return host, protocol and port
 *
 * @param keyserver: String - name of keyserver with optional protocol and port.
 *                       E.g. keys.gnupg.net, hkps://keys.gnupg.net:443
 *
 * @return Object: {port, host, protocol} (all Strings)
 */
function parseKeyserverUrl(keyserver) {
  if (keyserver.length > 1024) {
    // insane length of keyserver is forbidden
    throw Components.results.NS_ERROR_FAILURE;
  }

  keyserver = keyserver.toLowerCase().trim();
  let protocol = "";
  if (keyserver.search(/^[a-zA-Z0-9_.-]+:\/\//) === 0) {
    protocol = keyserver.replace(/^([a-zA-Z0-9_.-]+)(:\/\/.*)/, "$1");
    keyserver = keyserver.replace(/^[a-zA-Z0-9_.-]+:\/\//, "");
  }
  else {
    protocol = "hkp";
  }

  let port = "";
  switch (protocol) {
    case "hkp":
      port = ENIG_DEFAULT_HKP_PORT;
      break;
    case "https":
    case "hkps":
      port = ENIG_DEFAULT_HKPS_PORT;
      break;
    case "ldap":
      port = ENIG_DEFAULT_LDAP_PORT;
      break;
  }

  let m = keyserver.match(/^(.+)(:)(\d+)$/);
  if (m && m.length == 4) {
    keyserver = m[1];
    port = m[3];
  }

  if (keyserver.search(/^(keys\.mailvelope\.com|api\.protonmail\.ch)$/) === 0) {
    protocol = "hkps";
    port = ENIG_DEFAULT_HKPS_PORT;
  }
  if (keyserver.search(/^(keybase\.io)$/) === 0) {
    protocol = "keybase";
    port = ENIG_DEFAULT_HKPS_PORT;
  }

  return {
    protocol: protocol,
    host: keyserver,
    port: port
  };
}


/**
 Object to handle HKP/HKPS requests via builtin XMLHttpRequest()
 */
const accessHkpInternal = {
  /**
   * Create the payload of hkp requests (upload only)
   *
   */
  buildHkpPayload: function(actionFlag, searchTerms) {
    let payLoad = null,
      keyData = "";

    switch (actionFlag) {
      case EnigmailConstants.UPLOAD_KEY:
        keyData = EnigmailKeyRing.extractKey(false, searchTerms, null, {}, {});
        if (keyData.length === 0) return null;

        payLoad = "keytext=" + encodeURIComponent(keyData);
        return payLoad;

      case EnigmailConstants.DOWNLOAD_KEY:
      case EnigmailConstants.SEARCH_KEY:
      case EnigmailConstants.GET_SKS_CACERT:
        return "";
    }

    // other actions are not yet implemented
    return null;
  },

  /**
   * return the URL and the HTTP access method for a given action
   */
  createRequestUrl: function(keyserver, actionFlag, searchTerm) {
    let keySrv = parseKeyserverUrl(keyserver);

    let method = "GET";
    let protocol;

    switch (keySrv.protocol) {
      case "hkp":
        protocol = "http";
        break;
      case "ldap":
        throw Components.results.NS_ERROR_FAILURE;
      default: // equals to hkps
        protocol = "https";
    }

    let url = protocol + "://" + keySrv.host + ":" + keySrv.port;

    if (actionFlag === EnigmailConstants.UPLOAD_KEY) {
      url += "/pks/add";
      method = "POST";
    }
    else if (actionFlag === EnigmailConstants.DOWNLOAD_KEY) {
      if (searchTerm.indexOf("0x") !== 0) {
        searchTerm = "0x" + searchTerm;
      }
      url += "/pks/lookup?search=" + searchTerm + "&op=get&options=mr";
    }
    else if (actionFlag === EnigmailConstants.SEARCH_KEY) {
      url += "/pks/lookup?search=" + escape(searchTerm) + "&fingerprint=on&op=index&options=mr";
    }
    else if (actionFlag === EnigmailConstants.GET_SKS_CACERT) {
      url = SKS_CACERT_URL;
    }

    return {
      url: url,
      host: keySrv.host,
      method: method
    };
  },

  /**
   * Upload, search or download keys from a keyserver
   * @param actionFlag:  Number  - Keyserver Action Flags: from EnigmailConstants
   * @param keyId:      String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Number (Status-ID)>
   */
  accessKeyServer: function(actionFlag, keyserver, keyId, listener) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.accessKeyServer(${keyserver})\n`);
    if (keyserver === null) {
      keyserver = EnigmailKeyserverURIs.getDefaultKeyServer();
    }

    return new Promise((resolve, reject) => {
      let xmlReq = null;
      if (listener && typeof(listener) === "object") {
        listener.onCancel = function() {
          EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.accessKeyServer - onCancel() called\n`);
          if (xmlReq) {
            xmlReq.abort();
          }
          reject(createError(EnigmailConstants.KEYSERVER_ERR_ABORTED));
        };
      }
      if (actionFlag === EnigmailConstants.REFRESH_KEY) {
        // we don't (need to) distinguish between refresh and download for our internal protocol
        actionFlag = EnigmailConstants.DOWNLOAD_KEY;
      }

      let payLoad = this.buildHkpPayload(actionFlag, keyId);
      if (payLoad === null) {
        reject(createError(EnigmailConstants.KEYSERVER_ERR_UNKNOWN));
        return;
      }

      let errorCode = 0;

      xmlReq = new XMLHttpRequest();

      xmlReq.onload = function _onLoad() {
        EnigmailLog.DEBUG("keyserver.jsm: accessHkpInternal: onload(): status=" + xmlReq.status + "\n");
        switch (actionFlag) {
          case EnigmailConstants.UPLOAD_KEY:
            EnigmailLog.DEBUG("keyserver.jsm: accessHkpInternal: onload: " + xmlReq.responseText + "\n");
            if (xmlReq.status >= 400) {
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              resolve(0);
            }
            return;

          case EnigmailConstants.SEARCH_KEY:
          case EnigmailConstants.GET_SKS_CACERT:
            if (xmlReq.status === 404) {
              // key not found
              resolve("");
            }
            else if (xmlReq.status >= 400) {
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              resolve(xmlReq.responseText);
            }
            return;

          case EnigmailConstants.DOWNLOAD_KEY:
            if (xmlReq.status >= 400 && xmlReq.status < 500) {
              // key not found
              resolve(1);
            }
            else if (xmlReq.status >= 500) {
              EnigmailLog.DEBUG("keyserver.jsm: accessHkpInternal: onload: " + xmlReq.responseText + "\n");
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              let errorMsgObj = {},
                importedKeysObj = {};
              let importMinimal = (xmlReq.responseText.length > 1024000 && (!EnigmailGpg.getGpgFeature("handles-huge-keys")));
              let r = EnigmailKeyRing.importKey(null, false, xmlReq.responseText, "", errorMsgObj, importedKeysObj, importMinimal);
              if (r === 0) {
                resolve(importedKeysObj.value);
              }
              else {
                reject(createError(EnigmailConstants.KEYSERVER_ERR_IMPORT_ERROR));
              }
            }
            return;
        }
        resolve(-1);
      };

      xmlReq.onerror = function(e) {
        EnigmailLog.DEBUG("keyserver.jsm: accessHkpInternal.accessKeyServer: onerror: " + e + "\n");
        let err = EnigmailXhrUtils.createTCPErrorFromFailedXHR(e.target);
        switch (err.type) {
          case 'SecurityCertificate':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_CERTIFICATE_ERROR));
            break;
          case 'SecurityProtocol':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SECURITY_ERROR));
            break;
          case 'Network':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
            break;
        }
        reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
      };

      xmlReq.onloadend = function() {
        EnigmailLog.DEBUG("keyserver.jsm: accessHkpInternal.accessKeyServer: loadEnd\n");
      };

      let {
        url,
        host,
        method
      } = this.createRequestUrl(keyserver, actionFlag, keyId);

      if (host === HKPS_POOL_HOST && actionFlag !== EnigmailConstants.GET_SKS_CACERT) {
        this.getSksCACert().then(r => {
          EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.accessKeyServer: getting ${url}\n`);
          xmlReq.open(method, url);
          xmlReq.send(payLoad);
        });
      }
      else {
        EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.accessKeyServer: requesting ${url}\n`);
        xmlReq.open(method, url);
        xmlReq.send(payLoad);
      }
    });
  },

  installSksCACert: async function() {
    EnigmailLog.DEBUG(`keyserver.jsm: installSksCACert()\n`);
    let certDb = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB);
    try {
      let certTxt = await this.accessKeyServer(EnigmailConstants.GET_SKS_CACERT, "", "", null);
      const BEGIN_CERT = "-----BEGIN CERTIFICATE-----";
      const END_CERT = "-----END CERTIFICATE-----";

      certTxt = certTxt.replace(/[\r\n]/g, "");
      let begin = certTxt.indexOf(BEGIN_CERT);
      let end = certTxt.indexOf(END_CERT);
      let certData = certTxt.substring(begin + BEGIN_CERT.length, end);
      let x509cert = certDb.addCertFromBase64(certData, "C,C,C", "");
      return x509cert;
    }
    catch (x) {
      return null;
    }
  },

  /**
   * Get the CA certificate for the HKPS sks-keyserver pool
   */
  getSksCACert: async function() {
    EnigmailLog.DEBUG(`keyserver.jsm: getSksCACert()\n`);
    let certDb = Cc["@mozilla.org/security/x509certdb;1"].getService(Ci.nsIX509CertDB);
    let cert = null;

    for (cert of certDb.getCerts().getEnumerator()) {
      if (cert.subjectName === SKS_CACERT_SUBJECTNAME && cert.certType === Ci.nsIX509Cert.CA_CERT) {
        return cert;
      }
    }

    cert = await this.installSksCACert();
    return cert;
  },

  /**
   * Download keys from a keyserver
   * @param keyIDs:      String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  download: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.download(${keyIDs})\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };

    for (let i = 0; i < keyIdArr.length; i++) {
      try {
        let r = await this.accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, keyserver, keyIdArr[i], listener);
        if (Array.isArray(r)) {
          retObj.keyList = retObj.keyList.concat(r);
        }
      }
      catch (ex) {
        retObj.result = ex.result;
        retObj.errorDetails = ex.errorDetails;
        throw retObj;
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  refresh: function(keyServer, listener = null) {
    let keyList = EnigmailKeyRing.getAllKeys().keyList.map(keyObj => {
      return "0x" + keyObj.fpr;
    }).join(" ");

    return this.download(keyList, keyServer, listener);
  },

  /**
   * Upload keys to a keyserver
   * @param keyIDs: String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  upload: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.upload(${keyIDs})\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };

    for (let i = 0; i < keyIdArr.length; i++) {
      try {
        let r = await this.accessKeyServer(EnigmailConstants.UPLOAD_KEY, keyserver, keyIdArr[i], listener);
        if (r === 0) {
          retObj.keyList.push(keyIdArr[i]);
        }
        else {
          retObj.result = r;
        }
      }
      catch (ex) {
        retObj.result = ex.result;
        retObj.errorDetails = ex.errorDetails;
        throw retObj;
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  /**
   * Search for keys on a keyserver
   * @param searchTerm:  String  - search term
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *    - result: Number
   *    - pubKeys: Array of Object:
   *         PubKeys: Object with:
   *           - keyId: String
   *           - keyLen: String
   *           - keyType: String
   *           - created: String (YYYY-MM-DD)
   *           - status: String: one of ''=valid, r=revoked, e=expired
   *           - uid: Array of Strings with UIDs
   */
  search: async function(searchTerm, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessHkpInternal.search(${searchTerm})\n`);
    let retObj = {
      result: 0,
      errorDetails: "",
      pubKeys: []
    };
    let key = null;

    let searchArr = searchTerm.split(/ +/);

    try {
      for (let k in searchArr) {
        let r = await this.accessKeyServer(EnigmailConstants.SEARCH_KEY, keyserver, searchArr[k], listener);

        let lines = r.split(/\r?\n/);

        for (var i = 0; i < lines.length; i++) {
          let line = lines[i].split(/:/).map(unescape);
          if (line.length <= 1) continue;

          switch (line[0]) {
            case "info":
              if (line[1] !== "1") {
                // protocol version not supported
                throw {
                  result: 7,
                  errorDetails: EnigmailLocale.getString("keyserver.error.unsupported"),
                  pubKeys: []
                };
              }
              break;
            case "pub":
              if (line.length >= 6) {
                if (key) {
                  retObj.pubKeys.push(key);
                  key = null;
                }
                let dat = new Date(line[4] * 1000);
                let month = String(dat.getMonth() + 101).substr(1);
                let day = String(dat.getDate() + 100).substr(1);
                key = {
                  keyId: line[1],
                  keyLen: line[3],
                  keyType: line[2],
                  created: dat.getFullYear() + "-" + month + "-" + day,
                  uid: [],
                  status: line[6]
                };
              }
              break;
            case "uid":
              key.uid.push(EnigmailData.convertToUnicode(line[1].trim(), "utf-8"));
          }
        }

        if (key) {
          retObj.pubKeys.push(key);
        }
      }
    }
    catch (ex) {
      retObj.result = ex.result;
      retObj.errorDetails = ex.errorDetails;
      throw retObj;
    }

    return retObj;
  }
};

/**
 Object to handle KeyBase requests (search & download only)
 */
const accessKeyBase = {
  /**
   * return the URL and the HTTP access method for a given action
   */
  createRequestUrl: function(actionFlag, searchTerm) {
    const method = "GET";

    let url = "https://keybase.io/_/api/1.0/user/";

    if (actionFlag === EnigmailConstants.UPLOAD_KEY) {
      // not supported
      throw Components.results.NS_ERROR_FAILURE;
    }
    else if (actionFlag === EnigmailConstants.DOWNLOAD_KEY) {
      if (searchTerm.indexOf("0x") === 0) {
        searchTerm = searchTerm.substr(0, 40);
      }
      url += "lookup.json?key_fingerprint=" + escape(searchTerm) + "&fields=public_keys";
    }
    else if (actionFlag === EnigmailConstants.SEARCH_KEY) {
      url += "autocomplete.json?q=" + escape(searchTerm);
    }

    return {
      url: url,
      method: "GET"
    };
  },

  /**
   * Upload, search or download keys from a keyserver
   * @param actionFlag:  Number  - Keyserver Action Flags: from EnigmailConstants
   * @param keyId:      String  - space-separated list of search terms or key IDs
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Number (Status-ID)>
   */
  accessKeyServer: function(actionFlag, keyId, listener) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: accessKeyServer()\n`);

    return new Promise((resolve, reject) => {
      let xmlReq = null;
      if (listener && typeof(listener) === "object") {
        listener.onCancel = function() {
          EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: accessKeyServer - onCancel() called\n`);
          if (xmlReq) {
            xmlReq.abort();
          }
          reject(createError(EnigmailConstants.KEYSERVER_ERR_ABORTED));
        };
      }
      if (actionFlag === EnigmailConstants.REFRESH_KEY) {
        // we don't (need to) distinguish between refresh and download for our internal protocol
        actionFlag = EnigmailConstants.DOWNLOAD_KEY;
      }

      let errorCode = 0;

      xmlReq = new XMLHttpRequest();

      xmlReq.onload = function _onLoad() {
        EnigmailLog.DEBUG("keyserver.jsm: onload(): status=" + xmlReq.status + "\n");
        switch (actionFlag) {
          case EnigmailConstants.SEARCH_KEY:
            if (xmlReq.status >= 400) {
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              resolve(xmlReq.responseText);
            }
            return;

          case EnigmailConstants.DOWNLOAD_KEY:
            if (xmlReq.status >= 400 && xmlReq.status < 500) {
              // key not found
              resolve([]);
            }
            else if (xmlReq.status >= 500) {
              EnigmailLog.DEBUG("keyserver.jsm: onload: " + xmlReq.responseText + "\n");
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              try {
                let resp = JSON.parse(xmlReq.responseText);
                let imported = [];

                if (resp.status.code === 0) {
                  for (let hit in resp.them) {
                    EnigmailLog.DEBUG(JSON.stringify(resp.them[hit].public_keys.primary) + "\n");

                    if (resp.them[hit] !== null) {
                      let errorMsgObj = {},
                        importedKeysObj = {};
                      let r = EnigmailKeyRing.importKey(null, false, resp.them[hit].public_keys.primary.bundle, "", errorMsgObj, importedKeysObj);
                      if (r === 0) {
                        imported.push(importedKeysObj.value);
                      }
                    }
                  }
                }
                resolve(imported);
              }
              catch (ex) {
                reject(createError(EnigmailConstants.KEYSERVER_ERR_UNKNOWN));
              }
            }
            return;
        }
        resolve(-1);
      };

      xmlReq.onerror = function(e) {
        EnigmailLog.DEBUG("keyserver.jsm: accessKeyBase: onerror: " + e + "\n");
        let err = EnigmailXhrUtils.createTCPErrorFromFailedXHR(e.target);
        switch (err.type) {
          case 'SecurityCertificate':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_CERTIFICATE_ERROR));
            break;
          case 'SecurityProtocol':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SECURITY_ERROR));
            break;
          case 'Network':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
            break;
        }
        reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
      };

      xmlReq.onloadend = function() {
        EnigmailLog.DEBUG("keyserver.jsm: accessKeyBase: loadEnd\n");
      };

      let {
        url,
        method
      } = this.createRequestUrl(actionFlag, keyId);

      EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: requesting ${url}\n`);
      xmlReq.open(method, url);
      xmlReq.send("");
    });
  },

  /**
   * Download keys from a KeyBase
   * @param keyIDs:      String  - space-separated list of search terms or key IDs
   * @param keyserver:   (not used for keybase)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  download: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: download()\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };


    for (let i = 0; i < keyIdArr.length; i++) {
      try {
        let r = await this.accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, keyIdArr[i], listener);
        if (r.length > 0) {
          retObj.keyList = retObj.keyList.concat(r);
        }
      }
      catch (ex) {
        retObj.result = ex.result;
        retObj.errorDetails = ex.result;
        throw retObj;
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress(i / keyIdArr.length);
      }
    }

    return retObj;
  },

  /**
   * Search for keys on a keyserver
   * @param searchTerm:  String  - search term
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *    - result: Number
   *    - pubKeys: Array of Object:
   *         PubKeys: Object with:
   *           - keyId: String
   *           - keyLen: String
   *           - keyType: String
   *           - created: String (YYYY-MM-DD)
   *           - status: String: one of ''=valid, r=revoked, e=expired
   *           - uid: Array of Strings with UIDs

   */
  search: async function(searchTerm, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: search()\n`);
    let retObj = {
      result: 0,
      errorDetails: "",
      pubKeys: []
    };

    let key = {};

    try {
      let r = await this.accessKeyServer(EnigmailConstants.SEARCH_KEY, searchTerm, listener);

      let res = JSON.parse(r);
      let completions = res.completions;

      for (let hit in completions) {
        if (completions[hit] && completions[hit].components.key_fingerprint !== undefined) {
          let uid = completions[hit].components.username.val;
          if ("full_name" in completions[hit].components) {
            uid += " (" + completions[hit].components.full_name.val + ")";
          }
          let key = {
            keyId: completions[hit].components.key_fingerprint.val.toUpperCase(),
            keyLen: completions[hit].components.key_fingerprint.nbits.toString(),
            keyType: completions[hit].components.key_fingerprint.algo.toString(),
            created: 0, //date.toDateString(),
            uid: [uid],
            status: ""
          };
          retObj.pubKeys.push(key);
        }
      }
    }
    catch (ex) {
      retObj.result = ex.result;
      retObj.errorDetails = ex.errorDetails;
      throw retObj;
    }

    return retObj;
  },

  upload: function() {
    throw Components.results.NS_ERROR_FAILURE;
  },

  refresh: function(keyServer, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessKeyBase: refresh()\n`);
    let keyList = EnigmailKeyRing.getAllKeys().keyList.map(keyObj => {
      return "0x" + keyObj.fpr;
    }).join(" ");

    return this.download(keyList, keyServer, listener);
  }
};


/**
 Object to handle HKP/HKPS and LDAP/LDAPS requests via GnuPG
 */
const accessGnuPG = {

  /**
   * Upload, search or download keys from a keyserver
   * @param actionFlag:  Number  - Keyserver Action Flags: from EnigmailConstants
   * @param keyId:       String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return Promise<Object> Object from execAsync
   */
  accessKeyServer: function(actionFlag, keyserver, keyId, listener) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG: accessKeyServer(${keyserver})\n`);

    let processHandle = {
      value: null
    };

    if (listener) {
      listener._isCancelled = 0;
      listener.onCancel = function() {
        EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG: accessKeyServer: onCancel\n`);

        if (processHandle.value) {
          processHandle.value.killProcess();
        }
        this._isCancelled = 1;
      };
    }

    if (keyserver === null) {
      keyserver = EnigmailKeyserverURIs.getDefaultKeyServer();
    }

    let args = EnigmailGpg.getStandardArgs(true);
    args.push("--log-file");
    args.push(EnigmailOS.isWin32 ? "NUL" : "/dev/null");
    args.push("--with-colons");

    let cmd = "";

    let proxyHost = EnigmailHttpProxy.getHttpProxy();
    if (proxyHost) {
      args = args.concat(["--keyserver-options", "http-proxy=" + proxyHost]);
    }

    args.push("--keyserver");
    args.push(keyserver);

    switch (actionFlag) {
      case EnigmailConstants.SEARCH_KEY:
        cmd = "--search-keys";
        break;
      case EnigmailConstants.DOWNLOAD_KEY:
        cmd = "--recv-keys";
        break;
      case EnigmailConstants.UPLOAD_KEY:
        cmd = "--send-keys";
        break;
    }

    args.push(cmd);
    args = args.concat(keyId.split(/ +/));

    return EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, "", processHandle);
  },

  parseStatusMsg: function(execResult) {
    let errorCode = 0,
      errorType = null;

    // Find the 1st FAILURE message in the gpg status output
    let m = execResult.stderrData.match(/^\[GNUPG:\] (FAILURE|ERROR) ([^ ]+ )(\d+)/m);

    if (m && m.length >= 4 && m[3].search(/^[0-9]+$/) === 0) {
      let errorNumber = Number(m[3]);
      //let sourceSystem = errorNumber >> 24;
      errorCode = errorNumber & 0xFFFFFF;

      switch (errorCode) {
        case 58: // no data
          break;
        case 32793: // connection refused
        case 32810: // host unreachable
        case 220: // Server not found (no name)
          errorType = EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE;
          break;
        case 228:
          errorType = EnigmailConstants.KEYSERVER_ERR_SECURITY_ERROR;
          break;
        case 100: // various  certificate errors
        case 101:
        case 102:
        case 103:
        case 185:
          errorType = EnigmailConstants.KEYSERVER_ERR_CERTIFICATE_ERROR;
          break;
        default:
          errorType = EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR;
      }
    }

    if (execResult.isKilled !== 0) {
      errorType = EnigmailConstants.KEYSERVER_ERR_ABORTED;
    }

    if (errorType !== null) {
      EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG.parseStatusMsg: got errorCode=${errorCode}\n`);
      return createError(errorType);
    }

    return null;
  },
  /**
   * Download keys from a keyserver
   * @param keyIDs:      String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  download: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG.download(${keyIDs})\n`);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };
    let keyIdArr = keyIDs.split(/ +/);

    for (let i = 0; i < keyIdArr.length; i++) {
      let r = await this.accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, keyserver, keyIdArr[i], listener);

      let exitValue = this.parseStatusMsg(r);
      if (exitValue) {
        exitValue.keyList = [];
        throw exitValue;
      }

      var statusLines = r.statusMsg.split(/\r?\n/);

      for (let j = 0; j < statusLines.length; j++) {
        let matches = statusLines[j].match(/IMPORT_OK ([0-9]+) (\w+)/);
        if (matches && (matches.length > 2)) {
          retObj.keyList.push(matches[2]);
          EnigmailKeyRing.updateKeys([matches[2]]);
        }
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  refresh: function(keyServer, listener = null) {
    let keyList = EnigmailKeyRing.getAllKeys().keyList.map(keyObj => {
      return "0x" + keyObj.fpr;
    }).join(" ");

    return this.download(keyList, keyServer, listener);
  },

  /**
   * Upload keys to a keyserver
   * @param keyIDs: String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  upload: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG.upload(${keyIDs})\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };

    for (let i = 0; i < keyIdArr.length; i++) {
      let r = await this.accessKeyServer(EnigmailConstants.UPLOAD_KEY, keyserver, keyIdArr[i], listener);

      let exitValue = this.parseStatusMsg(r);
      if (exitValue) {
        exitValue.keyList = [];
        throw exitValue;
      }

      if (r.exitCode === 0) {
        retObj.keyList.push(keyIdArr[i]);
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  /**
   * Search for keys on a keyserver
   * @param searchTerm:  String  - search term
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *    - result: Number
   *    - pubKeys: Array of Object:
   *         PubKeys: Object with:
   *           - keyId: String
   *           - keyLen: String
   *           - keyType: String
   *           - created: String (YYYY-MM-DD)
   *           - status: String: one of ''=valid, r=revoked, e=expired
   *           - uid: Array of Strings with UIDs
   */
  search: async function(searchTerm, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessGnuPG.search(${searchTerm})\n`);
    let retObj = {
      result: 0,
      errorDetails: "",
      pubKeys: []
    };
    let key = null;

    try {
      let r = await this.accessKeyServer(EnigmailConstants.SEARCH_KEY, keyserver, searchTerm, listener);

      let exitValue = this.parseStatusMsg(r);
      if (exitValue) {
        exitValue.pubKeys = [];
        throw exitValue;
      }

      let lines = r.stdoutData.split(/\r?\n/);

      for (var i = 0; i < lines.length; i++) {
        let line = lines[i].split(/:/).map(unescape);
        if (line.length <= 1) continue;

        switch (line[0]) {
          case "info":
            if (line[1] !== "1") {
              // protocol version not supported
              throw {
                result: 7,
                errorDetails: EnigmailLocale.getString("keyserver.error.unsupported"),
                pubKeys: []
              };
            }
            break;
          case "pub":
            if (line.length >= 6) {
              if (key) {
                retObj.pubKeys.push(key);
                key = null;
              }
              let dat = new Date(line[4] * 1000);
              let month = String(dat.getMonth() + 101).substr(1);
              let day = String(dat.getDate() + 100).substr(1);
              key = {
                keyId: line[1],
                keyLen: line[3],
                keyType: line[2],
                created: dat.getFullYear() + "-" + month + "-" + day,
                uid: [],
                status: line[6]
              };
            }
            break;
          case "uid":
            key.uid.push(EnigmailData.convertToUnicode(line[1].trim(), "utf-8"));
        }
      }

      if (key) {
        retObj.pubKeys.push(key);
      }
    }
    catch (ex) {
      retObj.result = ex.result;
      retObj.errorDetails = ex.errorDetails;
      throw retObj;
    }

    return retObj;
  }
};


function getAccessType(keyserver) {
  if (keyserver === null) {
    keyserver = EnigmailKeyserverURIs.getDefaultKeyServer();
  }


  let srv = parseKeyserverUrl(keyserver);
  switch (srv.protocol) {
    case "keybase":
      return accessKeyBase;
    case "ldap":
    case "ldaps":
      return accessGnuPG;
    case "vks":
      return accessVksServer;
  }

  if (srv.host.search(/keys.openpgp.org$/i) >= 0) {
    return accessVksServer;
  }

  if (EnigmailPrefs.getPref("useGpgKeysTool")) {
    return accessGnuPG;
  }

  return accessHkpInternal;
}


/**
 Object to handle VKS requests (for example keys.openpgp.org)
 */
const accessVksServer = {
  /**
   * Create the payload of VKS requests (currently upload only)
   *
   */
  buildJsonPayload: function(actionFlag, searchTerms, locale) {
    let payLoad = null,
      keyData = "";

    switch (actionFlag) {
      case EnigmailConstants.UPLOAD_KEY:
        keyData = EnigmailKeyRing.extractKey(false, searchTerms, null, {}, {});
        if (keyData.length === 0) return null;

        payLoad = JSON.stringify({
          keytext: keyData
        });
        return payLoad;

      case EnigmailConstants.GET_CONFIRMATION_LINK:
        payLoad = JSON.stringify({
          token: searchTerms.token,
          addresses: searchTerms.addresses,
          locale: [locale]
        });
        return payLoad;

      case EnigmailConstants.DOWNLOAD_KEY:
      case EnigmailConstants.SEARCH_KEY:
      case EnigmailConstants.GET_SKS_CACERT:
        return "";
    }

    // other actions are not yet implemented
    return null;
  },

  /**
   * return the URL and the HTTP access method for a given action
   */
  createRequestUrl: function(keyserver, actionFlag, searchTerm) {
    let keySrv = parseKeyserverUrl(keyserver);
    let contentType = "text/plain;charset=UTF-8";

    let method = "GET";

    let url = "https://" + keySrv.host + ":443";

    if (actionFlag === EnigmailConstants.UPLOAD_KEY) {
      url += "/vks/v1/upload";
      method = "POST";
      contentType = "application/json";
    }
    else if (actionFlag === EnigmailConstants.GET_CONFIRMATION_LINK) {
      url += "/vks/v1/request-verify";
      method = "POST";
      contentType = "application/json";
    }
    else if (actionFlag === EnigmailConstants.DOWNLOAD_KEY || actionFlag === EnigmailConstants.SEARCH_KEY) {
      if (searchTerm) {
        let lookup = "/vks/";
        if (searchTerm.indexOf("0x") === 0) {
          searchTerm = searchTerm.substr(2);
          if (searchTerm.length == 16 && searchTerm.search(/^[A-F0-9]+$/) === 0) {
            lookup = "/vks/v1/by-keyid/" + searchTerm;
          }
          else if (searchTerm.length == 40 && searchTerm.search(/^[A-F0-9]+$/) === 0) {
            lookup = "/vks/v1/by-fingerprint/" + searchTerm;
          }
        }
        else {
          try {
            searchTerm = EnigmailFuncs.stripEmail(searchTerm);
          }
          catch (x) {}
          lookup = "/vks/v1/by-email/" + searchTerm;
        }
        url += lookup;
      }
    }

    return {
      url: url,
      host: keySrv.host,
      method: method,
      contentType: contentType
    };
  },

  /**
   * Upload, search or download keys from a keyserver
   * @param actionFlag:  Number  - Keyserver Action Flags: from EnigmailConstants
   * @param keyId:       String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Number (Status-ID)>
   */
  accessKeyServer: function(actionFlag, keyserver, keyId, listener) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.accessKeyServer(${keyserver})\n`);
    if (keyserver === null) {
      keyserver = "keys.openpgp.org";
    }

    return new Promise((resolve, reject) => {
      let xmlReq = null;
      if (listener && typeof(listener) === "object") {
        listener.onCancel = function() {
          EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.accessKeyServer - onCancel() called\n`);
          if (xmlReq) {
            xmlReq.abort();
          }
          reject(createError(EnigmailConstants.KEYSERVER_ERR_ABORTED));
        };
      }
      if (actionFlag === EnigmailConstants.REFRESH_KEY) {
        // we don't (need to) distinguish between refresh and download for our internal protocol
        actionFlag = EnigmailConstants.DOWNLOAD_KEY;
      }

      let uiLocale = EnigmailLocale.getUILocale();
      let payLoad = this.buildJsonPayload(actionFlag, keyId, uiLocale);
      if (payLoad === null) {
        reject(createError(EnigmailConstants.KEYSERVER_ERR_UNKNOWN));
        return;
      }

      let errorCode = 0;

      xmlReq = new XMLHttpRequest();

      xmlReq.onload = function _onLoad() {
        EnigmailLog.DEBUG("keyserver.jsm: accessVksServer.onload(): status=" + xmlReq.status + "\n");
        switch (actionFlag) {
          case EnigmailConstants.UPLOAD_KEY:
          case EnigmailConstants.GET_CONFIRMATION_LINK:

            EnigmailLog.DEBUG("keyserver.jsm: accessVksServer.onload: " + xmlReq.responseText + "\n");
            if (xmlReq.status >= 400) {
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              resolve(xmlReq.responseText);
            }
            return;

          case EnigmailConstants.SEARCH_KEY:
            if (xmlReq.status === 404) {
              // key not found
              resolve("");
            }
            else if (xmlReq.status >= 400) {
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              resolve(xmlReq.responseText);
            }
            return;

          case EnigmailConstants.DOWNLOAD_KEY:
            if (xmlReq.status >= 400 && xmlReq.status < 500) {
              // key not found
              resolve(1);
            }
            else if (xmlReq.status >= 500) {
              EnigmailLog.DEBUG("keyserver.jsm: accessVksServer.onload: " + xmlReq.responseText + "\n");
              reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_ERROR));
            }
            else {
              let errorMsgObj = {},
                importedKeysObj = {};
              let r = EnigmailKeyRing.importKey(null, false, xmlReq.responseText, "", errorMsgObj, importedKeysObj);
              if (r === 0) {
                resolve(importedKeysObj.value);
              }
              else {
                reject(createError(EnigmailConstants.KEYSERVER_ERR_IMPORT_ERROR));
              }
            }
            return;
        }
        resolve(-1);
      };

      xmlReq.onerror = function(e) {
        EnigmailLog.DEBUG("keyserver.jsm: accessVksServer.accessKeyServer: onerror: " + e + "\n");
        let err = EnigmailXhrUtils.createTCPErrorFromFailedXHR(e.target);
        switch (err.type) {
          case 'SecurityCertificate':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_CERTIFICATE_ERROR));
            break;
          case 'SecurityProtocol':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SECURITY_ERROR));
            break;
          case 'Network':
            reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
            break;
        }
        reject(createError(EnigmailConstants.KEYSERVER_ERR_SERVER_UNAVAILABLE));
      };

      xmlReq.onloadend = function() {
        EnigmailLog.DEBUG("keyserver.jsm: accessVksServer.accessKeyServer: loadEnd\n");
      };

      let {
        url,
        host,
        method,
        contentType
      } = this.createRequestUrl(keyserver, actionFlag, keyId);

      EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.accessKeyServer: requesting ${method} for ${url}\n`);
      xmlReq.open(method, url);
      xmlReq.setRequestHeader("Content-Type", contentType);
      xmlReq.send(payLoad);
    });
  },

  /**
   * Download keys from a keyserver
   * @param keyIDs:      String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  download: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.download(${keyIDs})\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };

    for (let i = 0; i < keyIdArr.length; i++) {
      try {
        let r = await this.accessKeyServer(EnigmailConstants.DOWNLOAD_KEY, keyserver, keyIdArr[i], listener);
        if (Array.isArray(r)) {
          retObj.keyList = retObj.keyList.concat(r);
        }
      }
      catch (ex) {
        retObj.result = ex.result;
        retObj.errorDetails = ex.errorDetails;
        throw retObj;
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  refresh: function(keyServer, listener = null) {
    let keyList = EnigmailKeyRing.getAllKeys().keyList.map(keyObj => {
      return "0x" + keyObj.fpr;
    }).join(" ");

    return this.download(keyList, keyServer, listener);
  },

  requestConfirmationLink: async function(keyserver, jsonFragment) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.requestConfirmationLink()\n`);

    let response = JSON.parse(jsonFragment);

    let addr = [];

    for (let email in response.status) {
      if (response.status[email] !== "published") {
        addr.push(email);
      }
    }

    if (addr.length > 0) {
      let r = await this.accessKeyServer(EnigmailConstants.GET_CONFIRMATION_LINK, keyserver, {
        token: response.token,
        addresses: addr
      }, null);

      if (typeof r === "string") {
        return addr.length;
      }
    }

    return 0;
  },

  /**
   * Upload keys to a keyserver
   * @param keyIDs: String  - space-separated list of search terms or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<...>
   */
  upload: async function(keyIDs, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.upload(${keyIDs})\n`);
    let keyIdArr = keyIDs.split(/ +/);
    let retObj = {
      result: 0,
      errorDetails: "",
      keyList: []
    };

    for (let i = 0; i < keyIdArr.length; i++) {
      let keyObj = EnigmailKeyRing.getKeyById(keyIdArr[i]);

      if (!keyObj.secretAvailable) {
        // VKS keyservers only accept uploading own keys
        retObj.result = 1;
        retObj.errorDetails = "NO_SECRET_KEY_AVAILABLE";
        throw retObj;
      }

      try {
        let r = await this.accessKeyServer(EnigmailConstants.UPLOAD_KEY, keyserver, keyIdArr[i], listener);
        if (typeof r === "string") {
          retObj.keyList.push(keyIdArr[i]);
          let req = await this.requestConfirmationLink(keyserver, r);

          if (req >= 0) {
            retObj.result = 0;
            retObj.numEmails = req;
          }
        }
        else {
          retObj.result = r;
        }
      }
      catch (ex) {
        retObj.result = ex.result;
        retObj.errorDetails = ex.errorDetails;
        throw retObj;
      }

      if (listener && "onProgress" in listener) {
        listener.onProgress((i + 1) / keyIdArr.length * 100);
      }
    }

    return retObj;
  },

  /**
   * Search for keys on a keyserver
   * @param searchTerm:  String  - search term
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *    - result: Number
   *    - pubKeys: Array of Object:
   *         PubKeys: Object with:
   *           - keyId: String
   *           - keyLen: String
   *           - keyType: String
   *           - created: String (YYYY-MM-DD)
   *           - status: String: one of ''=valid, r=revoked, e=expired
   *           - uid: Array of Strings with UIDs
   */
  search: async function(searchTerm, keyserver, listener = null) {
    EnigmailLog.DEBUG(`keyserver.jsm: accessVksServer.search(${searchTerm})\n`);
    let retObj = {
      result: 0,
      errorDetails: "",
      pubKeys: []
    };
    let key = null;

    let searchArr = searchTerm.split(/ +/);

    try {
      for (let i in searchArr) {
        let r = await this.accessKeyServer(EnigmailConstants.SEARCH_KEY, keyserver, searchArr[i], listener);

        const cApi = EnigmailCryptoAPI();
        let keyList = await cApi.getKeyListFromKeyBlock(r);

        for (let k in keyList) {
          key = {
            keyId: keyList[k].fpr,
            keyLen: "0",
            keyType: "",
            created: keyList[k].created,
            uid: [keyList[k].name],
            status: keyList[k].revoke ? "r" : ""
          };

          for (let uid of keyList[k].uids) {
            key.uid.push(uid);
          }

          retObj.pubKeys.push(key);
        }
      }
    }
    catch (ex) {
      retObj.result = ex.result;
      retObj.errorDetails = ex.errorDetails;
      throw retObj;
    }

    return retObj;
  }
};

var EnigmailKeyServer = {
  /**
   * Download keys from a keyserver
   * @param keyIDs:      String  - space-separated list of FPRs or key IDs
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *     Object: - result: Number           - result Code (0 = OK),
   *             - keyList: Array of String - imported key FPR
   */
  download: function(keyIDs, keyserver = null, listener) {
    let acc = getAccessType(keyserver);
    return acc.download(keyIDs, keyserver, listener);
  },

  /**
   * Upload keys to a keyserver
   * @param keyIDs:      String  - space-separated list of key IDs or FPR
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *     Object: - result: Number           - result Code (0 = OK),
   *             - keyList: Array of String - imported key FPR
   */

  upload: function(keyIDs, keyserver = null, listener) {
    let acc = getAccessType(keyserver);
    return acc.upload(keyIDs, keyserver, listener);
  },

  /**
   * Search keys on a keyserver
   * @param searchString: String - search term. Multiple email addresses can be search by spaces
   * @param keyserver:    String - keyserver URL (optionally incl. protocol)
   * @param listener:     optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<Object>
   *    - result: Number
   *    - pubKeys: Array of Object:
   *         PubKeys: Object with:
   *           - keyId: String
   *           - keyLen: String
   *           - keyType: String
   *           - created: String (YYYY-MM-DD)
   *           - status: String: one of ''=valid, r=revoked, e=expired
   *           - uid: Array of Strings with UIDs
   */
  search: function(searchString, keyserver = null, listener) {
    let acc = getAccessType(keyserver);
    return acc.search(searchString, keyserver, listener);
  },

  /**
   * Refresh all keys
   *
   * @param keyserver:   String  - keyserver URL (optionally incl. protocol)
   * @param listener:    optional Object implementing the KeySrvListener API (above)
   *
   * @return:   Promise<resultStatus> (identical to download)
   */
  refresh: function(keyserver = null, listener) {
    let acc = getAccessType(keyserver);
    return acc.refresh(keyserver, listener);
  }
};
