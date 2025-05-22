/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

add_task(async function () {
  const extension = ExtensionTestUtils.loadExtension({
    manifest: {
      oauth_provider: {
        issuer: "oauth.invalid",
        clientId: "my_client_id",
        clientSecret: "my_secret",
        authorizationEndpoint: "https://oauth.invalid/auth",
        tokenEndpoint: "https://oauth.invalid/token",
        redirectionEndpoint: "https://localhost",
        usePKCE: false,
        hostnames: ["mail.invalid"],
        scopes: "my_scope",
      },
    },
  });

  Assert.ok(
    !OAuth2Providers.getHostnameDetails("mail.invalid", "imap"),
    "hostname details should not be registered before the extension starts"
  );
  Assert.ok(
    !OAuth2Providers.getIssuerDetails("oauth.invalid"),
    "issuer details should not be registered before the extension starts"
  );

  await extension.startup();

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("mail.invalid", "imap"),
    {
      issuer: "oauth.invalid",
      allScopes: "my_scope",
      requiredScopes: "my_scope",
    },
    "hostname details should be registered while the extension is running"
  );
  Assert.deepEqual(
    OAuth2Providers.getIssuerDetails("oauth.invalid"),
    {
      name: "oauth.invalid",
      builtIn: false,
      clientId: "my_client_id",
      clientSecret: "my_secret",
      authorizationEndpoint: "https://oauth.invalid/auth",
      tokenEndpoint: "https://oauth.invalid/token",
      redirectionEndpoint: "https://localhost/",
      usePKCE: false,
    },
    "issuer details should be registered while the extension is running"
  );

  await extension.unload();

  Assert.ok(
    !OAuth2Providers.getHostnameDetails("mail.invalid", "imap"),
    "hostname details should be unregistered after the extension stops"
  );
  Assert.ok(
    !OAuth2Providers.getIssuerDetails("oauth.invalid"),
    "issuer details should be unregistered after the extension stops"
  );
});
