/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const EXPORTED_SYMBOLS = ["LDAPDirectory"];

const { AddrBookDirectory } = ChromeUtils.import(
  "resource:///modules/AddrBookDirectory.jsm"
);
const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  QueryStringToExpression: "resource:///modules/QueryStringToExpression.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

/**
 * Set `user_pref("mailnews.ldap.jsmodule", true);` to use this module.
 *
 * @implements {nsIAbLDAPDirectory}
 * @implements {nsIAbDirectory}
 */

class LDAPDirectory extends AddrBookDirectory {
  QueryInterface = ChromeUtils.generateQI([
    "nsIAbLDAPDirectory",
    "nsIAbDirectory",
  ]);

  init(uri) {
    this._uri = uri;

    let searchIndex = uri.indexOf("?");
    this._dirPrefId = uri.substr(
      "moz-abldapdirectory://".length,
      searchIndex == -1 ? undefined : searchIndex
    );

    super.init(uri);
  }

  get replicationFileName() {
    return this.getStringValue("filename");
  }

  set replicationFileName(value) {
    return this.setStringValue("filename", value);
  }

  get protocolVersion() {
    return this.getStringValue("protocolVersion", "3") == "3"
      ? Ci.nsILDAPConnection.VERSION3
      : Ci.nsILDAPConnection.VERSION2;
  }

  set protocolVersion(value) {
    return this.setStringValue(
      "protocolVersion",
      value == Ci.nsILDAPConnection.VERSION3 ? "3" : "2"
    );
  }

  get saslMechanism() {
    return this.getStringValue("auth.saslmech");
  }

  set saslMechanism(value) {
    return this.setStringValue("auth.saslmech", value);
  }

  get authDn() {
    return this.getStringValue("auth.dn");
  }

  set authDn(value) {
    return this.setStringValue("auth.dn", value);
  }

  get attributeMap() {
    let mapSvc = Cc[
      "@mozilla.org/addressbook/ldap-attribute-map-service;1"
    ].createInstance(Ci.nsIAbLDAPAttributeMapService);
    return mapSvc.getMapForPrefBranch(this._dirPrefId);
  }

  get lDAPURL() {
    let uri = this.getStringValue("uri");
    return Services.io.newURI(uri || `ldap://${this._uri.slice(22)}`);
  }

  /**
   * @see {AddrBookDirectory}
   */
  get cards() {
    return new Map();
  }

  /**
   * @see {AddrBookDirectory}
   */
  get lists() {
    return new Map();
  }

  search(queryString, listener) {
    if (!this._query) {
      this._query = Cc[
        "@mozilla.org/addressbook/ldap-directory-query;1"
      ].createInstance(Ci.nsIAbDirectoryQuery);
    }

    this.stopSearch();
    let args = Cc[
      "@mozilla.org/addressbook/directory/query-arguments;1"
    ].createInstance(Ci.nsIAbDirectoryQueryArguments);
    args.expression = QueryStringToExpression.convert(queryString);
    args.querySubDirectories = true;
    args.typeSpecificArg = this.attributeMap;

    let maxHits = this.getIntValue("maxHits", 100);
    this._queryContext = this._query.doQuery(this, args, listener, maxHits, 0);
  }

  stopSearch() {
    this._query.stopQuery(this._queryContext);
  }
}

LDAPDirectory.prototype.classID = Components.ID(
  "{8683e821-f1b0-476d-ac15-07771c79bb11}"
);
