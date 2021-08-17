/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

/**
 * Tests for nsISmtpServer implementation.
 */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

/**
 * Test that cached server password is cleared when password storage changed.
 */
add_task(async function test_passwordmgr_change() {
  // Create an nsISmtpServer instance and set a password.
  let server = Cc["@mozilla.org/messenger/smtp/server;1"].createInstance(
    Ci.nsISmtpServer
  );
  server.password = "smtp-pass";
  equal(server.password, "smtp-pass", "Password should be cached.");

  // Trigger the change event of password manager.
  Services.logins.setLoginSavingEnabled("smtp://localhost", false);
  equal(server.password, "", "Password should be cleared.");
});

/**
 * Test getter/setter of attributes.
 */
add_task(async function test_attributes() {
  // Create an nsISmtpServer instance and set a password.
  let server = Cc["@mozilla.org/messenger/smtp/server;1"].createInstance(
    Ci.nsISmtpServer
  );

  server.description = "アイウ";
  equal(server.description, "アイウ", "Description should be correctly set.");

  server.hostname = "サービス.jp";
  equal(server.hostname, "サービス.jp", "Hostname should be correctly set.");
});
