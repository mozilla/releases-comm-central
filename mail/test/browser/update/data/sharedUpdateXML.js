/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/
 */

// Copied from toolkit/mozapps/update/tests/data/sharedUpdateXML.js, stripped to
// parts used by browser_showWhatsNewPageTest.js.

/**
 * Shared code for xpcshell, mochitests-chrome, mochitest-browser-chrome, and
 * SJS server-side scripts for the test http server.
 */

/**
 * Helper functions for creating xml strings used by application update tests.
 */

/* import-globals-from ../testConstants.js */

/* global Services, UpdateUtils */

const STATE_SUCCEEDED = "succeeded";

/**
 * Constructs a string representing a local update xml file.
 *
 * @param  aUpdates
 *         The string representing the update elements.
 * @return The string representing a local update xml file.
 */
function getLocalUpdatesXMLString(aUpdates) {
  if (!aUpdates || aUpdates == "") {
    return '<updates xmlns="http://www.mozilla.org/2005/app-update"/>';
  }
  return (
    '<updates xmlns="http://www.mozilla.org/2005/app-update">' +
    aUpdates +
    "</updates>"
  );
}
