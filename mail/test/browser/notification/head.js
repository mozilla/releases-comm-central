/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Services.scriptloader.loadSubScript(
  "chrome://mochikit/content/tests/SimpleTest/MockObjects.js",
  this
);

const interfaces = ["nsIMessengerOSIntegration"];
if (AppConstants.platform == "win") {
  interfaces.push("nsIMessengerWindowsIntegration");
}
class MockOSIntegration {
  QueryInterface = ChromeUtils.generateQI(interfaces);

  static _inDoNotDisturbMode = false;

  updateUnreadCount() {}
  onExit() {}
  hideWindow() {}
  showWindow() {}
  get isInDoNotDisturbMode() {
    return MockOSIntegration._inDoNotDisturbMode;
  }
}

add_setup(function () {
  // We must mock out the OS integration for all of these tests, because (at
  // least on Windows) the CI runs tests in Do Not Disturb mode, and we don't
  // display notifications in Do Not Disturb mode.
  const osIntegration = new MockObjectRegisterer(
    "@mozilla.org/messenger/osintegration;1",
    MockOSIntegration
  );
  osIntegration.register();

  registerCleanupFunction(function () {
    osIntegration.unregister();
  });
});
