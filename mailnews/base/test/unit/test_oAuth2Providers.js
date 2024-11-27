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
});
