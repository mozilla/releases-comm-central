/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPOperation"];

/**
 * A module to manage LDAP operation.
 *
 * @implements {nsILDAPOperation}
 */
class LDAPOperation {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPOperation"]);

  init(connection, listener, closure) {
    this._listener = listener;
    this._connection = connection;
    this._client = connection.wrappedJSObject.client;
  }

  simpleBind(password) {
    this._messageId = this._client.bind(
      this._connection.bindName,
      password,
      res => {
        this._listener.onLDAPMessage({
          errorCode: res.result.resultCode,
          type: Ci.nsILDAPMessage.RES_BIND,
        });
      }
    );
  }

  saslBind(service, mechanism, authModuleType, serverCredentials) {
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
          this._listener.onLDAPMessage({
            errorCode: res.result.resultCode,
            type: Ci.nsILDAPMessage.RES_BIND,
          });
        }
      }
    );
  }

  searchExt(baseDN, scope, filter, attributes, timeout, limit) {
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
        } else if (res.constructor.name == "SearchResultDone") {
          this._messageId = null;
          this._listener.onLDAPMessage({
            errorCode: res.result.resultCode,
            type: Ci.nsILDAPMessage.RES_SEARCH_RESULT,
          });
        }
      }
    );
  }

  abandonExt() {
    if (this._messageId) {
      this._client.abandon(this._messageId);
    }
  }
}

LDAPOperation.prototype.classID = Components.ID(
  "{a6f94ca4-cd2d-4983-bcf2-fe936190955c}"
);
