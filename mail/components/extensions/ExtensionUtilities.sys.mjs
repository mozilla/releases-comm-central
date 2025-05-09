/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  ExtensionData: "resource://gre/modules/Extension.sys.mjs",
});

/**
 * The default time between events of the same kind, which should be collapsed
 * into a single WebExtension event.
 */
export const NOTIFICATION_COLLAPSE_TIME = 200;

/**
 * Returns the native messageManager group associated with the given WebExtension
 * linkHandler.
 *
 * @param {string} linkHandler
 * @returns {string}
 */
export function getMessageManagerGroup(linkHandler) {
  switch (linkHandler) {
    case "relaxed":
      return "browsers";
    case "strict":
      return "single-page";
    case "balanced":
    default:
      return "single-site";
  }
}

/**
 * Updates the status preferences used by the IAN system to track extensions being
 * installed or not.
 */
export async function checkInstalledExtensions() {
  // These add-ons are installed by tests and need to be excluded when checking
  // for installed add-ons.
  const TEST_ADDONS = ["special-powers@mozilla.org", "mochikit@mozilla.org"];

  const extensions = await Promise.allSettled(
    await lazy.AddonManager.getAllAddons().then(a =>
      a.map(async e => {
        const data = new lazy.ExtensionData(e.getResourceURI());
        await data.loadManifest();
        return data;
      })
    )
  );
  const extensionInfo = extensions
    .filter(
      e => e.value?.type == "extension" && !TEST_ADDONS.includes(e.value.id)
    )
    .map(e => ({
      id: e.value.id,
      isExperiment: !!e.value.manifest.experiment_apis,
      data: e.value,
    }));

  // If false, we can propose to move to Release. Disabled/enabled status is not
  // checked, because the user might later want to enable an installed Experiment,
  // which he may no longer use after moving to Release.
  Services.prefs.setBoolPref(
    "extensions.hasExtensionsInstalled",
    extensionInfo.length > 0
  );
  // If false, we can propose to move to Release.
  Services.prefs.setBoolPref(
    "extensions.hasExperimentsInstalled",
    extensionInfo.some(e => e.isExperiment)
  );
}
