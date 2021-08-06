/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests for LDAPMessage.jsm.
 */

var { SearchRequest } = ChromeUtils.import(
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
