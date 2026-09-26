/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Test that search references are only followed in a safe way.
 */

const { LDAPServer } = ChromeUtils.importESModule(
  "resource://testing-common/LDAPServer.sys.mjs"
);
const { LDAPConnection } = ChromeUtils.importESModule(
  "resource:///modules/LDAPConnection.sys.mjs"
);
const { LDAPOperation } = ChromeUtils.importESModule(
  "resource:///modules/LDAPOperation.sys.mjs"
);

const BIND_DN = "cn=user,dc=example";
const PASSWORD = "secret-password";

const CONTACT = {
  dn: "cn=Sherlock Holmes,o=referral",
  attributes: { cn: "Sherlock Holmes" },
};

/**
 * Start a search on the test server, as LDAPListenerBase does.
 *
 * @param {object} [options]
 * @param {nsIURI} [options.directoryUrl] - Pretend the directory was
 *   configured with this URL instead of the test server URL.
 * @returns {object} The LDAPOperation as `operation`, and as `result` a
 *   promise resolving with the found entries and either the result code when
 *   the search is finished, or the status of an LDAP error.
 */
function startSearch({ directoryUrl } = {}) {
  const entries = [];
  const conn = new LDAPConnection();
  const op = new LDAPOperation();
  const { promise, resolve } = Promise.withResolvers();
  const listener = {
    QueryInterface: ChromeUtils.generateQI(["nsILDAPMessageListener"]),
    onLDAPInit() {
      op.init(conn, listener);
      op.simpleBind(PASSWORD);
    },
    onLDAPMessage(msg) {
      if (msg.type == Ci.nsILDAPMessage.RES_BIND) {
        op.searchExt(
          "o=test",
          Ci.nsILDAPURL.SCOPE_SUBTREE,
          "(cn=*)",
          "cn",
          0,
          0
        );
      } else if (msg.type == Ci.nsILDAPMessage.RES_SEARCH_ENTRY) {
        entries.push(msg.getValues("cn")[0]);
      } else if (msg.type == Ci.nsILDAPMessage.RES_SEARCH_RESULT) {
        resolve({ entries, errorCode: msg.errorCode });
      }
    },
    onLDAPError(status) {
      resolve({ entries, status });
    },
  };
  conn.init(
    Services.io.newURI(`ldap://localhost:${LDAPServer.port}/o=test`),
    BIND_DN,
    listener
  );
  if (directoryUrl) {
    Object.defineProperty(conn, "url", { value: directoryUrl });
  }
  return { operation: op, result: promise };
}

/**
 * @param {byte[]} data - The data received by the test server.
 * @returns {string}
 */
function bytesToString(data) {
  return String.fromCharCode(...data);
}

add_setup(function () {
  LDAPServer.open();
  registerCleanupFunction(() => LDAPServer.close());
});

add_task(function test_parseReferralUrl() {
  const parser = Cc["@mozilla.org/network/ldap-url-parser;1"].createInstance(
    Ci.nsILDAPURLParser
  );
  for (const [spec, host, port] of [
    ["ldap://ldap.example.com/o=x", "ldap.example.com", -1],
    ["ldap://ldap.example.com:1389/o=x", "ldap.example.com", 1389],
    ["ldap://[ldap.example.com]:1389/o=x", "ldap.example.com", 1389],
    ["ldaps://[::1]:636/o=x", "::1", 636],
  ]) {
    const url = parser.parse(spec);
    Assert.equal(url.host, host, `Host of ${spec} should be parsed`);
    Assert.equal(url.port, port, `Port of ${spec} should be parsed`);
  }
});

add_task(async function test_sameHostReferral() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://localhost:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  const bind = bytesToString(await LDAPServer.read(LDAPServer.BindRequest));
  Assert.ok(bind.includes(BIND_DN), "Bind DN should be sent to the same host");
  Assert.ok(
    bind.includes(PASSWORD),
    "Password should be sent to the same host"
  );
  LDAPServer.writeBindResponse();
  const search = bytesToString(await LDAPServer.read(LDAPServer.SearchRequest));
  Assert.ok(
    search.includes("o=referral"),
    "Search should use the base DN of the referral"
  );
  LDAPServer.writeSearchResultEntry(CONTACT);
  LDAPServer.writeSearchResultDone();

  const { entries, errorCode } = await result;
  Assert.deepEqual(entries, ["Sherlock Holmes"], "Entry should be found");
  Assert.equal(errorCode, Ci.nsILDAPErrors.SUCCESS, "Search should succeed");
});

add_task(async function test_otherHostReferral() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  // 127.0.0.1 reaches the same test server, but is a different host name.
  LDAPServer.writeSearchResultReference(
    `ldap://[127.0.0.1]:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  const bind = bytesToString(await LDAPServer.read(LDAPServer.BindRequest));
  Assert.ok(
    !bind.includes(BIND_DN),
    "Bind DN should not be sent to another host"
  );
  Assert.ok(
    !bind.includes(PASSWORD),
    "Password should not be sent to another host"
  );
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(CONTACT);
  LDAPServer.writeSearchResultDone();

  const { entries } = await result;
  Assert.deepEqual(entries, ["Sherlock Holmes"], "Entry should be found");
});

add_task(async function test_insecureReferral() {
  const { result } = startSearch({
    directoryUrl: Services.io.newURI(`ldaps://localhost/o=test`),
  });
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://localhost:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  const { entries, errorCode } = await result;
  Assert.deepEqual(entries, [], "Insecure referral should not be followed");
  Assert.equal(errorCode, Ci.nsILDAPErrors.SUCCESS, "Search should succeed");
});

add_task(async function test_referralDepth() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://localhost:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  // The referral refers to itself, which should not be followed.
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://localhost:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultEntry(CONTACT);
  LDAPServer.writeSearchResultDone();

  const { entries, errorCode } = await result;
  Assert.deepEqual(entries, ["Sherlock Holmes"], "Entry should be found");
  Assert.equal(errorCode, Ci.nsILDAPErrors.SUCCESS, "Search should finish");
});

add_task(async function test_referralLimit() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  for (let i = 0; i < 7; i++) {
    LDAPServer.writeSearchResultReference(
      `ldap://localhost:${LDAPServer.port}/o=referral${i}`
    );
  }
  LDAPServer.writeSearchResultDone();

  // Only 5 of the 7 references should be followed.
  for (let i = 0; i < 5; i++) {
    await LDAPServer.read(LDAPServer.BindRequest);
    LDAPServer.writeBindResponse();
    const search = bytesToString(
      await LDAPServer.read(LDAPServer.SearchRequest)
    );
    Assert.ok(
      search.includes(`o=referral${i}`),
      `Referral ${i} should be followed`
    );
    LDAPServer.writeSearchResultDone();
  }

  const { errorCode } = await result;
  Assert.equal(errorCode, Ci.nsILDAPErrors.SUCCESS, "Search should finish");
});

add_task(async function test_abandonDuringReferral() {
  const { operation, result } = startSearch();
  let finished = false;
  result.then(() => (finished = true));
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://[127.0.0.1]:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  await LDAPServer.read(LDAPServer.BindRequest);
  operation.abandonExt();
  LDAPServer.writeBindResponse();

  // Skip the unbind of the first connection (message 3), which may arrive late.
  let data;
  do {
    data = await LDAPServer.read();
  } while (data[4] == 3);
  Assert.equal(
    data[5],
    LDAPServer.UnbindRequest,
    "Abandoned referral should be unbound instead of searched"
  );
  Assert.ok(!finished, "Abandoned search should not report a result");
});

add_task(async function test_serverClosesConnection() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(CONTACT);
  LDAPServer.closeConnection();

  const { entries, status } = await result;
  Assert.deepEqual(entries, ["Sherlock Holmes"], "Entry should be found");
  Assert.equal(
    status,
    Cr.NS_ERROR_NET_INTERRUPT,
    "Closed connection should be reported as an error"
  );
});

add_task(async function test_referralClosesConnection() {
  const { result } = startSearch();
  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultReference(
    `ldap://localhost:${LDAPServer.port}/o=referral`
  );
  LDAPServer.writeSearchResultDone();

  await LDAPServer.read(LDAPServer.BindRequest);
  LDAPServer.writeBindResponse();
  await LDAPServer.read(LDAPServer.SearchRequest);
  LDAPServer.writeSearchResultEntry(CONTACT);
  LDAPServer.closeConnection();

  const { entries, errorCode } = await result;
  Assert.deepEqual(entries, ["Sherlock Holmes"], "Entry should be found");
  Assert.equal(
    errorCode,
    Ci.nsILDAPErrors.SUCCESS,
    "Search should finish with the result of the directory"
  );
});
