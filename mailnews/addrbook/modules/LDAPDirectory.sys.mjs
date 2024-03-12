/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { AddrBookDirectory } from "resource:///modules/AddrBookDirectory.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";

const lazy = {};
ChromeUtils.defineESModuleGetters(lazy, {
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  QueryStringToExpression:
    "resource:///modules/QueryStringToExpression.sys.mjs",
});

/**
 * @augments {AddrBookDirectory}
 * @implements {nsIAbLDAPDirectory}
 * @implements {nsIAbDirectory}
 */
export class LDAPDirectory extends AddrBookDirectory {
  QueryInterface = ChromeUtils.generateQI([
    "nsIAbLDAPDirectory",
    "nsIAbDirectory",
  ]);

  init(uri) {
    this._uri = uri;

    const searchIndex = uri.indexOf("?");
    this._dirPrefId = uri.substr(
      "moz-abldapdirectory://".length,
      searchIndex == -1 ? undefined : searchIndex
    );

    super.init(uri);
  }

  get readOnly() {
    return true;
  }

  get isRemote() {
    return true;
  }

  get isSecure() {
    return this.lDAPURL.scheme == "ldaps";
  }

  get propertiesChromeURI() {
    return "chrome://messenger/content/addressbook/pref-directory-add.xhtml";
  }

  get dirType() {
    return Ci.nsIAbManager.LDAP_DIRECTORY_TYPE;
  }

  get replicationFileName() {
    return this.getStringValue("filename");
  }

  set replicationFileName(value) {
    this.setStringValue("filename", value);
  }

  get replicationFile() {
    return new lazy.FileUtils.File(
      PathUtils.join(PathUtils.profileDir, this.replicationFileName)
    );
  }

  get protocolVersion() {
    return this.getStringValue("protocolVersion", "3") == "3"
      ? Ci.nsILDAPConnection.VERSION3
      : Ci.nsILDAPConnection.VERSION2;
  }

  set protocolVersion(value) {
    this.setStringValue(
      "protocolVersion",
      value == Ci.nsILDAPConnection.VERSION3 ? "3" : "2"
    );
  }

  get saslMechanism() {
    return this.getStringValue("auth.saslmech");
  }

  set saslMechanism(value) {
    this.setStringValue("auth.saslmech", value);
  }

  get authDn() {
    return this.getStringValue("auth.dn");
  }

  set authDn(value) {
    this.setStringValue("auth.dn", value);
  }

  get maxHits() {
    return this.getIntValue("maxHits", 100);
  }

  set maxHits(value) {
    this.setIntValue("maxHits", value);
  }

  get attributeMap() {
    const mapSvc = Cc[
      "@mozilla.org/addressbook/ldap-attribute-map-service;1"
    ].createInstance(Ci.nsIAbLDAPAttributeMapService);
    return mapSvc.getMapForPrefBranch(this._dirPrefId);
  }

  get lDAPURL() {
    const uri = this.getStringValue("uri") || `ldap://${this._uri.slice(22)}`;
    return Services.io.newURI(uri).QueryInterface(Ci.nsILDAPURL);
  }

  set lDAPURL(uri) {
    this.setStringValue("uri", uri.spec);
  }

  get childCardCount() {
    return 0;
  }

  get childCards() {
    if (Services.io.offline) {
      return this.replicationDB.childCards;
    }
    return super.childCards;
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

  get replicationDB() {
    this._replicationDB?.cleanUp();
    this._replicationDB = Cc[
      "@mozilla.org/addressbook/directory;1?type=jsaddrbook"
    ].createInstance(Ci.nsIAbDirectory);
    this._replicationDB.init(`jsaddrbook://${this.replicationFileName}`);
    return this._replicationDB;
  }

  getCardFromProperty(property, value, caseSensitive) {
    return null;
  }

  search(queryString, searchString, listener) {
    if (Services.io.offline) {
      this.replicationDB.search(queryString, searchString, listener);
      return;
    }
    this._query = Cc[
      "@mozilla.org/addressbook/ldap-directory-query;1"
    ].createInstance(Ci.nsIAbDirectoryQuery);

    const args = Cc[
      "@mozilla.org/addressbook/directory/query-arguments;1"
    ].createInstance(Ci.nsIAbDirectoryQueryArguments);
    args.expression = lazy.QueryStringToExpression.convert(queryString);
    args.querySubDirectories = true;
    args.typeSpecificArg = this.attributeMap;

    this._query.doQuery(this, args, listener, this.maxHits, 0);
  }

  useForAutocomplete(identityKey) {
    // If we're online, then don't allow search during local autocomplete - must
    // use the separate LDAP autocomplete session due to the current interfaces
    const useDirectory = Services.prefs.getBoolPref(
      "ldap_2.autoComplete.useDirectory",
      false
    );
    if (!Services.io.offline || (!useDirectory && !identityKey)) {
      return false;
    }

    let prefName = "";
    if (identityKey) {
      // If we have an identity string, try and find out the required directory
      // server.
      const identity = MailServices.accounts.getIdentity(identityKey);
      if (identity.overrideGlobalPref) {
        prefName = identity.directoryServer;
      }
      if (!prefName && !useDirectory) {
        return false;
      }
    }
    if (!prefName) {
      prefName = Services.prefs.getCharPref(
        "ldap_2.autoComplete.directoryServer"
      );
    }
    if (prefName == this.dirPrefId) {
      return this.replicationFile.exists();
    }

    return false;
  }
}

LDAPDirectory.prototype.classID = Components.ID(
  "{8683e821-f1b0-476d-ac15-07771c79bb11}"
);
