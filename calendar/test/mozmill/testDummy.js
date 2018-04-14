/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Dummy file to keep mozmilltests.list non-empty. See bug 1449487.

var MODULE_NAME = "testDummy";
var RELATIVE_ROOT = "./shared-modules";
var MODULE_REQUIRES = [];
var controller = {};
ChromeUtils.import("chrome://mozmill/content/modules/controller.js", controller);

function setupModule(module) {}

function test_dummy() {
    // Make the test do something so it doesn't cause bug 1450128.
    dump("testDummy: Sleeping 20 seconds\n");
    controller.sleep(20000);
}

function teardownTest(module) {}
