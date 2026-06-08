/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

var { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

this.oauth_provider = class extends ExtensionAPIPersistent {
  onManifestEntry() {
    const details = this.extension.manifest.oauth_provider;
    OAuth2Providers.registerProvider(
      {
        name: details.issuer,
        clientId: details.clientId,
        clientSecret: details.clientSecret,
        issuerIdentifier: details.issuerIdentifier,
        authorizationEndpoint: details.authorizationEndpoint,
        tokenEndpoint: details.tokenEndpoint,
        redirectionEndpoint: details.redirectionEndpoint,
        usePKCE: details.usePKCE,
        useExternalBrowser: details.useExternalBrowser,
      },
      details.hostnames,
      details.scopes
    );
  }

  onShutdown(isAppShutdown) {
    if (isAppShutdown) {
      return;
    }

    const details = this.extension.manifest.oauth_provider;
    OAuth2Providers.unregisterProvider(details.issuer);
  }
};
