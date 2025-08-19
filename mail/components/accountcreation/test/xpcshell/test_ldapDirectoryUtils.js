/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { LDAPDirectoryUtils } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/LDAPDirectoryUtils.sys.mjs"
);

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

const { TestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/TestUtils.sys.mjs"
);

add_setup(async () => {
  do_get_profile();
});

add_task(async function test_createSimpleLDAPDirectory() {
  const credentials = makeCredentials();
  const directory = await createDirectory(credentials);

  Assert.equal(
    directory.dirName,
    credentials.name,
    "The directory name should match the credentials"
  );
  Assert.equal(
    directory.authDn,
    credentials.bindDn,
    "The bind DN should match the credentials"
  );
  Assert.equal(
    directory.lDAPURL.dn,
    credentials.baseDn,
    "The base DN should match the credentials"
  );
  Assert.equal(
    directory.lDAPURL.spec,
    `ldap://${credentials.hostname}:${credentials.port}/${credentials.baseDn}???(objectclass=*)`,
    "The directory should have the correct URL spec"
  );
  Assert.notEqual(
    directory.saslMechanism,
    credentials.loginMethod,
    "The directory should not have the login method in the credentials"
  );

  await deleteDirectory(directory);
});

add_task(async function test_createSimpleLDAPDirectorySecure() {
  const credentials = makeCredentials({
    ssl: true,
  });
  const directory = await createDirectory(credentials);

  Assert.equal(
    directory.lDAPURL.spec,
    `ldaps://${credentials.hostname}:${credentials.port}/${credentials.baseDn}???(objectclass=*)`,
    "The directory should have the correct URL spec"
  );

  await deleteDirectory(directory);
});

add_task(async function test_createSimpleLDAPDirectoryIPv6() {
  const credentials = makeCredentials({
    hostname: "::1",
  });
  const directory = await createDirectory(credentials);

  Assert.equal(
    directory.lDAPURL.spec,
    `ldap://[${credentials.hostname}]:${credentials.port}/${credentials.baseDn}???(objectclass=*)`,
    "The directory should have the correct IPv6 URL spec"
  );

  await deleteDirectory(directory);
});

add_task(async function test_preWrappedIPV6Hostname() {
  const credentials = makeCredentials({
    hostname: "[::1]",
  });
  const directory = await createDirectory(credentials);

  Assert.equal(
    directory.lDAPURL.spec,
    `ldap://${credentials.hostname}:${credentials.port}/${credentials.baseDn}???(objectclass=*)`,
    "The directory should have the correct IPv6 URL spec"
  );

  await deleteDirectory(directory);
});

add_task(async function test_createAdvancedLDAPDirectory() {
  const credentials = makeCredentials({
    isAdvanced: true,
    maxResults: 50,
    filter: "(objectclass=*)",
  });

  const directory = await createDirectory(credentials);

  Assert.equal(
    directory.saslMechanism,
    credentials.loginMethod,
    "The directory login method should match credentials"
  );
  Assert.equal(
    directory.lDAPURL.filter,
    credentials.filter,
    "The directory filter should match"
  );
  Assert.equal(
    directory.maxHits,
    credentials.maxResults,
    "The directory max results should match the credentials"
  );
  Assert.equal(
    directory.lDAPURL.scope,
    credentials.scope,
    "The directory filter scope match the credentials"
  );

  await deleteDirectory(directory);
});

/**
 * Returns fresh credentials, using optional override properties as a param.
 *
 * @param {object?} newValues - Properties to override in the credentials.
 * @returns {object}
 */
function makeCredentials(newValues = {}) {
  return {
    name: "Test Directory",
    hostname: "localhost",
    port: 24,
    baseDn: "dc=localhost",
    bindDn: "cn=username",
    ssl: false,
    isAdvanced: false,
    maxResults: 0,
    scope: Ci.nsILDAPURL.SCOPE_SUBTREE,
    loginMethod: "GSSAPI",
    searchFilter: "",
    ...newValues,
  };
}

/**
 * Creates and returns the LDAP Directory using the credentials provided.
 *
 * @param {object} credentials - Credentials to create LDAP directory.
 * @returns {Ci.nsIAbDirectory}
 */
async function createDirectory(credentials) {
  const directoryCreatedPromise = TestUtils.topicObserved(
    "addrbook-directory-created"
  );
  const directory = LDAPDirectoryUtils.createDirectory(credentials);
  await directoryCreatedPromise;

  return directory;
}

/**
 * Deletes the provided LDAP directory.
 *
 * @param {Ci.nsIAbDirectory} directory - The LDAP Directory.
 */
async function deleteDirectory(directory) {
  const removePromise = TestUtils.topicObserved(
    "addrbook-directory-deleted",
    subject => subject == directory
  );
  MailServices.ab.deleteAddressBook(directory.URI);
  await removePromise;
}
