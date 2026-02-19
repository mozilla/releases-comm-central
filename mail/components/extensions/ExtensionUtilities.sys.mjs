/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const lazy = {};

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  Blocklist: "resource://gre/modules/Blocklist.sys.mjs",
  ExtensionData: "resource://gre/modules/Extension.sys.mjs",
  getClonedPrincipalWithProtocolPermission:
    "resource:///modules/LinkHelper.sys.mjs",
});

XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "EXPERIMENTS_SUPPRESSED",
  "extensions.experiments.suppressed",
  false
);
XPCOMUtils.defineLazyPreferenceGetter(
  lazy,
  "EXPERIMENTS_ALLOWED",
  "extensions.experiments.allowed",
  "",
  null,
  val =>
    val
      .split(",")
      .map(s => s.trim())
      .filter(Boolean)
);

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
 * installed or not. Also updates the blocklist to suppress Experiments.
 */
export async function checkInstalledExtensions() {
  // These add-ons are installed by tests and need to be excluded when checking
  // for installed add-ons.
  const TEST_ADDONS = ["special-powers@mozilla.org", "mochikit@mozilla.org"];

  const addons = await lazy.AddonManager.getAllAddons();
  // Use allSettled to single out add-on whose resources are unavailable, because
  // they are already torn down.
  const results = await Promise.allSettled(
    addons
      .filter(a => a.type === "extension" && !TEST_ADDONS.includes(a.id))
      .map(parseManifest)
  );
  const extensionInfo = results
    .filter(r => r.status === "fulfilled")
    .map(r => r.value);

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

  await updateBlocklistForSuppressedExperiments(
    new Set(
      extensionInfo
        .filter(e => e.isSuppressedExperiment)
        .map(e => `${e.addon.id}:${e.addon.version}`)
    )
  );
}

/**
 * Parses the manifest of an add-on and determines its type flags.
 *
 * @param {AddonWrapper} addon - The add-on to parse.
 * @returns {object} result
 * @returns {AddonWrapper} result.addon - The original add-on.
 * @returns {boolean} result.isLegacy - Whether the add-on uses the legacy
 *   manifest key.
 * @returns {boolean} result.isExperiment - Whether the add-on declares
 *   experiment APIs.
 * @returns {boolean} result.isSuppressedExperiment - Whether the add-on is
 *   an experiment that should be suppressed (i.e. it is not allow-listed and
 *   not temporarily installed while experiment suppression is enabled).
 */
export async function parseManifest(addon) {
  const data = new lazy.ExtensionData(addon.getResourceURI());
  await data.loadManifest();

  const isLegacy = !!data.manifest.legacy;
  const isExperiment = !!data.manifest.experiment_apis;
  const isSuppressedExperiment =
    isExperiment &&
    lazy.EXPERIMENTS_SUPPRESSED &&
    !lazy.EXPERIMENTS_ALLOWED.includes(addon.id) &&
    !addon.temporarilyInstalled;
  return {
    addon,
    isLegacy,
    isExperiment,
    isSuppressedExperiment,
  };
}

/**
 * Updates the suppressed experiment MLBF stash, if needed. If the currently
 * blocked IDs already match, no update is performed. Reloads the in-memory
 * blocklist so changes take effect immediately.
 *
 * @param {Set<string>} blockIds - The IDs representing the extensions to be
 *    blocked, in the `add-on-name:add-on-version` format required by MLBF
 *    blocking.
 */
async function updateBlocklistForSuppressedExperiments(blockIds) {
  const SUPPRESSED_EXPERIMENTS_STASH_ID = "suppressed-experiment-add-ons";

  lazy.Blocklist.ExtensionBlocklist.ensureInitialized();
  const db = await lazy.Blocklist.ExtensionBlocklist._client.db;

  // Extract currently blocked entries in the suppressed experiments stash to
  // determine if the blocklist needs to be updated.
  const list = await db.list();
  const stash = list.find(e => e.id == SUPPRESSED_EXPERIMENTS_STASH_ID)?.stash;
  const blockedIds = new Set(stash?.blocked ?? []);
  if (blockIds.symmetricDifference(blockedIds).size == 0) {
    return;
  }

  const last_modified = Date.now();
  const item = {
    id: SUPPRESSED_EXPERIMENTS_STASH_ID,
    last_modified,
    stash: {
      blocked: [...blockIds],
      softblocked: [],
      unblocked: [],
    },
  };
  await db.importChanges({}, last_modified, [item], { clear: false });
  await lazy.Blocklist.ExtensionBlocklist._onUpdate();
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
