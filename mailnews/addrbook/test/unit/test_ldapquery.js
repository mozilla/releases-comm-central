/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test basic LDAP querying.
 */

const { LDAPDaemon, LDAPHandlerFn } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Ldapd.sys.mjs"
);
const { BinaryServer } = ChromeUtils.importESModule(
  "resource://testing-common/mailnews/Binaryd.sys.mjs"
);

/**
 * Adaptor class to implement nsILDAPMessageListener with a promise.
 * It should be passed into LDAP functions as a normal listener. The
 * caller can then await the promise attribute.
 * Based on the pattern used in PromiseTestUtils.jsm.
 *
 * This base class just rejects all callbacks. Derived classes should
 * implement the callbacks they need to handle.
 *
 * @implements {nsILDAPMessageListener}
 */
class PromiseListener {
  constructor() {
    this.QueryInterface = ChromeUtils.generateQI(["nsILDAPMessageListener"]);
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });
  }
  onLDAPMessage(message) {
    this._reject(new Error("Unexpected onLDAPMessage"));
  }
  onLDAPInit() {
    this._reject(new Error("Unexpected onLDAPInit"));
  }
  onLDAPError(status, secInfo, location) {
    this._reject(new Error(`Unexpected onLDAPError (0x${status.toString(16)}`));
  }
}

/**
 * PromiseInitListener resolves the promise when onLDAPInit is called.
 *
 * @augments {PromiseListener}
 */
class PromiseInitListener extends PromiseListener {
  onLDAPInit() {
    this._resolve();
  }
}

/**
 * PromiseBindListener resolves when a bind operation completes.
 *
 * @augments {PromiseListener}
 */
class PromiseBindListener extends PromiseListener {
  onLDAPMessage(message) {
    if (Ci.nsILDAPErrors.SUCCESS != message.errorCode) {
      this._reject(
        new Error(`Operation failed (LDAP code ${message.errorCode})`)
      );
    }
    if (Ci.nsILDAPMessage.RES_BIND == message.type) {
      this._resolve(); // All done.
    }
  }
}

/**
 * PromiseSearchListener collects search results, returning them via promise
 * when the search is complete.
 *
 * @augments {PromiseListener}
 */
class PromiseSearchListener extends PromiseListener {
  constructor() {
    super();
    this._results = [];
  }
  onLDAPMessage(message) {
    if (Ci.nsILDAPMessage.RES_SEARCH_RESULT == message.type) {
      this._resolve(this._results); // All done.
    }
    if (Ci.nsILDAPMessage.RES_SEARCH_ENTRY == message.type) {
      this._results.push(message);
    }
  }
}

add_task(async function test_basic_query() {
  // Load in some test contact data (characters from Sherlock Holmes).
  const raw = await IOUtils.readUTF8(
    do_get_file(
      "../../../../mailnews/addrbook/test/unit/data/ldap_contacts.json"
    ).path
  );
  const testContacts = JSON.parse(raw);

  // Set up fake LDAP server, loaded with the test contacts.
  const daemon = new LDAPDaemon();
  daemon.add(...Object.values(testContacts));
  // daemon.setDebug(true);
  const server = new BinaryServer(LDAPHandlerFn, daemon);
  server.start();

  // Connect to the fake server.
  const url = `ldap://localhost:${server.port}`;
  const ldapURL = Services.io.newURI(url).QueryInterface(Ci.nsILDAPURL);
  const conn = Cc["@mozilla.org/network/ldap-connection;1"]
    .createInstance()
    .QueryInterface(Ci.nsILDAPConnection);

  // Initialisation is async.
  const initListener = new PromiseInitListener();
  conn.init(ldapURL, null, initListener, null, Ci.nsILDAPConnection.VERSION3);
  await initListener.promise;

  // Perform bind.
  const bindListener = new PromiseBindListener();
  const bindOp = Cc["@mozilla.org/network/ldap-operation;1"].createInstance(
    Ci.nsILDAPOperation
  );
  bindOp.init(conn, bindListener, null);
  bindOp.simpleBind(""); // no password
  await bindListener.promise;

  // Run a search.
  const searchListener = new PromiseSearchListener();
  const searchOp = Cc["@mozilla.org/network/ldap-operation;1"].createInstance(
    Ci.nsILDAPOperation
  );
  searchOp.init(conn, searchListener, null);
  searchOp.searchExt(
    "", // dn
    Ci.nsILDAPURL.SCOPE_SUBTREE,
    "(sn=Holmes)", // filter: Find the Holmes family members.
    "", // wanted_attributes
    0, // timeOut
    100 // maxEntriesWanted
  );
  const matches = await searchListener.promise;

  // Make sure we got the contacts we expected (just use cn for comparing):
  const holmesCNs = ["Eurus Holmes", "Mycroft Holmes", "Sherlock Holmes"];
  const holmesGivenNames = ["Eurus", "Mycroft", "Sherlock"];
  const nonHolmesCNs = [
    "Greg Lestrade",
    "Irene Adler",
    "Jim Moriarty",
    "John Watson",
    "Mary Watson",
    "Molly Hooper",
    "Mrs Hudson",
  ];
  const cns = matches.map(ent => ent.getValues("cn")[0]);
  cns.sort();
  Assert.deepEqual(cns, holmesCNs);

  // Test getValues is case insensitive about the attribute name.
  let givenNames = matches.map(ent => ent.getValues("givenname")[0]);
  givenNames.sort();
  Assert.deepEqual(givenNames, holmesGivenNames);
  givenNames = matches.map(ent => ent.getValues("givenName")[0]);
  givenNames.sort();
  Assert.deepEqual(givenNames, holmesGivenNames);
  givenNames = matches.map(ent => ent.getValues("GIVENNAME")[0]);
  givenNames.sort();
  Assert.deepEqual(givenNames, holmesGivenNames);

  // Sanity check: make sure the non-Holmes contacts were excluded.
  nonHolmesCNs.forEach(cn => Assert.ok(!cns.includes(cn)));

  server.stop();
});
