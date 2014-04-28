/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

/**
 * Tests the do-not-track prefs.
 */

// make SOLO_TEST=pref-window/test-donottrack-prefs.js mozmill-one

const PREF_DNT_ENABLED = 'privacy.donottrackheader.enabled';
const PREF_DNT_VALUE = 'privacy.donottrackheader.value';

const MODULE_NAME = 'test-donottrack-prefs';

const RELATIVE_ROOT = '../shared-modules';
const MODULE_REQUIRES = ['folder-display-helpers',
                         'pref-window-helpers'];

function setupModule(module) {
  collector.getModule('folder-display-helpers').installInto(module);
  collector.getModule('pref-window-helpers').installInto(module);
  collector.getModule('window-helpers').installInto(module);
}

/**
 * Helper that opens the privacy pane, checks that aInitiallySelectedId is
 * currently selected, selects aRadioId and closes the preferences dialog.
 */
function goClickRadio(aRadioId, aInitiallySelectedId) {
  open_pref_window("panePrivacy", function(w) {

    assert_true(w.e(aInitiallySelectedId).selected);

    // Tick the DNT option (and make sure it's ticked).
    w.click(w.eid(aRadioId));
    assert_true(w.e(aRadioId).selected,
                "The radio " + aRadioId + " didn't get set");

    // Close the window to accept the changes
    w.e("MailPreferences").acceptDialog();
    close_window(w);
  });
}

/**
 * Test that setting the do not track feature actually sets
 * the preferences correctly.
 */
function test_donottrack_checkbox() {
  goClickRadio("dntnotrack", "dntnopref");
  assert_equals(Services.prefs.getBoolPref(PREF_DNT_ENABLED), true);
  assert_equals(Services.prefs.getIntPref(PREF_DNT_VALUE), 1);

  goClickRadio("dntdotrack", "dntnotrack");
  assert_equals(Services.prefs.getBoolPref(PREF_DNT_ENABLED), true);
  assert_equals(Services.prefs.getIntPref(PREF_DNT_VALUE), 0);

  goClickRadio("dntnopref", "dntdotrack");
  assert_equals(Services.prefs.getBoolPref(PREF_DNT_ENABLED), false);
  assert_equals(Services.prefs.getIntPref(PREF_DNT_VALUE), 0);
}
