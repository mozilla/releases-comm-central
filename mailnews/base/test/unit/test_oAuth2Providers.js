/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { OAuth2Providers } = ChromeUtils.importESModule(
  "resource:///modules/OAuth2Providers.sys.mjs"
);

add_task(function testHostnameDetails() {
  // Test we need both arguments.

  Assert.throws(
    () => OAuth2Providers.getHostnameDetails("mochi.test"),
    /required/,
    "getHostnameDetails without a second argument should throw"
  );

  // Test a domain with only a string type, and subdomains of it.

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("mochi.test", "anything"),
    {
      issuer: "test.test",
      allScopes: "test_scope",
      requiredScopes: "test_scope",
    },
    "a domain with no type data should return all scopes as required"
  );
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("subdomain.mochi.test", "anything"),
    {
      issuer: "test.test",
      allScopes: "test_scope",
      requiredScopes: "test_scope",
    },
    "a sub-domain should return the same results as the domain"
  );
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("sub.subdomain.mochi.test", "anything"),
    {
      issuer: "test.test",
      allScopes: "test_scope",
      requiredScopes: "test_scope",
    },
    "a sub-sub-domain should return the same results as the domain"
  );

  // Test known types.

  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "imap"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_mail",
  });
  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "pop3"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_mail",
  });
  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "smtp"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_mail",
  });
  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "carddav"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_addressbook",
  });
  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "caldav"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_calendar",
  });

  // Test unknown types.

  Assert.ok(
    !OAuth2Providers.getHostnameDetails("test.test", "other"),
    "getHostnameDetails with an unknown type should not return results"
  );

  // Test subdomains.

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("subdomain.test.test", "imap"),
    {
      issuer: "test.test",
      allScopes: "test_mail test_addressbook test_calendar",
      requiredScopes: "test_mail",
    },
    "a sub-domain should return the same results as the domain"
  );

  // Test modifications don't change the original data. Hostname details
  // objects aren't frozen as they're single-use objects, but let's make sure.
  const details = OAuth2Providers.getHostnameDetails("test.test", "pop3");
  details.issuer = "sneaky.test";
  details.foo = "bar";
  Assert.deepEqual(OAuth2Providers.getHostnameDetails("test.test", "pop3"), {
    issuer: "test.test",
    allScopes: "test_mail test_addressbook test_calendar",
    requiredScopes: "test_mail",
  });
});

/* Microsoft special cases. */
add_task(function testMicrosoftHostnameDetails() {
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("outlook.office365.com", "imap"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/POP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access",
      requiredScopes:
        "https://outlook.office.com/IMAP.AccessAsUser.All offline_access",
    }
  );
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("outlook.office365.com", "pop3"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/POP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access",
      requiredScopes:
        "https://outlook.office.com/POP.AccessAsUser.All offline_access",
    }
  );
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("smtp.office365.com", "smtp"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/POP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access",
      requiredScopes: "https://outlook.office.com/SMTP.Send offline_access",
    }
  );

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("outlook.office365.com", "ews"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://outlook.office.com/EWS.AccessAsUser.All offline_access",
      requiredScopes:
        "https://outlook.office.com/EWS.AccessAsUser.All offline_access",
    }
  );

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("outlook.office365.com", "exchange"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://outlook.office.com/EWS.AccessAsUser.All offline_access",
      requiredScopes:
        "https://outlook.office.com/EWS.AccessAsUser.All offline_access",
    }
  );

  // Make sure we don't support Graph API without the experimental pref.
  Services.prefs.setBoolPref("mail.graph.enabled", false);
  Assert.ok(
    !OAuth2Providers.getHostnameDetails("outlook.office365.com", "graph")
  );

  Services.prefs.setBoolPref("mail.graph.enabled", true);
  // The `outlook.office365.com` host may need to be changed, especially once
  // autodiscover is implemented in
  // https://bugzilla.mozilla.org/show_bug.cgi?id=1995836.
  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("outlook.office365.com", "graph"),
    {
      issuer: "login.microsoftonline.com",
      allScopes:
        "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access",
      requiredScopes:
        "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send offline_access",
    }
  );
});

add_task(function testRegisterUnregister() {
  Assert.throws(
    () => OAuth2Providers.registerProvider({ name: "test.test" }),
    /Issuer test\.test already registered/,
    "registering an existing provider should fail"
  );

  // Register and verify an unrestricted extension provider.
  OAuth2Providers.registerProvider(
    {
      name: "oauth.test",
      builtIn: true,
      clientId: "my_client_id",
      clientSecret: "my_secret",
      authorizationEndpoint: "https://oauth.test/auth",
      tokenEndpoint: "https://oauth.test/token",
      redirectionEndpoint: "https://localhost/",
      usePKCE: true,
      useExternalBrowser: true,
    },
    ["mail.test"],
    "my_scope"
  );

  Assert.deepEqual(
    OAuth2Providers.getHostnameDetails("mail.test", "imap"),
    {
      issuer: "oauth.test",
      allScopes: "my_scope",
      requiredScopes: "my_scope",
    },
    "hostname details should be registered"
  );
  const issuerDetails = OAuth2Providers.getIssuerDetails("oauth.test");
  Assert.deepEqual(
    issuerDetails,
    {
      name: "oauth.test",
      builtIn: false,
      clientId: "my_client_id",
      clientSecret: "my_secret",
      authorizationEndpoint: "https://oauth.test/auth",
      tokenEndpoint: "https://oauth.test/token",
      redirectionEndpoint: "https://localhost/",
      usePKCE: true,
      useExternalBrowser: true,
    },
    "issuer details should be registered"
  );
  Assert.ok(
    Object.isFrozen(issuerDetails),
    "issuer details object should be frozen"
  );

  // Register and verify a domain-specific override.
  OAuth2Providers.registerProvider(
    {
      name: "override.test",
      builtIn: true,
      clientId: "override_client",
      authorizationEndpoint: "https://override.test/auth",
      tokenEndpoint: "https://override.test/token",
      redirectionEndpoint: "https://localhost/",
      usePKCE: true,
      extensionId: "override@test.invalid",
    },
    ["mochi.test"],
    "override_scope",
    ["example.com"]
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@example.com")
      .issuer,
    "override.test",
    "matching domain from username (email address) should use the corresponding extension provider"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@other.com")
      .issuer,
    "test.test",
    "username (email address) that doesn't match any extension provider domains should use built-in provider"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap").issuer,
    "test.test",
    "built-in provider should be used when no authentication username is available"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails(
      "mochi.test",
      "imap",
      "username-not-an-email"
    ).issuer,
    "test.test",
    "built-in provider should be used when the authentication username is not email-like"
  );

  Assert.equal(
    OAuth2Providers.getIssuerDetails("override.test").extensionId,
    "override@test.invalid",
    "issuer details should identify the extension that registered the provider"
  );

  // Register and verify a second domain-specific override.
  OAuth2Providers.registerProvider(
    {
      name: "second-override.test",
      builtIn: true,
      clientId: "second_override_client",
      authorizationEndpoint: "https://second-override.test/auth",
      tokenEndpoint: "https://second-override.test/token",
      redirectionEndpoint: "https://localhost/",
      usePKCE: true,
      extensionId: "second-override@test.invalid",
    },
    ["mochi.test"],
    "second_override_scope",
    ["other.com"]
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@example.com")
      .issuer,
    "override.test",
    "example.com users should continue to use the first extension provider"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@other.com")
      .issuer,
    "second-override.test",
    "other.com users should use the second extension provider"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@nomatch.com")
      .issuer,
    "test.test",
    "built-in provider should be used when no extension provider matches"
  );

  Assert.throws(
    () =>
      OAuth2Providers.registerProvider(
        {
          name: "duplicate-override.test",
          clientId: "duplicate_client",
          authorizationEndpoint: "https://duplicate-override.test/auth",
          tokenEndpoint: "https://duplicate-override.test/token",
        },
        ["mochi.test"],
        "duplicate_scope",
        ["example.com"]
      ),
    /mochi\.test\|example\.com/,
    "registering an existing hostname and email domain combination should fail"
  );

  Assert.throws(
    () =>
      OAuth2Providers.registerProvider(
        { name: "duplicate-hostname.test" },
        ["mail.example.test", "MAIL.EXAMPLE.TEST"],
        "scope"
      ),
    /Duplicate hostname/,
    "duplicate hostnames should fail after normalization"
  );

  Assert.throws(
    () =>
      OAuth2Providers.registerProvider(
        { name: "duplicate-domain.test" },
        ["another.test"],
        "scope",
        ["example.com", " Example.COM "]
      ),
    /Duplicate email domain/,
    "duplicate email domains should fail after normalization"
  );

  Assert.throws(
    () =>
      OAuth2Providers.registerProvider(
        { name: "public-suffix.test" },
        ["co.uk"],
        "scope"
      ),
    /must not be a public suffix/,
    "public suffix hostnames should not be registered"
  );

  Assert.throws(
    () => OAuth2Providers.unregisterProvider("unknown.test"),
    /Issuer unknown\.test was not registered/,
    "unregistering an unknown provider should fail"
  );
  Assert.throws(
    () => OAuth2Providers.unregisterProvider("accounts.google.com"),
    /Refusing to unregister built-in provider accounts\.google\.com/,
    "unregistering a built-in provider should fail"
  );

  OAuth2Providers.unregisterProvider("oauth.test");
  OAuth2Providers.unregisterProvider("override.test");

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@example.com")
      .issuer,
    "test.test",
    "removing the first extension should restore the built-in provider for its domain"
  );

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@other.com")
      .issuer,
    "second-override.test",
    "removing the first extension should not affect the second extension"
  );

  OAuth2Providers.unregisterProvider("second-override.test");

  Assert.equal(
    OAuth2Providers.getHostnameDetails("mochi.test", "imap", "user@other.com")
      .issuer,
    "test.test",
    "removing the second extension should restore the built-in provider for its domain"
  );

  Assert.ok(
    !OAuth2Providers.getHostnameDetails("mail.test", "imap"),
    "hostname details should no longer be registered"
  );
  Assert.ok(
    !OAuth2Providers.getIssuerDetails("oauth.test"),
    "issuer details should no longer be registered"
  );
});

add_task(function testIssuerDetails() {
  const baseline = {
    name: "test.test",
    builtIn: true,
    clientId: "test_client_id",
    clientSecret: "test_secret",
    authorizationEndpoint: "https://oauth.test.test/form",
    tokenEndpoint: "https://oauth.test.test/token",
    redirectionEndpoint: "https://localhost",
    usePKCE: true,
  };

  const details = OAuth2Providers.getIssuerDetails("test.test");
  Assert.deepEqual(
    details,
    baseline,
    "returned details should exactly match the hard-coded ones in this test"
  );

  Assert.ok(Object.isFrozen(details), "details object should be frozen");
  details.foo = "bar";
  details.builtIn = false;
  Assert.deepEqual(
    details,
    baseline,
    "modifying the details object should fail"
  );

  Assert.deepEqual(
    OAuth2Providers.getIssuerDetails("test.test"),
    baseline,
    "returned details should still exactly match the hard-coded ones in this test"
  );
});

add_task(function testStringScopesWithoutExchangeSupport() {
  const TEST_FIXTURES = {
    "gmail.com": false,
    "imap.mail.ru": false,
    "imap.yandex.com": false,
    "yahoo.com": false,
    "att.net": false,
    "aol.com": false,
    "office365.com": true,
    "graph.microsoft.com": true,
    "imap.fastmail.com": false,
    "imap.comcast.net": false,
    "thundermail.com": false,
    "stage-thundermail.com": false,
    "mochi.test": true,
    "external.test": true,
    "test.test": false,
  };
  for (const [hostname, hasExchangeProvider] of Object.entries(TEST_FIXTURES)) {
    const result = OAuth2Providers.getHostnameDetails(hostname, "exchange");
    if (hasExchangeProvider) {
      Assert.ok(
        result,
        `Should find an OAuth2 provider for exchange with ${hostname}`
      );
    } else {
      Assert.ok(
        !result,
        `Should not find an OAuth2 provider for exchange with ${hostname}`
      );
    }
  }
});

add_task(function testGetIssuerMicrosoft() {
  const details = OAuth2Providers.getIssuerDetails("login.microsoftonline.com");

  Assert.ok(Object.isFrozen(details), "OAuth details should be frozen.");

  Assert.equal(
    details.clientId,
    "9e5f94bc-e8a4-4e73-b8be-63364c29d753",
    "Should be using the production client ID by default."
  );
});

add_task(function testGetIssuerMicrosoftSandboxModification() {
  Services.prefs.setBoolPref("mail.microsoft.useM365Sandbox", true);

  const details = OAuth2Providers.getIssuerDetails("login.microsoftonline.com");

  Assert.ok(Object.isFrozen(details), "OAuth details should be frozen.");

  Assert.equal(
    details.clientId,
    "b00dc6cb-0459-4bd4-ac0d-2e23516f906a",
    "Should be using the Sandbox client ID when the sandbox preference is set."
  );

  Services.prefs.setBoolPref("mail.microsoft.useM365Sandbox", false);
});
