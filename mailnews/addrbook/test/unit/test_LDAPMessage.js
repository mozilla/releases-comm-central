/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for LDAPMessage.jsm.
 */

var { CommonUtils } = ChromeUtils.import("resource://services-common/utils.js");
var { LDAPResponse, SearchRequest } = ChromeUtils.import(
  "resource:///modules/LDAPMessage.jsm"
);

/**
 * Test filter string is converted to asn1 blocks correctly.
 */
add_task(function test_SearchRequest_filter() {
  let req = new SearchRequest(
    "ou=people,dc=planetexpress,dc=com",
    Ci.nsILDAPURL.SCOPE_SUBTREE,
    "(memberof=cn=ship_crew,ou=people,dc=planetexpress,dc=com)",
    "",
    0,
    0
  );
  let filterBlock = req.protocolOp.valueBlock.value[6];
  let [filterKeyBlock, filterValueBlock] = filterBlock.valueBlock.value;
  let filterKey = new TextDecoder().decode(filterKeyBlock.valueBlock.valueHex);
  let filterValue = new TextDecoder().decode(
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
 * Test parsing to SearchResultReference works.
 */
add_task(function test_SearchResultReference() {
  // A BER payload representing a SearchResultReference with two urls, test data
  // is from https://ldap.com/ldapv3-wire-protocol-reference-search/.
  let hex =
    "306d020102736804326c6461703a2f2f6473312e6578616d706c652e636f6d3a3338392f64633d6578616d706c652c64633d636f6d3f3f7375623f04326c6461703a2f2f6473322e6578616d706c652e636f6d3a3338392f64633d6578616d706c652c64633d636f6d3f3f7375623f";
  let res = LDAPResponse.fromBER(CommonUtils.hexToArrayBuffer(hex).buffer);

  // Should be correctly parsed.
  Assert.equal(res.constructor.name, "SearchResultReference");
  Assert.deepEqual(res.result, [
    "ldap://ds1.example.com:389/dc=example,dc=com??sub?",
    "ldap://ds2.example.com:389/dc=example,dc=com??sub?",
  ]);
});
