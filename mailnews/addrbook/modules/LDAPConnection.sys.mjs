/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  LDAPClient: "resource:///modules/LDAPClient.sys.mjs",
});

/**
 * A module to manage LDAP connection.
 *
 * @implements {nsILDAPConnection}
 */
export class LDAPConnection {
  QueryInterface = ChromeUtils.generateQI(["nsILDAPConnection"]);

  get bindName() {
    return this._bindName;
  }

  init(url, bindName, listener) {
    const useSecureTransport = url.scheme == "ldaps";
    let port = url.port;
    if (port == -1) {
      // -1 corresponds to the protocol's default port.
      port = useSecureTransport ? 636 : 389;
    }
    this.client = new lazy.LDAPClient(url.host, port, useSecureTransport);
    this._url = url;
    this._bindName = bindName;
    this.client.onOpen = () => {
      listener.onLDAPInit();
    };
    this.client.onError = (status, secInfo) => {
      listener.onLDAPError(status, secInfo, `${url.host}:${port}`);
    };
    this.client.connect();
  }

  get wrappedJSObject() {
    return this;
  }
}

LDAPConnection.prototype.classID = Components.ID(
  "{f87b71b5-2a0f-4b37-8e4f-3c899f6b8432}"
);
