/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/*
 * Test the nsIMsgFolder .(get|set)StringProperty methods.
 */

add_task(function test_string_properties() {
  localAccountUtils.loadLocalMailAccount();
  const root = localAccountUtils.incomingServer.rootMsgFolder;
  root.QueryInterface(Ci.nsIMsgLocalMailFolder);
  const test = root.createLocalSubfolder("test");

  // Unset properties return an empty string.
  Assert.equal(test.getStringProperty("this-property-doesnt-exist"), "");

  // Check basic set/get operation.
  test.setStringProperty("test-property", "wibble");
  Assert.equal(test.getStringProperty("test-property"), "wibble");

  // Keys are case-sensitive.
  Assert.equal(test.getStringProperty("TEST-PROPERTY"), "");

  // Values with non-latin chars?
  test.setStringProperty("test-property", "日本語");
  Assert.equal(test.getStringProperty("test-property"), "日本語");

  // Check that things stay as strings, even if they are values that could
  // be misinterpreted in JSON.
  test.setStringProperty("test-property", "");
  Assert.equal(test.getStringProperty("test-property"), "");

  test.setStringProperty("test-property", "null");
  Assert.equal(test.getStringProperty("test-property"), "null");

  test.setStringProperty("test-property", "0");
  Assert.equal(test.getStringProperty("test-property"), "0");
});
