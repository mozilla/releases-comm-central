/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for LDAPService.sys.mjs.
 */

const ldapSvc = Cc["@mozilla.org/network/ldap-service;1"].getService(
  Ci.nsILDAPService
);

/**
 * Test the search value is substituted into the filter template.
 */
add_task(function test_createFilter() {
  const template = "(|(cn=*%v1*%v2-*)(mail=*%v*)(givenName=*%v1*)(sn=*%v*))";
  Assert.equal(
    ldapSvc.createFilter(1024, template, "", "", "", "john smith"),
    "(|(cn=*john*smith*)(mail=*john smith*)(givenName=*john*)(sn=*john smith*))",
    "Filter should be created from the template"
  );
  Assert.equal(
    ldapSvc.createFilter(1024, "(%a=%v2)", "(&", ")", "cn", "a b c"),
    "(&(cn=b))",
    "Attribute, prefix and suffix should be substituted"
  );
  Assert.equal(
    ldapSvc.createFilter(10, template, "", "", "", "john"),
    "",
    "Filter longer than the maximum size should be empty"
  );
});

/**
 * Test special characters in the search value are escaped.
 */
add_task(function test_createFilterEscaping() {
  const template = "(|(cn=*%v1*%v2-*)(mail=*%v*))";
  Assert.equal(
    ldapSvc.createFilter(1024, template, "", "", "", ")(uid=*))(|(cn="),
    "(|(cn=*\\29\\28uid=\\2a\\29\\29\\28|\\28cn=**)(mail=*\\29\\28uid=\\2a\\29\\29\\28|\\28cn=*))",
    "Filter special characters in the search value should be escaped"
  );
  Assert.equal(
    ldapSvc.createFilter(1024, template, "", "", "", "a\\b \0*"),
    "(|(cn=*a\\5cb*\\00\\2a*)(mail=*a\\5cb \\00\\2a*))",
    "Backslash and NUL in the search value should be escaped"
  );
});
