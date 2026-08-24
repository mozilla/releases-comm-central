/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Differences from Firefox we knowingly accept, keyed by policy name. Each
// value is the exact array of diff lines diff() produces for that policy,
// unchanged context lines included.
//
// To build/update this list:
//  - copy/sync policies from Firefox to Thunderbird,
//  - make any thunderbird specific adjustements (for missing features etc.)
//  - remove the entry from the list
//  - let the test fail
//  - copy the paste-ready entry the test logs right after "To allow them, add
//    (or update) this entry to allowedDifferences"
//  - paste it back in here, then run
//    `./mach lint --fix -l eslint <this file>` to reindent it
const allowedDifferences = {
  BlockAboutProfiles: [
    "~ onBeforeUIStartup:",
    "  onBeforeUIStartup(manager, param) {",
    "        if (param) {",
    '          lazy.blockAboutPage(manager, "about:profiles");',
    '-         lazy.blockAboutPage(manager, "about:profilemanager");',
    '-         lazy.blockAboutPage(manager, "about:editprofile");',
    '-         lazy.blockAboutPage(manager, "about:deleteprofile");',
    '-         lazy.blockAboutPage(manager, "about:newprofile");',
    "        }",
    "      }",
  ],
  DefaultDownloadDirectory: [
    "~ onBeforeAddons:",
    "  ...",
    '          "browser.download.dir",',
    "          lazy.replacePathVariables(param)",
    "        );",
    "+       // If a custom download directory is being used, just lock folder list to 2.",
    '+       lazy.PoliciesUtils.setAndLockPref("browser.download.folderList", 2);',
    "      }",
  ],
};

// List built by just running the test with nothing in it and copy/pasting the
// result. May evolve.
const allowedMissing = [
  "AIControls",
  "AllowedDomainsForApps",
  "AllowFileSelectionDialogs",
  "AutofillAddressEnabled",
  "AutofillCreditCardEnabled",
  "AutoLaunchProtocolsFromOrigins",
  "Bookmarks",
  "BrowserDataBackup",
  "CNSA2KeyAgreementEnabled",
  "Containers",
  "ContentAnalysis",
  "DefaultBrowserSettingEnabled",
  "DefaultSerialGuardSetting",
  "DisableAccounts",
  "DisableDefaultBrowserAgent",
  "DisableEncryptedClientHello",
  "DisableFeedbackCommands",
  "DisableFirefoxAccounts",
  "DisableFirefoxScreenshots",
  "DisableFirefoxStudies",
  "DisableForgetButton",
  "DisableFormHistory",
  "DisableLaunchOnLogin",
  "DisablePrivateBrowsing",
  "DisableProfileImport",
  "DisableProfileRefresh",
  "DisableRemoteImprovements",
  "DisableRemoteSettingsAndAcceptSecurityConsequences",
  "DisableSetDesktopBackground",
  "DisableThirdPartyModuleBlocking",
  "DisplayBookmarksToolbar",
  "DisplayMenuBar",
  "DontCheckDefaultBrowser",
  "EnableTrackingProtection",
  "EncryptedMediaExtensions",
  "ExemptDomainFileTypePairsFromFileTypeDownloadWarnings",
  "FirefoxHome",
  "FirefoxSuggest",
  "GenerativeAI",
  "GoToIntranetSiteForSingleWordEntryInAddressBar",
  "Homepage",
  "HttpAllowlist",
  "HttpsOnlyMode",
  "IPProtectionAvailable",
  "LegacyProfiles",
  "LegacySameSiteCookieBehaviorEnabled",
  "LegacySameSiteCookieBehaviorEnabledForDomainList",
  "LocalFileLinks",
  "LocalNetworkAccess",
  "ManagedBookmarks",
  "MicrosoftEntraSSO",
  "NewTabPage",
  "NoDefaultBookmarks",
  "OverrideFirstRunPage",
  "OverridePostUpdatePage",
  "PasswordManagerExceptions",
  "Permissions",
  "PictureInPicture",
  "PopupBlocking",
  "PostQuantumKeyAgreementEnabled",
  "PrintingEnabled",
  "PrivateBrowsingModeAvailability",
  "RelaunchRequired",
  "SanitizeOnShutdown",
  "SearchBar",
  "SearchSuggestEnabled",
  "ShowHomeButton",
  "SitePolicies",
  "SkipTermsOfUse",
  "StartDownloadsInTempDirectory",
  "SupportMenu",
  "TranslateEnabled",
  "UserMessaging",
  "UseSystemPrintDialog",
  "VisualSearchEnabled",
  "WebsiteFilter",
  "WindowsSSO",
  "XSLTEnabled",
];

function getPolicies(module_name) {
  const { Policies } = ChromeUtils.importESModule(
    `resource://${module_name}/Policies.sys.mjs`
  );
  return JSON.stringify(Policies, (key, val) =>
    typeof val === "function" ? val.toString() : val
  );
}

// Number of unchanged lines kept around each change in a multi-line diff.
const DIFF_CONTEXT_LINES = 3;

// Replaces runs of unchanged lines longer than the context window with a single
// "  ..." marker, so a one line change in a long function stays readable.
function elideUnchanged(lines) {
  const keep = new Array(lines.length).fill(false);
  lines.forEach((line, i) => {
    if (line.startsWith("  ")) {
      return;
    }
    const from = Math.max(0, i - DIFF_CONTEXT_LINES);
    const to = Math.min(lines.length - 1, i + DIFF_CONTEXT_LINES);
    for (let k = from; k <= to; k++) {
      keep[k] = true;
    }
  });

  const elided = [];
  let inGap = false;
  lines.forEach((line, i) => {
    if (keep[i]) {
      elided.push(line);
      inGap = false;
    } else if (!inGap) {
      elided.push("  ...");
      inGap = true;
    }
  });

  return elided;
}

// Line-by-line diff of two arrays of lines, prefixing each line with "- ",
// "+ " or "  " the way a unified diff does.
function diffLines(oldLines, newLines) {
  const n = oldLines.length;
  const m = newLines.length;

  // lcs[i][j] is the length of the longest common subsequence of oldLines[i..]
  // and newLines[j..]. Walking it forwards yields a minimal edit script.
  const lcs = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      lcs[i][j] =
        oldLines[i] === newLines[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const lines = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (oldLines[i] === newLines[j]) {
      lines.push(`  ${oldLines[i]}`);
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      lines.push(`- ${oldLines[i]}`);
      i++;
    } else {
      lines.push(`+ ${newLines[j]}`);
      j++;
    }
  }
  while (i < n) {
    lines.push(`- ${oldLines[i++]}`);
  }
  while (j < m) {
    lines.push(`+ ${newLines[j++]}`);
  }

  return lines;
}

function diffStrings(oldValue, newValue) {
  return elideUnchanged(diffLines(oldValue.split("\n"), newValue.split("\n")));
}

// Renders a value that only exists on one side, `sign` being "-" or "+".
function oneSided(sign, path, value) {
  if (typeof value === "string" && value.includes("\n")) {
    return [
      `${sign} ${path}:`,
      ...value.split("\n").map(line => `${sign} ${line}`),
    ];
  }
  return [`${sign} ${path}: ${JSON.stringify(value)}`];
}

function diff(oldValue, newValue, path = "") {
  const lines = [];

  // Primitive or function-string leaf: compare directly.
  if (
    typeof oldValue !== "object" ||
    typeof newValue !== "object" ||
    oldValue === null ||
    newValue === null
  ) {
    if (oldValue === newValue) {
      return lines;
    }
    if (
      typeof oldValue === "string" &&
      typeof newValue === "string" &&
      (oldValue.includes("\n") || newValue.includes("\n"))
    ) {
      lines.push(`~ ${path}:`);
      lines.push(...diffStrings(oldValue, newValue));
    } else {
      lines.push(`- ${path}: ${JSON.stringify(oldValue)}`);
      lines.push(`+ ${path}: ${JSON.stringify(newValue)}`);
    }
    return lines;
  }

  const allKeys = new Set([...Object.keys(oldValue), ...Object.keys(newValue)]);

  for (const key of allKeys) {
    const keyPath = path ? `${path}.${key}` : key;
    if (!(key in oldValue)) {
      lines.push(...oneSided("+", keyPath, newValue[key]));
    } else if (!(key in newValue)) {
      lines.push(...oneSided("-", keyPath, oldValue[key]));
    } else {
      lines.push(...diff(oldValue[key], newValue[key], keyPath));
    }
  }

  return lines;
}

// Checks an observed diff against its allowedDifferences entry. Both are arrays
// of lines as produced by diff() and must match exactly; anything else is
// logged and rejected. Returns the number of mismatching lines and whether any
// of them is a stale allowedDifferences line, i.e. one that is no longer
// present in the observed diff.
function checkAllowedDifferences(policyName, observed) {
  const allowed = allowedDifferences[policyName];
  if (!Array.isArray(allowed)) {
    info(
      `allowedDifferences.${policyName} must be an array of diff lines, got ${typeof allowed}`
    );
    return { mismatches: 1, stale: false };
  }

  const mismatches = diffLines(allowed, observed).filter(
    line => !line.startsWith("  ")
  );
  let stale = false;
  for (const line of mismatches) {
    if (line.startsWith("+ ")) {
      info(`Found NOT allowed difference for ${policyName}: ${line.slice(2)}`);
    } else {
      stale = true;
      info(
        `Stale allowedDifferences line for ${policyName}, no longer present: ${line.slice(2)}`
      );
    }
  }

  return { mismatches: mismatches.length, stale };
}

add_task(function test_check_common_policies() {
  const tbirdPolicies = JSON.parse(getPolicies("/modules/policies"));
  const browserPolicies = JSON.parse(
    getPolicies("testing-common/policies_browser")
  );
  const differences = {};
  const realDifferences = {};

  for (const policyName in tbirdPolicies) {
    if (policyName === "_cleanup") {
      continue;
    }
    if (!(policyName in browserPolicies)) {
      info(`Skipping ${policyName} policy: Thunderbird specific`);
      continue;
    }
    const same =
      JSON.stringify(tbirdPolicies[policyName]) ===
      JSON.stringify(browserPolicies[policyName]);
    if (!same) {
      differences[policyName] = diff(
        browserPolicies[policyName],
        tbirdPolicies[policyName]
      );
    }
  }

  for (const policyName in allowedDifferences) {
    if (!(policyName in tbirdPolicies) || !(policyName in browserPolicies)) {
      ok(
        false,
        `Policy ${policyName} listed in allowedDifferences but not common to both applications. Please fix.`
      );
    } else if (!(policyName in differences)) {
      ok(
        false,
        `Policy ${policyName} listed in allowedDifferences but identical to Firefox. Please remove the entry.`
      );
    }
  }

  for (const policyName in differences) {
    let stale = false;
    if (policyName in allowedDifferences) {
      const result = checkAllowedDifferences(
        policyName,
        differences[policyName]
      );
      if (!result.mismatches) {
        info(`Skipping ${policyName}: allowed differences.`);
        continue;
      }
      stale = result.stale;
    }

    info(
      `No differences allowed for ${policyName} policy:\n${differences[
        policyName
      ].join("\n")}`
    );
    info(
      `To allow them, ${
        stale ? "update" : "add"
      } this entry to allowedDifferences:\n  ${JSON.stringify(
        policyName
      )}: ${JSON.stringify(differences[policyName], null, 2)},`
    );
    realDifferences[policyName] = differences[policyName];
  }

  Assert.equal(
    Object.keys(realDifferences).length,
    0,
    `Policies ${Object.keys(realDifferences)} differs from Firefox`
  );
});

add_task(function test_check_missing_policies() {
  const tbirdPolicies = JSON.parse(getPolicies("/modules/policies"));
  const browserPolicies = JSON.parse(
    getPolicies("testing-common/policies_browser")
  );
  const missing = [];

  for (const policyName in browserPolicies) {
    if (policyName === "_cleanup") {
      continue;
    }
    if (allowedMissing.includes(policyName)) {
      if (policyName in tbirdPolicies) {
        ok(
          false,
          `Policy ${policyName} listed in allowedMissing but present in Thunderbird policies. Please fix.`
        );
      }

      info(`Skipping ${policyName} policy: Missing allowed`);
      continue;
    }
    if (!(policyName in tbirdPolicies)) {
      missing.push(policyName);
    }
  }

  const missingStr = missing.map(m => `"${m}"`);
  Assert.equal(
    missing.length,
    0,
    `Browser Policies are missing: ${missingStr}`
  );
});
