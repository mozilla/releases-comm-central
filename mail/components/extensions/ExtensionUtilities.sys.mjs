/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  ExtensionData: "resource://gre/modules/Extension.sys.mjs",
  getClonedPrincipalWithProtocolPermission:
    "resource:///modules/LinkHelper.sys.mjs",
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

/**
 * For urls that we want to allow an extension to open, but that it may not
 * otherwise have access to, we set the triggering (content) principal to the url
 * that is being opened. This is used for the about: protocol. For other urls,
 * we clone the principal of the context and add the protocol permission for the
 * url being opened, if needed.
 *
 * Note: The caller has to ensure that extensions cannot open arbitrary URLs with
 * context.checkLoadURL().
 *
 * @param {string} url - The url that the extension is trying to open.
 * @param {BaseContext} context - Extension context to clone the principal from,
 *    if the url can be accessed directly.
 * @param {string} userContextId - Container user context id to use for the new
 *    principal.
 *
 * @returns {nsIPrincipal}
 */
export function getTriggeringPrincipalForTabCreate(
  url,
  context,
  userContextId
) {
  const uri = Services.io.newURI(url);
  // Create a content principal for url targets with the about: protocol.
  // Note: Thunderbird itself is using the system principal for about:blank.
  // Note: The caller has to ensure that extensions cannot open arbitrary URLs
  //       with context.checkLoadURL().
  if (uri.scheme == "about") {
    return Services.scriptSecurityManager.createContentPrincipal(uri, {
      userContextId,
      privateBrowsingId: 0,
    });
  }
  return lazy.getClonedPrincipalWithProtocolPermission(context.principal, uri, {
    userContextId,
    privateBrowsingId: 0,
  });
}
