/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for LDAPMessage.sys.mjs.
 */

var { CommonUtils } = ChromeUtils.importESModule(
  "resource://services-common/utils.sys.mjs"
);
var { LDAPResponse, SearchRequest } = ChromeUtils.importESModule(
  "resource:///modules/LDAPMessage.sys.mjs"
);

/**
 * Test filter string is converted to asn1 blocks correctly.
 */
add_task(function test_SearchRequest_filter() {
  const req = new SearchRequest(
    "ou=people,dc=planetexpress,dc=com",
    Ci.nsILDAPURL.SCOPE_SUBTREE,
    "(memberof=cn=ship_crew,ou=people,dc=planetexpress,dc=com)",
    "",
    0,
    0
  );
  const filterBlock = req.protocolOp.valueBlock.value[6];
  const [filterKeyBlock, filterValueBlock] = filterBlock.valueBlock.value;
  const filterKey = new TextDecoder().decode(
    filterKeyBlock.valueBlock.valueHex
  );
  const filterValue = new TextDecoder().decode(
    filterValueBlock.valueBlock.valueHex
  );
  Assert.equal(filterKey, "memberof", "Filter key should be correct");
  Assert.equal(
    filterValue,
    "cn=ship_crew,ou=people,dc=planetexpress,dc=com",
    "Filter value should be correct"
  );
});

/**
 * Test extensibleMatch filter is encoded correctly.
 */
add_task(function test_extensibleMatchFilter() {
  // Test data is from https://ldap.com/ldapv3-wire-protocol-reference-search/.
  // filter string, BER payload, description
  const filterBER = [
    [
      "(uid:dn:caseIgnoreMatch:=jdoe)",
      "a91f810f6361736549676e6f72654d61746368820375696483046a646f658401ff",
      "<type>:dn:<rule>:=<value>",
    ],
    ["(uid:=jdoe)", "a90b820375696483046a646f65", "<type>:=<value>"],
    [
      "(:caseIgnoreMatch:=foo)",
      "a916810f6361736549676e6f72654d617463688303666f6f",
      ":<rule>:=<value>",
    ],
    // This one is not directly from ldap.com, but assembled from the above cases.
    [
      "(uid:caseIgnoreMatch:=jdoe)",
      "a91c810f6361736549676e6f72654d61746368820375696483046a646f65",
      "<type>:<rule>:=<value>",
    ],
  ];
  for (const [filter, ber, description] of filterBER) {
    const req = new SearchRequest(
      "ou=people,dc=planetexpress,dc=com",
      Ci.nsILDAPURL.SCOPE_SUBTREE,
      filter,
      "",
      0,
      0
    );
    const filterBlock = req.protocolOp.valueBlock.value[6];
    Assert.equal(
      CommonUtils.bufferToHex(new Uint8Array(filterBlock.toBER())),
      ber,
      description
    );
  }
});

/**
 * Test escaped assertion values are decoded and can't change the filter type.
 */
add_task(function test_escapedFilterValues() {
  // filter string, BER payload, description
  const filterBER = [
    [
      "(cn=a\\28b\\29\\2a\\5c)",
      "a30c0402636e0406612862292a5c",
      "Escaped characters should be decoded in an equality match",
    ],
    [
      "(cn=*\\2a*\\c3\\a9)",
      "a40d0402636e300781012a8202c3a9",
      "Escaped characters should be decoded in a substrings match",
    ],
    [
      "(cn=a>=b)",
      "a30a0402636e0404613e3d62",
      "A >= in the value should not make a greaterOrEqual match",
    ],
    [
      "(cn>=a<=b)",
      "a50a0402636e0404613c3d62",
      "A <= in the value should not make a lessOrEqual match",
    ],
  ];
  for (const [filter, ber, description] of filterBER) {
    const req = new SearchRequest(
      "ou=people,dc=planetexpress,dc=com",
      Ci.nsILDAPURL.SCOPE_SUBTREE,
      filter,
      "",
      0,
      0
    );
    const filterBlock = req.protocolOp.valueBlock.value[6];
    Assert.equal(
      CommonUtils.bufferToHex(new Uint8Array(filterBlock.toBER())),
      ber,
      description
    );
  }
});

/**
 * Test parsing to SearchResultReference works.
 */
add_task(function test_SearchResultReference() {
  // A BER payload representing a SearchResultReference with two urls, test data
  // is from https://ldap.com/ldapv3-wire-protocol-reference-search/.
  const hex =
    "306d020102736804326c6461703a2f2f6473312e6578616d706c652e636f6d3a3338392f64633d6578616d706c652c64633d636f6d3f3f7375623f04326c6461703a2f2f6473322e6578616d706c652e636f6d3a3338392f64633d6578616d706c652c64633d636f6d3f3f7375623f";
  const res = LDAPResponse.fromBER(CommonUtils.hexToArrayBuffer(hex).buffer);

  // Should be correctly parsed.
  Assert.equal(res.constructor.name, "SearchResultReference");
  Assert.deepEqual(res.result, [
    "ldap://ds1.example.com:389/dc=example,dc=com??sub?",
    "ldap://ds2.example.com:389/dc=example,dc=com??sub?",
  ]);
});
