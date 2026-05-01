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
        "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite offline_access",
      requiredScopes:
        "https://graph.microsoft.com/User.Read https://graph.microsoft.com/MailboxFolder.ReadWrite offline_access",
    }
  );
});

add_task(function testRegisterUnregister() {
  Assert.throws(
    () => OAuth2Providers.registerProvider("test.test"),
    /Issuer test\.test already registered/,
    "registering an existing provider should fail"
  );
  Assert.throws(
    () =>
      OAuth2Providers.registerProvider(
        "oauth.test",
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        ["mochi.test"]
      ),
    /Hostname mochi\.test already registered/,
    "registering an existing hostname should fail"
  );

  OAuth2Providers.registerProvider(
    "oauth.test",
    "my_client_id",
    "my_secret",
    "https://oauth.test/auth",
    "https://oauth.test/token",
    "https://localhost/",
    true,
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
    },
    "issuer details should be registered"
  );
  Assert.ok(
    Object.isFrozen(issuerDetails),
    "issuer details object should be frozen"
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
