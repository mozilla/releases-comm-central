/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { MailMigrator } = ChromeUtils.import(
  "resource:///modules/MailMigrator.jsm"
);
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

// Ensure the profile directory is set up
var profileDir = do_get_profile();

registerCleanupFunction(function() {
  load("../../../resources/mailShutdown.js");
});

/**
 * Copies a file into the profile directory.
 *
 * @param {String} path      Path to the source data
 * @param {String} leafName  Final file name in the profile
 */
function copyABFile(path, leafName) {
  let file = do_get_file(path);
  file.copyTo(profileDir, leafName);
}

/**
 * Checks that a file exists or doesn't exist in the profile directory.
 *
 * @param {String} leafName      File name that should be checked
 * @param {boolean} shouldExist  Whether the file should exist
 */
function checkFileExists(leafName, shouldExist) {
  let file = profileDir.clone();
  file.append(leafName);
  equal(file.exists(), shouldExist, `${leafName} exists`);
}
