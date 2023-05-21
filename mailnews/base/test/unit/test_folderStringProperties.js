/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the nsIMsgFolder .(get|set)StringProperty methods.
 */

add_task(function test_string_properties() {
  localAccountUtils.loadLocalMailAccount();
  let root = localAccountUtils.incomingServer.rootMsgFolder;

  // Ensure unset properties return an error.
  Assert.throws(function () {
    root.getStringProperty("this-property-doesnt-exist");
  }, /NS_ERROR_.*/);

  // Check basic set/get operation.
  root.setStringProperty("test-property", "wibble");
  Assert.equal(root.getStringProperty("test-property"), "wibble");

  // Keys are case-sensitive.
  Assert.throws(function () {
    root.getStringProperty("TEST-PROPERTY");
  }, /NS_ERROR_.*/);

  // Values with non-latin chars?
  root.setStringProperty("test-property", "日本語");
  Assert.equal(root.getStringProperty("test-property"), "日本語");

  // Check that things stay as strings, even if they are values that could
  // be misinterpreted in JSON.
  root.setStringProperty("test-property", "");
  Assert.equal(root.getStringProperty("test-property"), "");

  root.setStringProperty("test-property", "null");
  Assert.equal(root.getStringProperty("test-property"), "null");

  root.setStringProperty("test-property", "0");
  Assert.equal(root.getStringProperty("test-property"), "0");
});
