/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/*
 * Test suite for nsLDAPURL functions.
 */

// If we are still using the wallet service, then default port numbers
// are still visible in the password manager, and therefore we need to have
// them in the url. The toolkit login manager doesn't do this.
const usingWallet = "nsIWalletService" in Ci;
const portAdpt = usingWallet ? ":389" : "";

const ldapURLs = [
  {
    url: "ldap://localhost/dc=test",
    spec: "ldap://localhost/dc=test",
    asciiSpec: "ldap://localhost/dc=test",
    host: "localhost",
    asciiHost: "localhost",
    port: -1,
    scheme: "ldap",
    path: "/dc=test",
    prePath: "ldap://localhost",
    hostPort: "localhost",
    displaySpec: "ldap://localhost/dc=test",
    displayPrePath: "ldap://localhost",
    displayHost: "localhost",
    displayHostPort: "localhost",
    dn: "dc=test",
    scope: Ci.nsILDAPURL.SCOPE_BASE,
    filter: "(objectclass=*)",
    options: 0,
  },
  {
    url: "ldap://localhost:389/dc=test,dc=abc??sub?(objectclass=*)",
    spec:
      "ldap://localhost" + portAdpt + "/dc=test,dc=abc??sub?(objectclass=*)",
    asciiSpec:
      "ldap://localhost" + portAdpt + "/dc=test,dc=abc??sub?(objectclass=*)",
    host: "localhost",
    asciiHost: "localhost",
    port: usingWallet ? 389 : -1,
    scheme: "ldap",
    path: "/dc=test,dc=abc??sub?(objectclass=*)",
    prePath: "ldap://localhost" + portAdpt,
    hostPort: "localhost" + portAdpt,
    displaySpec:
      "ldap://localhost" + portAdpt + "/dc=test,dc=abc??sub?(objectclass=*)",
    displayPrePath: "ldap://localhost",
    displayHost: "localhost",
    displayHostPort: "localhost" + portAdpt,
    dn: "dc=test,dc=abc",
    scope: Ci.nsILDAPURL.SCOPE_SUBTREE,
    filter: "(objectclass=*)",
    options: 0,
  },
  {
    url: "ldap://\u65e5\u672c\u8a93.jp:389/dc=tes\u65e5t??one?(oc=xyz)",
    spec:
      "ldap://xn--wgv71a309e.jp" + portAdpt + "/dc=tes%E6%97%A5t??one?(oc=xyz)",
    asciiSpec:
      "ldap://xn--wgv71a309e.jp" + portAdpt + "/dc=tes%E6%97%A5t??one?(oc=xyz)",
    host: "xn--wgv71a309e.jp",
    asciiHost: "xn--wgv71a309e.jp",
    port: usingWallet ? 389 : -1,
    scheme: "ldap",
    path: "/dc=tes%E6%97%A5t??one?(oc=xyz)",
    prePath: "ldap://xn--wgv71a309e.jp" + portAdpt,
    hostPort: "xn--wgv71a309e.jp" + portAdpt,
    displaySpec:
      "ldap://\u65e5\u672c\u8a93.jp" +
      portAdpt +
      "/dc=tes%E6%97%A5t??one?(oc=xyz)",
    displayPrePath: "ldap://\u65e5\u672c\u8a93.jp" + portAdpt,
    displayHost: "\u65e5\u672c\u8a93.jp",
    displayHostPort: "\u65e5\u672c\u8a93.jp" + portAdpt,
    dn: "dc=tes\u65e5t",
    scope: Ci.nsILDAPURL.SCOPE_ONELEVEL,
    filter: "(oc=xyz)",
    options: 0,
  },
  {
    url: "ldaps://localhost/dc=test",
    spec: "ldaps://localhost/dc=test",
    asciiSpec: "ldaps://localhost/dc=test",
    host: "localhost",
    asciiHost: "localhost",
    port: -1,
    scheme: "ldaps",
    path: "/dc=test",
    prePath: "ldaps://localhost",
    hostPort: "localhost",
    displaySpec: "ldaps://localhost/dc=test",
    displayPrePath: "ldaps://localhost",
    displayHost: "localhost",
    displayHostPort: "localhost",
    dn: "dc=test",
    scope: Ci.nsILDAPURL.SCOPE_BASE,
    filter: "(objectclass=*)",
    options: Ci.nsILDAPURL.OPT_SECURE,
  },
  {
    url: "ldaps://127.0.0.1/dc=test",
    spec: "ldaps://127.0.0.1/dc=test",
    asciiSpec: "ldaps://127.0.0.1/dc=test",
    host: "127.0.0.1",
    asciiHost: "127.0.0.1",
    port: -1,
    scheme: "ldaps",
    path: "/dc=test",
    prePath: "ldaps://127.0.0.1",
    hostPort: "127.0.0.1",
    displaySpec: "ldaps://127.0.0.1/dc=test",
    displayPrePath: "ldaps://127.0.0.1",
    displayHost: "127.0.0.1",
    displayHostPort: "127.0.0.1",
    dn: "dc=test",
    scope: Ci.nsILDAPURL.SCOPE_BASE,
    filter: "(objectclass=*)",
    options: Ci.nsILDAPURL.OPT_SECURE,
  },
  {
    url: "ldaps://[::1]/dc=test",
    spec: "ldaps://[::1]/dc=test",
    asciiSpec: "ldaps://[::1]/dc=test",
    host: "::1",
    asciiHost: "::1",
    port: -1,
    scheme: "ldaps",
    path: "/dc=test",
    prePath: "ldaps://[::1]",
    hostPort: "[::1]",
    displaySpec: "ldaps://[::1]/dc=test",
    displayPrePath: "ldaps://[::1]",
    displayHost: "::1",
    displayHostPort: "[::1]",
    dn: "dc=test",
    scope: Ci.nsILDAPURL.SCOPE_BASE,
    filter: "(objectclass=*)",
    options: Ci.nsILDAPURL.OPT_SECURE,
  },
];

function run_test() {
  var url;

  // Test - get and check urls.

  for (let part = 0; part < ldapURLs.length; ++part) {
    dump("url: " + ldapURLs[part].url + "\n");
    url = Services.io.newURI(ldapURLs[part].url);

    Assert.equal(url.spec, ldapURLs[part].spec);
    Assert.equal(url.asciiSpec, ldapURLs[part].asciiSpec);
    Assert.equal(url.scheme, ldapURLs[part].scheme);
    Assert.equal(url.host, ldapURLs[part].host);
    Assert.equal(url.asciiHost, ldapURLs[part].asciiHost);
    Assert.equal(url.port, ldapURLs[part].port);
    Assert.equal(url.pathQueryRef, ldapURLs[part].path);
    Assert.equal(url.prePath, ldapURLs[part].prePath);
    Assert.equal(url.hostPort, ldapURLs[part].hostPort);
    Assert.equal(url.displaySpec, ldapURLs[part].displaySpec);
    Assert.equal(url.displayPrePath, ldapURLs[part].displayPrePath);
    Assert.equal(url.displayHost, ldapURLs[part].displayHost);
    Assert.equal(url.displayHostPort, ldapURLs[part].displayHostPort);
    // XXX nsLDAPURL ought to have classinfo.
    url = url.QueryInterface(Ci.nsILDAPURL);
    Assert.equal(url.dn, ldapURLs[part].dn);
    Assert.equal(url.scope, ldapURLs[part].scope);
    Assert.equal(url.filter, ldapURLs[part].filter);
    Assert.equal(url.options, ldapURLs[part].options);
  }

  // Test - Check changing ldap values
  dump("Other Tests\n");

  // Start off with a base url
  const kBaseURL = "ldap://localhost:389/dc=test,dc=abc??sub?(objectclass=*)";

  url = Services.io.newURI(kBaseURL).QueryInterface(Ci.nsILDAPURL);

  // Test - dn

  url.dn = "dc=short";

  Assert.equal(url.dn, "dc=short");
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??sub?(objectclass=*)"
  );

  // Test - scope

  url.scope = Ci.nsILDAPURL.SCOPE_BASE;

  Assert.equal(url.scope, Ci.nsILDAPURL.SCOPE_BASE);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short???(objectclass=*)"
  );

  url.scope = Ci.nsILDAPURL.SCOPE_ONELEVEL;

  Assert.equal(url.scope, Ci.nsILDAPURL.SCOPE_ONELEVEL);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  // Test - filter

  url.filter = "(&(oc=ygh)(l=Ереван))";

  Assert.equal(url.filter, "(&(oc=ygh)(l=Ереван))");
  Assert.equal(
    url.spec,
    "ldap://localhost" +
      portAdpt +
      "/dc=short??one?(&(oc=ygh)(l=%D0%95%D1%80%D0%B5%D0%B2%D0%B0%D0%BD))"
  );

  url.filter = "";

  Assert.equal(url.filter, "(objectclass=*)");
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  // Test - scheme

  // An old version used to have a bug whereby if you set the scheme to the
  // same thing twice, you'd get the options set wrongly.
  url = url
    .mutate()
    .setScheme("ldaps")
    .finalize()
    .QueryInterface(Ci.nsILDAPURL);
  Assert.equal(url.options, 1);
  Assert.equal(
    url.spec,
    "ldaps://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );
  url = url
    .mutate()
    .setScheme("ldaps")
    .finalize()
    .QueryInterface(Ci.nsILDAPURL);
  Assert.equal(url.options, 1);
  Assert.equal(
    url.spec,
    "ldaps://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  Assert.ok(url.schemeIs("ldaps"));
  Assert.ok(!url.schemeIs("ldap"));

  url = url.mutate().setScheme("ldap").finalize().QueryInterface(Ci.nsILDAPURL);
  Assert.equal(url.options, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );
  url = url.mutate().setScheme("ldap").finalize().QueryInterface(Ci.nsILDAPURL);
  Assert.equal(url.options, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  Assert.ok(url.schemeIs("ldap"));
  Assert.ok(!url.schemeIs("ldaps"));

  // Test - Options

  url.options = Ci.nsILDAPURL.OPT_SECURE;

  Assert.equal(url.options, Ci.nsILDAPURL.OPT_SECURE);
  Assert.equal(
    url.spec,
    "ldaps://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  url.options = 0;

  Assert.equal(url.options, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  // Test - Equals

  var url2 = Services.io
    .newURI("ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)")
    .QueryInterface(Ci.nsILDAPURL);

  Assert.ok(url.equals(url2));

  url2 = url2
    .mutate()
    .setSpec("ldap://localhost:389/dc=short??sub?(objectclass=*)")
    .finalize();

  Assert.ok(!url.equals(url2));

  // Test Attributes

  Assert.equal(url.attributes.length, 0);

  // Nothing should happen if the attribute doesn't exist
  url.removeAttribute("abc");

  Assert.equal(url.attributes.length, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  url.addAttribute("dn");
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short?dn?one?(objectclass=*)"
  );

  Assert.equal(url.attributes, "dn");

  url.removeAttribute("dn");

  Assert.equal(url.attributes.length, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  var newAttrs = "abc,def,ghi,jkl";
  url.attributes = newAttrs;

  Assert.equal(url.attributes, newAttrs);
  Assert.equal(
    url.spec,
    "ldap://localhost" +
      portAdpt +
      "/dc=short?" +
      newAttrs +
      "?one?(objectclass=*)"
  );

  // Try adding an existing attribute - should do nothing
  url.addAttribute("def");
  Assert.equal(url.attributes, newAttrs);

  //  url.addAttribute("jk");

  Assert.ok(url.hasAttribute("jkl"));
  Assert.ok(url.hasAttribute("def"));
  Assert.ok(url.hasAttribute("ABC"));
  Assert.ok(!url.hasAttribute("cde"));
  Assert.ok(!url.hasAttribute("3446"));
  Assert.ok(!url.hasAttribute("kl"));
  Assert.ok(!url.hasAttribute("jk"));

  // Sub-string of an attribute, so this shouldn't change anything.
  url.removeAttribute("kl");
  url.removeAttribute("jk");
  url.removeAttribute("ef");
  Assert.equal(url.attributes, newAttrs);

  url.removeAttribute("abc");
  newAttrs = newAttrs.substring(4);

  Assert.equal(url.attributes, newAttrs);
  Assert.equal(
    url.spec,
    "ldap://localhost" +
      portAdpt +
      "/dc=short?" +
      newAttrs +
      "?one?(objectclass=*)"
  );

  // This shouldn't fail, just clear the list
  url.attributes = "";

  Assert.equal(url.attributes.length, 0);
  Assert.equal(
    url.spec,
    "ldap://localhost" + portAdpt + "/dc=short??one?(objectclass=*)"
  );

  // Set attributes via the url spec

  newAttrs = "abc,def,ghi,jkl";
  url = url
    .mutate()
    .setSpec("ldap://localhost/dc=short?" + newAttrs + "?one?(objectclass=*)")
    .finalize()
    .QueryInterface(Ci.nsILDAPURL);

  Assert.equal(url.attributes, newAttrs);
  Assert.equal(
    url.spec,
    "ldap://localhost/dc=short?" + newAttrs + "?one?(objectclass=*)"
  );

  url = url
    .mutate()
    .setSpec("ldap://localhost/dc=short??one?(objectclass=*)")
    .finalize()
    .QueryInterface(Ci.nsILDAPURL);

  var attrs = url.attributes;
  Assert.equal(attrs.length, 0);
  Assert.equal(url.spec, "ldap://localhost/dc=short??one?(objectclass=*)");

  // Test - clone

  url = url
    .mutate()
    .setSpec("ldap://localhost/dc=short?abc,def,ghi,jkl?one?(objectclass=*)")
    .finalize();

  var newUrl = url.mutate().finalize();

  Assert.equal(
    newUrl.spec,
    "ldap://localhost/dc=short?abc,def,ghi,jkl?one?(objectclass=*)"
  );
}
