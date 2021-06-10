/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */

/**
 * Test suite for nsILDAPSyncQuery.
 */

const { LDAPDaemon, LDAPHandlerFn } = ChromeUtils.import(
  "resource://testing-common/mailnews/Ldapd.jsm"
);
const { BinaryServer } = ChromeUtils.import(
  "resource://testing-common/mailnews/Binaryd.jsm"
);
var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

const nsILDAPSyncQuery = Ci.nsILDAPSyncQuery;
const LDAPSyncQueryContractID = "@mozilla.org/ldapsyncquery;1";

function getLDAPAttributes(urlSpec) {
  let url = Services.io.newURI(urlSpec).QueryInterface(Ci.nsILDAPURL);
  let ldapquery = Cc[LDAPSyncQueryContractID].createInstance(nsILDAPSyncQuery);
  let payload = ldapquery.getQueryResults(url, Ci.nsILDAPConnection.VERSION3);
  // Returns a string with one attr per line.
  return payload;
}

add_task(async function test_LDAPSyncQuery() {
  // Set up fake LDAP server, loaded with some contacts.
  let daemon = new LDAPDaemon();
  let raw = await IOUtils.readUTF8(
    do_get_file(
      "../../../../mailnews/addrbook/test/unit/data/ldap_contacts.json"
    ).path
  );
  let testContacts = JSON.parse(raw);
  daemon.add(...Object.values(testContacts));
  // daemon.setDebug(true);

  let server = new BinaryServer(LDAPHandlerFn, daemon);
  server.start();

  // Fetch only the Holmes family.
  let out = getLDAPAttributes(
    `ldap://localhost:${server.port}/??sub?(sn=Holmes)`
  );
  if (daemon.debug) {
    dump(`--- getLDAPAttributes() ---\n${out}\n--------------------\n`);
  }

  // Make sure we got the contacts we expected:
  Assert.ok(out.includes("cn=Eurus Holmes"));
  Assert.ok(out.includes("cn=Mycroft Holmes"));
  Assert.ok(out.includes("cn=Sherlock Holmes"));

  // Sanity check: make sure some non-Holmes people were excluded.
  Assert.ok(!out.includes("cn=John Watson"));
  Assert.ok(!out.includes("cn=Jim Moriarty"));

  server.stop();
});
