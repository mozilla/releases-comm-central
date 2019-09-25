/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/* import-globals-from ../shared-modules/test-folder-display-helpers.js */

var MODULE_NAME = "test-message-sidebar";
var RELATIVE_ROOT = "../shared-modules";
var MODULE_REQUIRES = ["folder-display-helpers"];

var setupModule = function(module) {
  let fdh = collector.getModule("folder-display-helpers");
  fdh.installInto(module);
};

function test_messagepane_extension_points_exist() {
  mc.assertNode(mc.eid("messagepanewrapper"));
}
