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
      details.issuer,
      details.clientId,
      details.clientSecret,
      details.authorizationEndpoint,
      details.tokenEndpoint,
      details.redirectionEndpoint,
      details.usePKCE,
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
