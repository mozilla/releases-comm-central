/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineModuleGetter(
  lazy,
  "LDAPClient",
  "resource:///modules/LDAPClient.jsm"
);

/**
 * A module to manage LDAP operation.
 *
 * @implements {nsILDAPOperation}
 */
export class LDAPOperation {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPOperation"]);

  init(connection, listener, closure) {
    this._listener = listener;
    this._connection = connection;
    this._client = connection.wrappedJSObject.client;

    this._referenceUrls = [];

    // Cache request arguments to use when searching references.
    this._simpleBindPassword = null;
    this._saslBindArgs = null;
    this._searchArgs = null;
  }

  simpleBind(password) {
    this._password = password;
    try {
      this._messageId = this._client.bind(
        this._connection.bindName,
        password,
        res => this._onBindSuccess(res.result.resultCode)
      );
    } catch (e) {
      this._listener.onLDAPError(e.result, null, "");
    }
  }

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
          } else if (res.result.resultCode == Ci.nsILDAPErrors.SUCCESS) {
            this._onBindSuccess(res.result.resultCode);
          }
        }
      );
    } catch (e) {
      this._listener.onLDAPError(e.result, null, "");
    }
  }

  searchExt(baseDN, scope, filter, attributes, timeout, limit) {
    this._searchArgs = [baseDN, scope, filter, attributes, timeout, limit];
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
            this._referenceUrls.push(...res.result);
          } else if (res.constructor.name == "SearchResultDone") {
            // NOTE: we create a new connection for every search, can be changed
            // to reuse connections.
            this._client.onError = () => {};
            this._client.unbind();
            this._messageId = null;
            if (this._referenceUrls.length) {
              this._searchReference(this._referenceUrls.shift());
            } else {
              this._listener.onLDAPMessage({
                errorCode: res.result.resultCode,
                type: Ci.nsILDAPMessage.RES_SEARCH_RESULT,
              });
            }
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
   * Decide what to do on bind success. When searching a reference url, trigger
   * a new search. Otherwise, emit a message to this._listener.
   *
   * @param {number} errorCode - The result code of BindResponse.
   */
  _onBindSuccess(errorCode) {
    if (this._searchingReference) {
      this.searchExt(...this._searchArgs);
    } else {
      this._listener.onLDAPMessage({
        errorCode,
        type: Ci.nsILDAPMessage.RES_BIND,
      });
    }
  }

  /**
   * Connect to a reference url and continue the search.
   *
   * @param {string} urlStr - A url string we get from SearchResultReference.
   */
  _searchReference(urlStr) {
    this._searchingReference = true;
    const urlParser = Cc[
      "@mozilla.org/network/ldap-url-parser;1"
    ].createInstance(Ci.nsILDAPURLParser);
    let url;
    try {
      url = urlParser.parse(urlStr);
    } catch (e) {
      console.error(e);
      return;
    }
    this._client = new lazy.LDAPClient(
      url.host,
      url.port,
      url.options & Ci.nsILDAPURL.OPT_SECURE
    );
    this._client.onOpen = () => {
      if (this._password) {
        this.simpleBind(this._password);
      } else {
        this.saslBind(...this._saslBindData);
      }
    };
    this._client.onError = (status, secInfo) => {
      this._listener.onLDAPError(status, secInfo, `${url.host}:${url.port}`);
    };
    this._client.connect();
  }
}

LDAPOperation.prototype.classID = Components.ID(
  "{a6f94ca4-cd2d-4983-bcf2-fe936190955c}"
);
