/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPSyncQuery"];

/**
 * @implements {nsILDAPMessageListener}
 * @implements {nsILDAPSyncQuery}
 */
class LDAPSyncQuery {
  QueryInterface = ChromeUtils.generateQI([
    "nsILDAPMessageListener",
    "nsILDAPSyncQuery",
  ]);

  /** @see nsILDAPMessageListener */
  onLDAPInit() {
    this._operation = Cc[
      "@mozilla.org/network/ldap-operation;1"
    ].createInstance(Ci.nsILDAPOperation);
    this._operation.init(this._connection, this, null);
    this._operation.simpleBind("");
  }

  onLDAPMessage(msg) {
    switch (msg.type) {
      case Ci.nsILDAPMessage.RES_BIND:
        this._onLDAPBind(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_ENTRY:
        this._onLDAPSearchEntry(msg);
        break;
      case Ci.nsILDAPMessage.RES_SEARCH_RESULT:
        this._onLDAPSearchResult(msg);
        break;
      default:
        break;
    }
  }

  onLDAPError(status, secInfo, location) {
    this._statusCode = status;
    this._finished = true;
  }

  /** @see nsILDAPSyncQuery */
  getQueryResults(ldapUrl, protocolVersion) {
    this._ldapUrl = ldapUrl;
    this._connection = Cc[
      "@mozilla.org/network/ldap-connection;1"
    ].createInstance(Ci.nsILDAPConnection);
    this._connection.init(ldapUrl, "", this, null, protocolVersion);

    this._statusCode = 0;
    this._result = "";
    this._finished = false;

    Services.tm.spinEventLoopUntil(
      "getQueryResults is a sync function",
      () => this._finished
    );
    if (this._statusCode) {
      throw Components.Exception("getQueryResults failed", this._statusCode);
    }
    return this._result;
  }

  /**
   * Handler of nsILDAPMessage.RES_BIND message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  _onLDAPBind(msg) {
    if (msg.errorCode != Ci.nsILDAPErrors.SUCCESS) {
      this._statusCode = msg.errorCode;
      this._finished = true;
      return;
    }
    this._operation.init(this._connection, this, null);
    this._operation.searchExt(
      this._ldapUrl.dn,
      this._ldapUrl.scope,
      this._ldapUrl.filter,
      this._ldapUrl.attributes,
      0,
      0
    );
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_ENTRY message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  _onLDAPSearchEntry(msg) {
    for (const attr of msg.getAttributes()) {
      for (const value of msg.getValues(attr)) {
        this._result += `\n${attr}=${value}`;
      }
    }
  }

  /**
   * Handler of nsILDAPMessage.RES_SEARCH_RESULT message.
   *
   * @param {nsILDAPMessage} msg - The received LDAP message.
   */
  _onLDAPSearchResult(msg) {
    this._finished = true;
  }
}
