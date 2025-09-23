/* Any copyright is dedicated to the Public Domain.
   http://creativecommons.org/publicdomain/zero/1.0/ */

if (SpecialPowers.useRemoteSubframes) {
  requestLongerTimeout(2);
}

const DEFAULT_PROCESS_COUNT = Services.prefs
  .getDefaultBranch(null)
  .getIntPref("dom.ipc.processCount");

/**
 * A test that checks whether any preference getter from the given list
 * of stats was called more often than the max parameter.
 *
 * @param {Array}  stats - an array of [prefName, accessCount] tuples
 * @param {number} max - the maximum number of times any of the prefs should
 *                 have been called.
 * @param {object} knownProblematicPrefs (optional) - an object that defines
 *                 prefs that should be exempt from checking the
 *                 maximum access. It looks like the following:
 *
 *                 pref_name: {
 *                   min: [Number] the minimum amount of times this should have
 *                                 been called (to avoid keeping around dead items)
 *                   max: [Number] the maximum amount of times this should have
 *                                 been called (to avoid this creeping up further)
 *                 }
 */
function checkPrefGetters(stats, max, knownProblematicPrefs = {}) {
  const getterStats = Object.entries(stats).sort(
    ([, val1], [, val2]) => val2 - val1
  );

  // Clone the list to be able to delete entries to check if we
  // forgot any later on.
  knownProblematicPrefs = Object.assign({}, knownProblematicPrefs);

  for (const [pref, count] of getterStats) {
    const prefLimits = knownProblematicPrefs[pref];
    if (!prefLimits) {
      Assert.lessOrEqual(
        count,
        max,
        `${pref} should not be accessed more than ${max} times.`
      );
    } else {
      // Still record how much this pref was accessed even if we don't do any real assertions.
      if (!prefLimits.min && !prefLimits.max) {
        info(
          `${pref} should not be accessed more than ${max} times and was accessed ${count} times.`
        );
      }

      if (prefLimits.min) {
        Assert.lessOrEqual(
          prefLimits.min,
          count,
          `${pref} should be accessed at least ${prefLimits.min} times.`
        );
      }
      if (prefLimits.max) {
        Assert.lessOrEqual(
          count,
          prefLimits.max,
          `${pref} should be accessed at most ${prefLimits.max} times.`
        );
      }
      delete knownProblematicPrefs[pref];
    }
  }

  const unusedPrefs = Object.keys(knownProblematicPrefs);
  is(
    unusedPrefs.length,
    0,
    `Should have accessed all known problematic prefs. Remaining: ${unusedPrefs}`
  );
}

/**
 * A helper function to read preference access data
 * using the Services.prefs.readStats() function.
 */
function getPreferenceStats() {
  const stats = {};
  Services.prefs.readStats((key, value) => (stats[key] = value));
  return stats;
}

add_task(async function debug_only() {
  ok(AppConstants.DEBUG, "You need to run this test on a debug build.");
});

// Just checks how many prefs were accessed during startup.
add_task(async function startup() {
  const max = 40;

  const knownProblematicPrefs = {
    // These are all similar values to Firefox, check with the equivalent
    // file in Firefox.
    "network.loadinfo.skip_type_assertion": {
      // This is accessed in debug only.
    },
    // Bug 944367: All gloda logs are controlled by one pref.
    "gloda.loglevel": {
      min: 10,
      max: 70,
    },
  };

  // These preferences are used in PresContext or layout areas and all have a
  // similar number of errors - probably being loaded in the same component.
  const prefsUsedInLayout = [
    "image.animation_mode",
    "layout.reflow.dumpframebyframecounts",
    "layout.reflow.dumpframecounts",
    "layout.reflow.showframecounts",
  ];

  for (const pref of prefsUsedInLayout) {
    knownProblematicPrefs[pref] = {
      min: 60,
      max: 175,
    };
  }

  if (AppConstants.platform == "macosx") {
    for (const pref of [
      "font.default.x-western",
      "font.minimum-size.x-western",
      "font.name.variable.x-western",
      "font.size-adjust.cursive.x-western",
      "font.size-adjust.fantasy.x-western",
      "font.size-adjust.monospace.x-western",
      "font.size-adjust.sans-serif.x-western",
      "font.size-adjust.serif.x-western",
      "font.size-adjust.system-ui.x-western",
      "font.size-adjust.variable.x-western",
      "font.size.cursive.x-western",
      "font.size.fantasy.x-western",
      "font.size.monospace.x-western",
      "font.size.sans-serif.x-western",
      "font.size.serif.x-western",
      "font.size.system-ui.x-western",
      "font.size.variable.x-western",
    ]) {
      knownProblematicPrefs[pref] = {
        min: 0,
        max: 45,
      };
    }
  }

  const startupRecorder =
    Cc["@mozilla.org/test/startuprecorder;1"].getService().wrappedJSObject;
  await startupRecorder.done;

  ok(startupRecorder.data.prefStats, "startupRecorder has prefStats");

  checkPrefGetters(startupRecorder.data.prefStats, max, knownProblematicPrefs);
});
