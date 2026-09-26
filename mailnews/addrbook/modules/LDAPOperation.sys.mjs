/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  LDAPClient: "resource:///modules/LDAPClient.sys.mjs",
});

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "mailnews.ldap",
    maxLogLevel: "Warn",
    maxLogLevelPref: "mailnews.ldap.loglevel",
  });
});

// Maximum number of search references to follow for a single search. Only
// references returned by the configured directory are followed.
const MAX_REFERRALS = 5;

/**
 * A module to manage LDAP operation.
 *
 * @implements {nsILDAPOperation}
 */
export class LDAPOperation {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPOperation"]);

  /**
   * @param {nsILDAPConnection} connection - The connection to use.
   * @param {nsILDAPMessageListener} listener - The listener to notify of
   *   messages and errors.
   */
  init(connection, listener) {
    this._listener = listener;
    this._connection = connection;
    this._client = connection.wrappedJSObject.client;

    this._referenceUrls = [];
    this._referralCount = 0;
    this._searchResultCode = null;

    // Cache request arguments to use when searching references.
    this._password = null;
    this._saslBindArgs = null;
    this._searchArgs = null;
  }

  simpleBind(password) {
    this._password = password;
    try {
      this._messageId = this._client.bind(
        this._connection.bindName,
        password,
        res => this._onBindResponse(res.result.resultCode)
      );
    } catch (e) {
      this._listener.onLDAPError(e.result, null, "");
    }
  }

  /**
   * @param {string} service - The service host name to bind.
   * @param {string} mechanism - The SASL mechanism to use, e.g. GSSAPI.
   * @param {string} authModuleType - The auth module type, @see nsIMailAuthModule.
   * @param {ArrayBuffer} [serverCredentials] - The challenge token returned
   *   from the server, or undefined for the first request.
   */
  saslBind(service, mechanism, authModuleType, serverCredentials) {
    this._saslBindArgs = [service, mechanism, authModuleType];
    try {
      this._client.saslBind(
        service,
        mechanism,
        authModuleType,
        serverCredentials,
        res => {
          if (res.result.resultCode == Ci.nsILDAPErrors.SASL_BIND_IN_PROGRESS) {
            this.saslBind(
              service,
              mechanism,
              authModuleType,
              res.result.serverSaslCreds
            );
          } else if (
            res.result.resultCode == Ci.nsILDAPErrors.SUCCESS ||
            this._searchingReference
          ) {
            this._onBindResponse(res.result.resultCode);
          }
        }
      );
    } catch (e) {
      this._listener.onLDAPError(e.result, null, "");
    }
  }

  /**
   * @param {string} baseDN - The name to search.
   * @param {number} scope - The scope to search.
   * @param {string} filter - The filter string.
   * @param {string} attributes - Attributes to include in the search result.
   * @param {number} timeout - The seconds to wait.
   * @param {number} limit - Maximum number of entries to return.
   */
  searchExt(baseDN, scope, filter, attributes, timeout, limit) {
    this._searchArgs = [baseDN, scope, filter, attributes, timeout, limit];
    this._search(...this._searchArgs);
  }

  /**
   * Send a search request with the current client.
   *
   * @param {string} baseDN - The name to search.
   * @param {number} scope - The scope to search.
   * @param {string} filter - The filter string.
   * @param {string} attributes - Attributes to include in the search result.
   * @param {number} timeout - The seconds to wait.
   * @param {number} limit - Maximum number of entries to return.
   */
  _search(baseDN, scope, filter, attributes, timeout, limit) {
    try {
      this._messageId = this._client.search(
        baseDN,
        scope,
        filter,
        attributes,
        timeout,
        limit,
        res => {
          if (res.constructor.name == "SearchResultEntry") {
            this._listener.onLDAPMessage({
              QueryInterface: ChromeUtils.generateQI(["nsILDAPMessage"]),
              errorCode: 0,
              type: Ci.nsILDAPMessage.RES_SEARCH_ENTRY,
              getAttributes() {
                return Object.keys(res.result.attributes);
              },
              // Find the matching attribute name while ignoring the case.
              _getAttribute(attr) {
                attr = attr.toLowerCase();
                return this.getAttributes().find(x => x.toLowerCase() == attr);
              },
              getValues(attr) {
                attr = this._getAttribute(attr);
                return res.result.attributes[attr]?.map(v =>
                  new TextDecoder().decode(v)
                );
              },
              getBinaryValues(attr) {
                attr = this._getAttribute(attr);
                return res.result.attributes[attr]?.map(v => ({
                  // @see nsILDAPBERValue
                  get: () => new Uint8Array(v),
                }));
              },
            });
          } else if (res.constructor.name == "SearchResultReference") {
            if (!this._searchingReference) {
              this._referenceUrls.push(...res.result);
            }
          } else if (res.constructor.name == "SearchResultDone") {
            // NOTE: we create a new connection for every search, can be changed
            // to reuse connections.
            this._client.onError = () => {};
            this._client.unbind();
            this._messageId = null;
            if (!this._searchingReference) {
              this._searchResultCode = res.result.resultCode;
            }
            this._searchNextReference();
          }
        }
      );
    } catch (e) {
      this._listener.onLDAPError(e.result, null, "");
    }
  }

  abandonExt() {
    if (this._messageId) {
      this._client.abandon(this._messageId);
    }
  }

  /**
   * Decide what to do on a bind response. When searching a reference url,
   * trigger a new search, or skip to the next reference if the bind failed.
   * Otherwise, emit a message to this._listener.
   *
   * @param {number} errorCode - The result code of BindResponse.
   */
  _onBindResponse(errorCode) {
    if (this._searchingReference) {
      if (errorCode != Ci.nsILDAPErrors.SUCCESS) {
        this._client.onError = () => {};
        this._client.unbind();
        this._searchNextReference();
        return;
      }
      const [baseDN, ...args] = this._searchArgs;
      this._search(this._referenceDN || baseDN, ...args);
    } else {
      this._listener.onLDAPMessage({
        errorCode,
        type: Ci.nsILDAPMessage.RES_BIND,
      });
    }
  }

  /**
   * Follow the next usable reference url, or emit the final search result to
   * this._listener if there is none left.
   */
  _searchNextReference() {
    while (this._referenceUrls.length) {
      if (this._searchReference(this._referenceUrls.shift())) {
        return;
      }
    }
    this._listener.onLDAPMessage({
      errorCode: this._searchResultCode,
      type: Ci.nsILDAPMessage.RES_SEARCH_RESULT,
    });
  }

  /**
   * Connect to a reference url and continue the search. The credentials of
   * the directory are only sent if the reference points to the same host,
   * other hosts are bound to anonymously. References that would downgrade a
   * secure connection to an insecure one are ignored.
   *
   * @param {string} urlStr - A url string we get from SearchResultReference.
   * @returns {boolean} Whether the reference is being followed.
   */
  _searchReference(urlStr) {
    if (this._referralCount >= MAX_REFERRALS) {
      lazy.log.warn(`Too many LDAP referrals, ignoring ${urlStr}`);
      return false;
    }
    const urlParser = Cc[
      "@mozilla.org/network/ldap-url-parser;1"
    ].createInstance(Ci.nsILDAPURLParser);
    let url;
    try {
      url = urlParser.parse(urlStr);
    } catch (e) {
      lazy.log.error(e);
      return false;
    }
    const directoryUrl = this._connection.wrappedJSObject.url;
    const useSecureTransport = !!(url.options & Ci.nsILDAPURL.OPT_SECURE);
    if (directoryUrl.scheme == "ldaps" && !useSecureTransport) {
      lazy.log.warn(`Ignoring insecure LDAP referral ${urlStr}`);
      return false;
    }
    const sameHost = url.host.toLowerCase() == directoryUrl.host.toLowerCase();
    let port = url.port;
    if (port == -1) {
      port = useSecureTransport ? 636 : 389;
    }

    this._referralCount++;
    this._searchingReference = true;
    this._referenceDN = url.dn;
    this._client = new lazy.LDAPClient(url.host, port, useSecureTransport);
    this._client.onOpen = () => {
      if (!sameHost) {
        this._client.bind("", "", res =>
          this._onBindResponse(res.result.resultCode)
        );
      } else if (this._saslBindArgs) {
        this.saslBind(...this._saslBindArgs);
      } else {
        this.simpleBind(this._password);
      }
    };
    this._client.onError = () => {
      this._searchNextReference();
    };
    this._client.connect();
    return true;
  }
}

LDAPOperation.prototype.classID = Components.ID(
  "{a6f94ca4-cd2d-4983-bcf2-fe936190955c}"
);
