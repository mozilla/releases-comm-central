/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests getting a configuration file from the local isp directory and
 * reading that file.
 */

// Globals

var { AccountConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/AccountConfig.sys.mjs"
);
var { FetchConfig } = ChromeUtils.importESModule(
  "resource:///modules/accountcreation/FetchConfig.sys.mjs"
);

var kXMLFile = "example.com.xml";
var fetchConfigAbortable;
var copyLocation;

function onTestSuccess(config) {
  // Check that we got the expected config.
  AccountConfig.replaceVariables(
    config,
    "Yamato Nadeshiko",
    "yamato.nadeshiko@example.com",
    "abc12345"
  );

  Assert.equal(config.incoming.username, "yamato.nadeshiko");
  Assert.equal(config.outgoing.username, "yamato.nadeshiko@example.com");
  Assert.equal(config.incoming.hostname, "pop.example.com");
  Assert.equal(config.outgoing.hostname, "smtp.example.com");
  Assert.equal(config.identity.realname, "Yamato Nadeshiko");
  Assert.equal(config.identity.emailAddress, "yamato.nadeshiko@example.com");

  Assert.equal(config.subSource, "xml-from-disk");

  do_test_finished();
}

function onTestFailure(e) {
  do_throw(e);
}

function run_test() {
  registerCleanupFunction(finish_test);

  // Copy the xml file into place
  const file = do_get_file("data/" + kXMLFile);

  copyLocation = Services.dirsvc.get("CurProcD", Ci.nsIFile);
  copyLocation.append("isp");

  file.copyTo(copyLocation, kXMLFile);

  do_test_pending();

  // Now run the actual test
  // Note we keep a global copy of this so that the abortable doesn't get
  // garbage collected before the async operation has finished.
  fetchConfigAbortable = FetchConfig.fromDisk(
    "example.com",
    onTestSuccess,
    onTestFailure
  );
}

function finish_test() {
  // Remove the test config file
  copyLocation.append(kXMLFile);
  copyLocation.remove(false);
}
