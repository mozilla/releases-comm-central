/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Linux specific version of testing the platformIsLinux part of
 * steelIApplication.
 */
function run_test() {
  let steel = Cc["@mozilla.org/steel/application;1"].getService(Ci.steelIApplication);
  do_check_true(steel.platformIsLinux);
  do_check_false(steel.platformIsMac);
  do_check_false(steel.platformIsWindows);
}
