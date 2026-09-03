/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

"use strict";

// Differences in Policies.sys.mjs from Firefox we knowingly accept, keyed by
// policy name. Each value is the exact array of diff lines diff() produces for
// that policy, unchanged context lines included.
//
// To build/update this list:
//  - copy/sync policies from Firefox to Thunderbird,
//  - make any thunderbird specific adjustements (for missing features etc.)
//  - remove the entry from the list
//  - let the test fail
//  - copy the paste-ready entry the test logs right after "To allow them, add
//    (or update) this entry to allowedPoliciesDifferences"
//  - paste it back in here, then run
//    `./mach lint --fix -l eslint <this file>` to reindent it
const allowedPoliciesDifferences = {
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
  DisableDeveloperTools: [
    "~ onBeforeAddons:",
    "  ...",
    '          manager.disallowFeature("devtools");',
    '          lazy.blockAboutPage(manager, "about:debugging");',
    '          lazy.blockAboutPage(manager, "about:devtools-toolbox");',
    '-         lazy.blockAboutPage(manager, "about:profiling");',
    "        }",
    "      }",
  ],
  // Thunderbird defaults DNSOverHTTPS.Locked to false when the key is
  // omitted because the Thunderbird DoH preferences UI checks the lock
  // state of network.trr.mode. TODO - reconsider this implementation.
  DNSOverHTTPS: [
    "~ onBeforeAddons:",
    "  onBeforeAddons(manager, param) {",
    '+       const locked = "Locked" in param ? param.Locked : false;',
    '        if ("Enabled" in param) {',
    "          let mode = param.Enabled ? 2 : 5;",
    "          // Fallback only matters if DOH is enabled.",
    "          if (param.Fallback === false) {",
    "            mode = 3;",
    "          }",
    "-         lazy.PoliciesUtils.setDefaultPref(",
    '-           "network.trr.mode",',
    "-           mode,",
    "-           param.Locked",
    "-         );",
    '+         lazy.PoliciesUtils.setDefaultPref("network.trr.mode", mode, locked);',
    "        }",
    '        if ("ProviderURL" in param) {',
    "          lazy.PoliciesUtils.setDefaultPref(",
    '            "network.trr.uri",',
    "            param.ProviderURL.href,",
    "-           param.Locked",
    "+           locked",
    "          );",
    "        }",
    '        if ("ExcludedDomains" in param) {',
    "          lazy.PoliciesUtils.setDefaultPref(",
    '            "network.trr.excluded-domains",',
    '            param.ExcludedDomains.join(","),',
    "-           param.Locked",
    "+           locked",
    "          );",
    "        }",
    "      }",
  ],
  InstallAddonsPermission: [
    "~ onBeforeUIStartup:",
    "  ...",
    "          if (!param.Default) {",
    '            manager.disallowFeature("installTemporaryAddon");',
    "            lazy.PoliciesUtils.setAndLockPref(",
    '-             "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.addons",',
    "-             false",
    "-           );",
    "-           lazy.PoliciesUtils.setAndLockPref(",
    '-             "browser.newtabpage.activity-stream.asrouter.userprefs.cfr.features",',
    "-             false",
    "-           );",
    "-           lazy.PoliciesUtils.setAndLockPref(",
    '              "extensions.getAddons.showPane",',
    "              false",
    "            );",
    "  ...",
  ],
  PasswordManagerEnabled: [
    "~ onBeforeUIStartup:",
    "  ...",
    '            "pref.privacy.disable_button.view_passwords",',
    "            true",
    "          );",
    "-         lazy.PoliciesUtils.setAndLockPref(",
    '-           "browser.contextual-password-manager.enabled",',
    "-           false",
    "-         );",
    "        }",
    '        lazy.PoliciesUtils.setAndLockPref("signon.rememberSignons", param);',
    "      }",
  ],
  Preferences: [
    "~ onBeforeAddons:",
    "  onBeforeAddons(manager, param) {",
    "        const allowedPrefixes = [",
    '          "accessibility.",',
    '-         "alerts.",',
    '          "app.update.",',
    '          "browser.",',
    '+         "calendar.",',
    '+         "chat.",',
    '          "datareporting.policy.",',
    '-         "devtools.",',
    '          "dom.",',
    '          "extensions.",',
    '          "general.autoScroll",',
    '          "general.smoothScroll",',
    '          "geo.",',
    '          "gfx.",',
    '-         "identity.fxaccounts.toolbar.",',
    '          "intl.",',
    '-         "keyword.enabled",',
    '          "layers.",',
    '          "layout.",',
    '-         "mathml.disabled",',
    '+         "mail.",',
    '+         "mailnews.",',
    '          "media.",',
    '          "network.",',
    '          "pdfjs.",',
    '          "places.",',
    '-         "pref.",',
    '          "print.",',
    '-         "privacy.baselineFingerprintingProtection",',
    '-         "privacy.fingerprintingProtection",',
    '-         "privacy.globalprivacycontrol.enabled",',
    '-         "privacy.userContext.enabled",',
    '-         "privacy.userContext.ui.enabled",',
    '-         "sidebar.",',
    '          "signon.",',
    '          "spellchecker.",',
    '-         "svg.context-properties.content.enabled",',
    '-         "svg.disabled",',
    '-         "toolkit.legacyUserProfileCustomizations.stylesheets",',
    '          "ui.",',
    '-         "webgl.disabled",',
    '-         "webgl.force-enabled",',
    '          "widget.",',
    '-         "xpinstall.enabled",',
    '-         "xpinstall.whitelist.required",',
    "        ];",
    "-       if (!AppConstants.MOZ_REQUIRE_SIGNING) {",
    '-         allowedPrefixes.push("xpinstall.signatures.required");',
    "-       }",
    "        const allowedSecurityPrefs = [",
    '-         "security.block_fileuri_script_with_wrong_mime",',
    '-         "security.csp.reporting.enabled",',
    '          "security.default_personal_cert",',
    '-         "security.disable_button.openCertManager",',
    '-         "security.disable_button.openDeviceManager",',
    '          "security.insecure_connection_text.enabled",',
    '          "security.insecure_connection_text.pbmode.enabled",',
    '+         "security.insecure_field_warning.contextual.enabled",',
    '          "security.mixed_content.block_active_content",',
    '-         "security.mixed_content.block_display_content",',
    '-         "security.mixed_content.upgrade_display_content",',
    '          "security.osclientcerts.autoload",',
    '-         "security.OCSP.enabled",',
    '-         "security.OCSP.require",',
    '-         "security.pki.certificate_transparency.disable_for_hosts",',
    '-         "security.pki.certificate_transparency.disable_for_spki_hashes",',
    '-         "security.pki.certificate_transparency.mode",',
    '-         "security.ssl.enable_ocsp_stapling",',
    '          "security.ssl.errorReporting.enabled",',
    '-         "security.ssl.require_safe_negotiation",',
    '-         "security.storage.encryption.sqlite.enabled",',
    '-         "security.tls.enable_0rtt_data",',
    '          "security.tls.hello_downgrade_check",',
    '          "security.tls.version.enable-deprecated",',
    '          "security.warn_submit_secure_to_insecure",',
    '-         "security.webauthn.always_allow_direct_attestation",',
    "        ];",
    "        const blockedPrefs = [",
    '          "app.update.channel",',
    '          "app.update.lastUpdateTime",',
    '          "app.update.migrated",',
    '-         "browser.vpn_promo.disallowed_regions",',
    "        ];",
    "- ",
    "        for (const preference in param) {",
    "          if (blockedPrefs.includes(preference)) {",
    "            lazy.log.error(",
    "  ...",
    "              continue;",
    "            }",
    "  ",
    "-           let prefBranch;",
    '            if (param[preference].Status == "user") {',
    "-             prefBranch = Services.prefs;",
    "+             var prefBranch = Services.prefs;",
    "            } else {",
    '              prefBranch = Services.prefs.getDefaultBranch("");',
    "            }",
    "  ",
    "-           // Prefs that were previously locked should stay locked,",
    "-           // but policy can update the value.",
    "-           const prefWasLocked = Services.prefs.prefIsLocked(preference);",
    "-           if (prefWasLocked) {",
    "-             Services.prefs.unlockPref(preference);",
    "-           }",
    "            try {",
    "-             const prefType =",
    "-               param[preference].Type || typeof param[preference].Value;",
    "-             switch (prefType) {",
    "+             switch (typeof param[preference].Value) {",
    '                case "boolean":',
    "                  prefBranch.setBoolPref(preference, param[preference].Value);",
    "                  break;",
    "  ...",
    "                  // Preferences implementation, the schema took care of",
    "                  // automatically converting these values to booleans.",
    "                  // Since we allow arbitrary prefs now, we have to do",
    "-                 // something different. See bug 1666836, 1668374, and 1872267.",
    "- ",
    "-                 // We only set something as int if it was explicit in policy,",
    "-                 // the same type as the default pref, or NOT 0/1. Otherwise",
    "-                 // we set it as bool.",
    "+                 // something different. See bug 1666836.",
    "                  if (",
    '-                   param[preference].Type == "number" ||',
    "                    prefBranch.getPrefType(preference) == prefBranch.PREF_INT ||",
    "                    ![0, 1].includes(param[preference].Value)",
    "                  ) {",
    "  ...",
    "              );",
    "            }",
    "  ",
    '-           if (param[preference].Status == "locked" || prefWasLocked) {',
    '+           if (param[preference].Status == "locked") {',
    "              Services.prefs.lockPref(preference);",
    "            }",
    "          }",
    "  ...",
  ],
};

if (AppConstants.MOZ_ENTERPRISE) {
  // When running enterprise builds, the Policies.sys.mjs differs from what
  // m-c has. Adjust expectations.

  allowedPoliciesDifferences.DisableDeveloperTools = [
    "~ onBeforeAddons:",
    "  ...",
    '          manager.disallowFeature("devtools");',
    '          lazy.blockAboutPage(manager, "about:debugging");',
    '          lazy.blockAboutPage(manager, "about:devtools-toolbox");',
    '-         lazy.blockAboutPage(manager, "about:profiling");',
    "        } else {",
    '          lazy.PoliciesUtils.setAndLockPref("devtools.policy.disabled", false);',
    '          lazy.PoliciesUtils.setAndLockPref("devtools.chrome.enabled", true);',
    "  ...",
    '          manager.allowFeature("devtools");',
    '          lazy.unblockAboutPage(manager, "about:debugging");',
    '          lazy.unblockAboutPage(manager, "about:devtools-toolbox");',
    '-         lazy.unblockAboutPage(manager, "about:profiling");',
    "        }",
    "      }",
    "~ onRemove:",
    "  ...",
    '        manager.allowFeature("devtools");',
    '        lazy.unblockAboutPage(manager, "about:debugging");',
    '        lazy.unblockAboutPage(manager, "about:devtools-toolbox");',
    '-       lazy.unblockAboutPage(manager, "about:profiling");',
    "      }",
  ];

  allowedPoliciesDifferences.Preferences = [
    "~ onBeforeAddons:",
    "  onBeforeAddons(manager, param) {",
    "        const allowedPrefixes = [",
    '          "accessibility.",',
    '-         "alerts.",',
    '          "app.update.",',
    '          "browser.",',
    '+         "calendar.",',
    '+         "chat.",',
    '          "datareporting.policy.",',
    '-         "devtools.",',
    '          "dom.",',
    '          "extensions.",',
    '          "general.autoScroll",',
    '          "general.smoothScroll",',
    '          "geo.",',
    '          "gfx.",',
    '-         "identity.fxaccounts.toolbar.",',
    '          "intl.",',
    '-         "keyword.enabled",',
    '          "layers.",',
    '          "layout.",',
    '-         "mathml.disabled",',
    '+         "mail.",',
    '+         "mailnews.",',
    '          "media.",',
    '          "network.",',
    '          "pdfjs.",',
    '          "places.",',
    '-         "pref.",',
    '          "print.",',
    '-         "privacy.baselineFingerprintingProtection",',
    '-         "privacy.fingerprintingProtection",',
    '-         "privacy.globalprivacycontrol.enabled",',
    '-         "privacy.userContext.enabled",',
    '-         "privacy.userContext.ui.enabled",',
    '-         "sidebar.",',
    '          "signon.",',
    '          "spellchecker.",',
    '-         "svg.context-properties.content.enabled",',
    '-         "svg.disabled",',
    '-         "toolkit.legacyUserProfileCustomizations.stylesheets",',
    '          "ui.",',
    '-         "webgl.disabled",',
    '-         "webgl.force-enabled",',
    '          "widget.",',
    '-         "xpinstall.enabled",',
    '-         "xpinstall.whitelist.required",',
    "        ];",
    "-       if (!AppConstants.MOZ_REQUIRE_SIGNING) {",
    '-         allowedPrefixes.push("xpinstall.signatures.required");',
    "-       }",
    "        const allowedSecurityPrefs = [",
    '-         "security.block_fileuri_script_with_wrong_mime",',
    '-         "security.csp.reporting.enabled",',
    '          "security.default_personal_cert",',
    '-         "security.disable_button.openCertManager",',
    '-         "security.disable_button.openDeviceManager",',
    '          "security.insecure_connection_text.enabled",',
    '          "security.insecure_connection_text.pbmode.enabled",',
    '+         "security.insecure_field_warning.contextual.enabled",',
    '          "security.mixed_content.block_active_content",',
    '-         "security.mixed_content.block_display_content",',
    '-         "security.mixed_content.upgrade_display_content",',
    '          "security.osclientcerts.autoload",',
    '-         "security.OCSP.enabled",',
    '-         "security.OCSP.require",',
    '-         "security.pki.certificate_transparency.disable_for_hosts",',
    '-         "security.pki.certificate_transparency.disable_for_spki_hashes",',
    '-         "security.pki.certificate_transparency.mode",',
    '-         "security.storage.encryption.enabled",',
    '-         "security.ssl.enable_ocsp_stapling",',
    '          "security.ssl.errorReporting.enabled",',
    '-         "security.ssl.require_safe_negotiation",',
    '-         "security.storage.encryption.sqlite.enabled",',
    '-         "security.tls.enable_0rtt_data",',
    '          "security.tls.hello_downgrade_check",',
    '          "security.tls.version.enable-deprecated",',
    '          "security.warn_submit_secure_to_insecure",',
    '-         "security.webauthn.always_allow_direct_attestation",',
    "        ];",
    "        const blockedPrefs = [",
    '          "app.update.channel",',
    '          "app.update.lastUpdateTime",',
    '          "app.update.migrated",',
    '-         "browser.vpn_promo.disallowed_regions",',
    "        ];",
    "  ",
    "        for (const preference in param) {",
    "  ...",
    '              prefBranch = Services.prefs.getDefaultBranch("");',
    "            }",
    "  ",
    "-           // Prefs that were previously locked should stay locked,",
    "-           // but policy can update the value.",
    "-           const prefWasLocked = Services.prefs.prefIsLocked(preference);",
    "-           if (prefWasLocked) {",
    "-             Services.prefs.unlockPref(preference);",
    "-           }",
    "            try {",
    "-             const prefType =",
    "-               param[preference].Type || typeof param[preference].Value;",
    "-             switch (prefType) {",
    "+             switch (typeof param[preference].Value) {",
    '                case "boolean":',
    "                  prefBranch.setBoolPref(preference, param[preference].Value);",
    "                  break;",
    "  ...",
    "                  // Preferences implementation, the schema took care of",
    "                  // automatically converting these values to booleans.",
    "                  // Since we allow arbitrary prefs now, we have to do",
    "-                 // something different. See bug 1666836, 1668374, and 1872267.",
    "- ",
    "-                 // We only set something as int if it was explicit in policy,",
    "-                 // the same type as the default pref, or NOT 0/1. Otherwise",
    "-                 // we set it as bool.",
    "+                 // something different. See bug 1666836.",
    "                  if (",
    '                    param[preference].Type == "number" ||',
    "                    prefBranch.getPrefType(preference) == prefBranch.PREF_INT ||",
    "  ...",
    "              );",
    "            }",
    "  ",
    '-           if (param[preference].Status == "locked" || prefWasLocked) {',
    '+           if (param[preference].Status == "locked") {',
    "              Services.prefs.lockPref(preference);",
    "            }",
    "          }",
    "  ...",
  ];
}

// Firefox Policies.sys.mjs policies Thunderbird knowingly does not implement.
// List built by just running the test with nothing in it and copy/pasting the
// result. May evolve.
const allowedPoliciesMissing = [
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

if (AppConstants.MOZ_ENTERPRISE) {
  allowedPoliciesMissing.push(
    "AccessConnector",
    "AIChatbot",
    "ContentAnalysisTelemetry",
    "CrashReportsSubmit",
    "DataLossPrevention",
    "DisableLocalPolicies",
    "SecurityLogging",
    "Sync",
    "Watermark"
  );
}

// Differences in policies-schema.json from Firefox we knowingly accept, keyed
// by policy name (or by root level schema key). Built and updated the same way
// as allowedPoliciesDifferences.
//
// Each value is the pretty printed schema of that policy, diffed line by line:
// "-" is what Firefox has, "+" what Thunderbird has, "  " unchanged context and
// "  ..." a run of unchanged lines too far from any change to be kept.
//
// Firefox's titled "oneOf" against Thunderbird's plain "enum" accounts for most
// of it.
const allowedSchemaDifferences = {
  Cookies: [
    "  ...",
    '          "$ref": "#/definitions/origin"',
    "        }",
    "      },",
    '-     "AllowSession": {',
    '-       "type": "array",',
    '-       "items": {',
    '-         "$ref": "#/definitions/origin"',
    "-       }",
    "-     },",
    '      "Block": {',
    '        "type": "array",',
    '        "items": {',
    "  ...",
    "      },",
    '      "AcceptThirdParty": {',
    '        "type": "string",',
    '-       "oneOf": [',
    "-         {",
    '-           "const": "always",',
    '-           "title": "Always"',
    "-         },",
    "-         {",
    '-           "const": "never",',
    '-           "title": "Never"',
    "-         },",
    "-         {",
    '-           "const": "from-visited",',
    '-           "title": "From visited sites only"',
    "-         }",
    '+       "enum": [',
    '+         "always",',
    '+         "never",',
    '+         "from-visited"',
    "        ]",
    "      },",
    '-     "RejectTracker": {',
    '-       "type": "boolean"',
    "-     },",
    '      "ExpireAtSessionEnd": {',
    '        "type": "boolean"',
    "      },",
    '      "Locked": {',
    '        "type": "boolean"',
    "-     },",
    '-     "Behavior": {',
    '-       "type": "string",',
    '-       "oneOf": [',
    "-         {",
    '-           "const": "accept",',
    '-           "title": "Accept all cookies"',
    "-         },",
    "-         {",
    '-           "const": "reject-foreign",',
    '-           "title": "Reject third-party cookies"',
    "-         },",
    "-         {",
    '-           "const": "reject",',
    '-           "title": "Reject all cookies"',
    "-         },",
    "-         {",
    '-           "const": "limit-foreign",',
    '-           "title": "Third-party cookies from visited sites only"',
    "-         },",
    "-         {",
    '-           "const": "reject-tracker",',
    '-           "title": "Reject known trackers"',
    "-         },",
    "-         {",
    '-           "const": "reject-tracker-and-partition-foreign",',
    '-           "title": "Reject known trackers and partition third-party cookies"',
    "-         },",
    "-         {",
    '-           "const": "partition-foreign",',
    '-           "title": "Partition third-party cookies"',
    "-         }",
    "-       ]",
    "-     },",
    '-     "BehaviorPrivateBrowsing": {',
    '-       "type": "string",',
    '-       "oneOf": [',
    "-         {",
    '-           "const": "accept",',
    '-           "title": "Accept all cookies"',
    "-         },",
    "-         {",
    '-           "const": "reject-foreign",',
    '-           "title": "Reject third-party cookies"',
    "-         },",
    "-         {",
    '-           "const": "reject",',
    '-           "title": "Reject all cookies"',
    "-         },",
    "-         {",
    '-           "const": "limit-foreign",',
    '-           "title": "Third-party cookies from visited sites only"',
    "-         },",
    "-         {",
    '-           "const": "reject-tracker",',
    '-           "title": "Reject known trackers"',
    "-         },",
    "-         {",
    '-           "const": "reject-tracker-and-partition-foreign",',
    '-           "title": "Reject known trackers and partition third-party cookies"',
    "-         },",
    "-         {",
    '-           "const": "partition-foreign",',
    '-           "title": "Partition third-party cookies"',
    "-         }",
    "-       ]",
    "      }",
    "    }",
    "  }",
  ],
  DisabledCiphers: [
    "  ...",
    "      },",
    '      "TLS_RSA_WITH_3DES_EDE_CBC_SHA": {',
    '        "type": "boolean"',
    "-     },",
    '-     "TLS_CHACHA20_POLY1305_SHA256": {',
    '-       "type": "boolean"',
    "-     },",
    '-     "TLS_AES_128_GCM_SHA256": {',
    '-       "type": "boolean"',
    "-     },",
    '-     "TLS_AES_256_GCM_SHA384": {',
    '-       "type": "boolean"',
    "      }",
    "    }",
    "  }",
  ],
  DNSOverHTTPS: [
    "  ...",
    '          "type": "string"',
    "        }",
    "      },",
    '-     "Fallback": {',
    '-       "type": "boolean"',
    "-     },",
    '      "Locked": {',
    '        "type": "boolean"',
    "      }",
    "  ...",
  ],
  ExtensionSettings: [
    "  ...",
    '        "properties": {',
    '          "installation_mode": {',
    '            "type": "string",',
    '-           "oneOf": [',
    "-             {",
    '-               "const": "allowed",',
    '-               "title": "Allowed"',
    "-             },",
    "-             {",
    '-               "const": "blocked",',
    '-               "title": "Blocked"',
    "-             }",
    '+           "enum": [',
    '+             "allowed",',
    '+             "blocked"',
    "            ]",
    "          },",
    '          "allowed_types": {',
    '            "type": "array",',
    '            "items": {',
    '              "type": "string",',
    '-             "oneOf": [',
    "-               {",
    '-                 "const": "extension",',
    '-                 "title": "Extension"',
    "-               },",
    "-               {",
    '-                 "const": "dictionary",',
    '-                 "title": "Spelling dictionary"',
    "-               },",
    "-               {",
    '-                 "const": "locale",',
    '-                 "title": "Language pack"',
    "-               },",
    "-               {",
    '-                 "const": "theme",',
    '-                 "title": "Theme"',
    "-               },",
    "-               {",
    '-                 "const": "sitepermission",',
    '-                 "title": "Site permission add-on"',
    "-               }",
    '+             "enum": [',
    '+               "extension",',
    '+               "dictionary",',
    '+               "locale",',
    '+               "theme"',
    "              ]",
    "            }",
    "          },",
    "  ...",
    '            "items": {',
    '              "type": "string"',
    "            }",
    "-         },",
    '-         "runtime_allowed_hosts": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "runtime_blocked_hosts": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "temporarily_allow_weak_signatures": {',
    '-           "type": "boolean"',
    "-         },",
    '-         "blocked_permissions": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "allowed_permissions": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "          }",
    "        }",
    "      }",
    "  ...",
    '        "properties": {',
    '          "installation_mode": {',
    '            "type": "string",',
    '-           "oneOf": [',
    "-             {",
    '-               "const": "allowed",',
    '-               "title": "Allowed"',
    "-             },",
    "-             {",
    '-               "const": "blocked",',
    '-               "title": "Blocked"',
    "-             },",
    "-             {",
    '-               "const": "force_installed",',
    '-               "title": "Force installed"',
    "-             },",
    "-             {",
    '-               "const": "normal_installed",',
    '-               "title": "Normal installed"',
    "-             }",
    '+           "enum": [',
    '+             "allowed",',
    '+             "blocked",',
    '+             "force_installed",',
    '+             "normal_installed"',
    "            ]",
    "          },",
    '          "install_url": {',
    "  ...",
    '          "update_url": {',
    '            "$ref": "#/definitions/url"',
    "          },",
    '-         "default_area": {',
    '-           "type": "string",',
    '-           "oneOf": [',
    "-             {",
    '-               "const": "navbar",',
    '-               "title": "Toolbar"',
    "-             },",
    "-             {",
    '-               "const": "menupanel",',
    '-               "title": "Extensions panel"',
    "-             }",
    "-           ]",
    "-         },",
    '-         "runtime_allowed_hosts": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "runtime_blocked_hosts": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "temporarily_allow_weak_signatures": {',
    '-           "type": "boolean"',
    "-         },",
    '          "private_browsing": {',
    '            "type": "boolean"',
    "-         },",
    '-         "blocked_permissions": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "-         },",
    '-         "allowed_permissions": {',
    '-           "type": "array",',
    '-           "items": {',
    '-             "type": "string"',
    "-           }",
    "          }",
    "        }",
    "      }",
    "  ...",
  ],
  Handlers: [
    "  ...",
    '            "properties": {',
    '              "action": {',
    '                "type": "string",',
    '-               "oneOf": [',
    "-                 {",
    '-                   "const": "saveToDisk",',
    '-                   "title": "Save to disk"',
    "-                 },",
    "-                 {",
    '-                   "const": "useHelperApp",',
    '-                   "title": "Open with a helper application"',
    "-                 },",
    "-                 {",
    '-                   "const": "useSystemDefault",',
    '-                   "title": "Open with the system default application"',
    "-                 }",
    '+               "enum": [',
    '+                 "saveToDisk",',
    '+                 "useHelperApp",',
    '+                 "useSystemDefault"',
    "                ]",
    "              },",
    '              "ask": {',
    "  ...",
  ],
  Preferences: [
    "  ...",
    "          },",
    '          "Status": {',
    '            "type": "string",',
    '-           "oneOf": [',
    "-             {",
    '-               "const": "default",',
    '-               "title": "Set the default value"',
    "-             },",
    "-             {",
    '-               "const": "locked",',
    '-               "title": "Set and lock"',
    "-             },",
    "-             {",
    '-               "const": "user",',
    '-               "title": "Set as a user value"',
    "-             },",
    "-             {",
    '-               "const": "clear",',
    '-               "title": "Clear the user value"',
    "-             }",
    "-           ]",
    "-         },",
    '-         "Type": {',
    '-           "type": "string",',
    '-           "oneOf": [',
    "-             {",
    '-               "const": "number",',
    '-               "title": "Number"',
    "-             },",
    "-             {",
    '-               "const": "boolean",',
    '-               "title": "Boolean"',
    "-             },",
    "-             {",
    '-               "const": "string",',
    '-               "title": "String"',
    "-             }",
    '+           "enum": [',
    '+             "default",',
    '+             "locked",',
    '+             "user",',
    '+             "clear"',
    "            ]",
    "          }",
    "        }",
    "  ...",
  ],
  Proxy: [
    "  ...",
    '    "properties": {',
    '      "Mode": {',
    '        "type": "string",',
    '-       "oneOf": [',
    "-         {",
    '-           "const": "none",',
    '-           "title": "No proxy"',
    "-         },",
    "-         {",
    '-           "const": "system",',
    '-           "title": "Use system settings"',
    "-         },",
    "-         {",
    '-           "const": "manual",',
    '-           "title": "Manual configuration"',
    "-         },",
    "-         {",
    '-           "const": "autoDetect",',
    '-           "title": "Auto-detect (WPAD)"',
    "-         },",
    "-         {",
    '-           "const": "autoConfig",',
    '-           "title": "Automatic proxy configuration (PAC)"',
    "-         }",
    '+       "enum": [',
    '+         "none",',
    '+         "system",',
    '+         "manual",',
    '+         "autoDetect",',
    '+         "autoConfig"',
    "        ]",
    "      },",
    '      "Locked": {',
    "  ...",
    "      },",
    '      "SOCKSVersion": {',
    '        "type": "number",',
    '-       "oneOf": [',
    "-         {",
    '-           "const": 4,',
    '-           "title": "SOCKS v4"',
    "-         },",
    "-         {",
    '-           "const": 5,',
    '-           "title": "SOCKS v5"',
    "-         }",
    '+       "enum": [',
    "+         4,",
    "+         5",
    "        ]",
    "      },",
    '      "UseHTTPProxyForAllProtocols": {',
    "  ...",
  ],
  SearchEngines: [
    "  {",
    '+   "enterprise_only": true,',
    '    "type": "object",',
    '    "properties": {',
    '      "Add": {',
    "  ...",
    "            },",
    '            "Method": {',
    '              "type": "string",',
    '-             "oneOf": [',
    "-               {",
    '-                 "const": "GET",',
    '-                 "title": "GET"',
    "-               },",
    "-               {",
    '-                 "const": "POST",',
    '-                 "title": "POST"',
    "-               }",
    '+             "enum": [',
    '+               "GET",',
    '+               "POST"',
    "              ]",
    "            },",
    '            "URLTemplate": {',
    "  ...",
  ],
  SSLVersionMax: [
    "  {",
    '    "type": "string",',
    '-   "oneOf": [',
    "-     {",
    '-       "const": "tls1",',
    '-       "title": "TLS 1.0"',
    "-     },",
    "-     {",
    '-       "const": "tls1.1",',
    '-       "title": "TLS 1.1"',
    "-     },",
    "-     {",
    '-       "const": "tls1.2",',
    '-       "title": "TLS 1.2"',
    "-     },",
    "-     {",
    '-       "const": "tls1.3",',
    '-       "title": "TLS 1.3"',
    "-     }",
    '+   "enum": [',
    '+     "tls1",',
    '+     "tls1.1",',
    '+     "tls1.2",',
    '+     "tls1.3"',
    "    ]",
    "  }",
  ],
  SSLVersionMin: [
    "  {",
    '    "type": "string",',
    '-   "oneOf": [',
    "-     {",
    '-       "const": "tls1",',
    '-       "title": "TLS 1.0"',
    "-     },",
    "-     {",
    '-       "const": "tls1.1",',
    '-       "title": "TLS 1.1"',
    "-     },",
    "-     {",
    '-       "const": "tls1.2",',
    '-       "title": "TLS 1.2"',
    "-     },",
    "-     {",
    '-       "const": "tls1.3",',
    '-       "title": "TLS 1.3"',
    "-     }",
    '+   "enum": [',
    '+     "tls1",',
    '+     "tls1.1",',
    '+     "tls1.2",',
    '+     "tls1.3"',
    "    ]",
    "  }",
  ],
};

if (AppConstants.MOZ_ENTERPRISE) {
  // policies-schema-enterprise.json carries the same "x-restart-required" keys
  // as Firefox, so the key is compared rather than ignored on these builds and
  // shows up as context next to the differences of these three policies.
  allowedSchemaDifferences.definitions = [
    "  ...",
    "        }",
    "      ]",
    "    },",
    '-   "urlLoggingLevel": {',
    '-     "type": "string",',
    '-     "oneOf": [',
    "-       {",
    '-         "const": "full",',
    '-         "title": "Full URLs"',
    "-       },",
    "-       {",
    '-         "const": "domain",',
    '-         "title": "Domains only"',
    "-       },",
    "-       {",
    '-         "const": "none",',
    '-         "title": "No URLs"',
    "-       }",
    "-     ]",
    "-   },",
    '    "origin": {',
    '      "type": "string",',
    '      "format": "uri",',
    "  ...",
  ];

  allowedSchemaDifferences.SearchEngines = [
    "  {",
    '+   "enterprise_only": true,',
    '    "type": "object",',
    '    "x-restart-required": true,',
    '    "properties": {',
    "  ...",
    "            },",
    '            "Method": {',
    '              "type": "string",',
    '-             "oneOf": [',
    "-               {",
    '-                 "const": "GET",',
    '-                 "title": "GET"',
    "-               },",
    "-               {",
    '-                 "const": "POST",',
    '-                 "title": "POST"',
    "-               }",
    '+             "enum": [',
    '+               "GET",',
    '+               "POST"',
    "              ]",
    "            },",
    '            "URLTemplate": {',
    "  ...",
  ];
  allowedSchemaDifferences.SSLVersionMax = [
    "  {",
    '    "type": "string",',
    '    "x-restart-required": true,',
    '-   "oneOf": [',
    "-     {",
    '-       "const": "tls1",',
    '-       "title": "TLS 1.0"',
    "-     },",
    "-     {",
    '-       "const": "tls1.1",',
    '-       "title": "TLS 1.1"',
    "-     },",
    "-     {",
    '-       "const": "tls1.2",',
    '-       "title": "TLS 1.2"',
    "-     },",
    "-     {",
    '-       "const": "tls1.3",',
    '-       "title": "TLS 1.3"',
    "-     }",
    '+   "enum": [',
    '+     "tls1",',
    '+     "tls1.1",',
    '+     "tls1.2",',
    '+     "tls1.3"',
    "    ]",
    "  }",
  ];
  allowedSchemaDifferences.SSLVersionMin = [
    "  {",
    '    "type": "string",',
    '    "x-restart-required": true,',
    '-   "oneOf": [',
    "-     {",
    '-       "const": "tls1",',
    '-       "title": "TLS 1.0"',
    "-     },",
    "-     {",
    '-       "const": "tls1.1",',
    '-       "title": "TLS 1.1"',
    "-     },",
    "-     {",
    '-       "const": "tls1.2",',
    '-       "title": "TLS 1.2"',
    "-     },",
    "-     {",
    '-       "const": "tls1.3",',
    '-       "title": "TLS 1.3"',
    "-     }",
    '+   "enum": [',
    '+     "tls1",',
    '+     "tls1.1",',
    '+     "tls1.2",',
    '+     "tls1.3"',
    "    ]",
    "  }",
  ];
}

// Firefox policies-schema.json entries Thunderbird knowingly does not ship.
// Built the same way as allowedPoliciesMissing.
const allowedSchemaMissing = [
  "AccessConnector",
  "AIChatbot",
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
  "ContentAnalysisTelemetry",
  "CrashReportsSubmit",
  "DataLossPrevention",
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
  "DisableLocalPolicies",
  "DisablePocket",
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
  "EnterpriseStorageEncryption",
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
  "SecurityLogging",
  "ShowHomeButton",
  "SitePolicies",
  "SkipTermsOfUse",
  "StartDownloadsInTempDirectory",
  "SupportMenu",
  "Sync",
  "TranslateEnabled",
  "UserMessaging",
  "UseSystemPrintDialog",
  "VisualSearchEnabled",
  "Watermark",
  "WebsiteFilter",
  "WindowsSSO",
  "XSLTEnabled",
];

// Keys the Firefox schema carries only for documentation and downstream
// tooling (see policies-schema.meta.json) and that the Thunderbird schema does
// not duplicate. Comparing them would bury the structural differences.
const ignoredSchemaKeys = [
  "$comment",
  "description",
  "examples",
  "x-category",
  "x-compatibility",
];

if (!AppConstants.MOZ_ENTERPRISE) {
  // Only policies-schema-enterprise.json carries "x-restart-required", so on
  // other builds there is nothing to compare it against.
  ignoredSchemaKeys.push("x-restart-required");
}

const THUNDERBIRD_POLICIES_URL =
  "resource:///modules/policies/Policies.sys.mjs";
const FIREFOX_POLICIES_URL =
  "resource://testing-common/policies_browser/Policies.sys.mjs";
const THUNDERBIRD_SCHEMA_URL =
  "resource:///modules/policies/policies-schema.json";
const FIREFOX_SCHEMA_URL =
  "resource://testing-common/policies_browser/policies-schema.json";

// One entry per policy. Serializing and parsing back turns each policy method
// into its source, which diff() then compares line by line.
function getPolicyEntries(url) {
  const { Policies } = ChromeUtils.importESModule(url);
  return JSON.parse(
    JSON.stringify(Policies, (key, val) =>
      typeof val === "function" ? val.toString() : val
    )
  );
}

function stripIgnoredSchemaKeys(node) {
  if (Array.isArray(node)) {
    return node.map(stripIgnoredSchemaKeys);
  }
  if (!node || typeof node !== "object") {
    return node;
  }
  const stripped = {};
  for (const [key, value] of Object.entries(node)) {
    if (!ignoredSchemaKeys.includes(key)) {
      stripped[key] = stripIgnoredSchemaKeys(value);
    }
  }
  return stripped;
}

// Flattens a schema into entries comparable one by one: one per policy, plus
// the root level keys (definitions, type, ...) so that a new shared definition
// or a root level change does not go unnoticed either.
//
// Each entry is pretty printed rather than kept as an object, so that diff()
// takes it through the same line by line path as a policy method body: the
// allowed differences then show the schema the way it is written in
// policies-schema.json instead of a flat list of dotted leaf paths.
async function getSchemaEntries(url) {
  const response = await fetch(url, { credentials: "omit" });
  const { properties, ...root } = stripIgnoredSchemaKeys(await response.json());
  return Object.fromEntries(
    Object.entries({ ...root, ...properties }).map(([name, value]) => [
      name,
      JSON.stringify(value, null, 2),
    ])
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
      // A schema entry is diffed as a whole, so there is no member to name.
      if (path) {
        lines.push(`~ ${path}:`);
      }
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

// Checks an observed diff against its entry in `allowedList` (named
// `allowedName` in the logs). Both are arrays of lines as produced by diff()
// and must match exactly; anything else is logged and rejected. Returns the
// number of mismatching lines and whether any of them is a stale allowed line,
// i.e. one that is no longer present in the observed diff.
function checkAllowedDifferences(
  policyName,
  observed,
  allowedList,
  allowedName
) {
  const allowed = allowedList[policyName];
  if (!Array.isArray(allowed)) {
    info(
      `${allowedName}.${policyName} must be an array of diff lines, got ${typeof allowed}`
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
        `Stale ${allowedName} line for ${policyName}, no longer present: ${line.slice(2)}`
      );
    }
  }

  return { mismatches: mismatches.length, stale };
}

// Diffs every entry Thunderbird and Firefox have in common and returns the
// ones not covered by `allowedList` (named `allowedName` in the logs). Entries
// named in `skipped` are ignored on both sides.
function findRealDifferences(
  tbirdEntries,
  browserEntries,
  allowedList,
  allowedName,
  skipped = []
) {
  const differences = {};
  const realDifferences = {};

  for (const name in tbirdEntries) {
    if (skipped.includes(name)) {
      continue;
    }
    if (!(name in browserEntries)) {
      info(`Skipping ${name}: Thunderbird specific`);
      continue;
    }
    const lines = diff(browserEntries[name], tbirdEntries[name]);
    if (lines.length) {
      differences[name] = lines;
    }
  }

  for (const name in allowedList) {
    if (!(name in tbirdEntries) || !(name in browserEntries)) {
      ok(
        false,
        `${name} listed in ${allowedName} but not common to both applications. Please fix.`
      );
    } else if (!(name in differences)) {
      ok(
        false,
        `${name} listed in ${allowedName} but identical to Firefox. Please remove the entry.`
      );
    }
  }

  for (const name in differences) {
    let stale = false;
    if (name in allowedList) {
      const result = checkAllowedDifferences(
        name,
        differences[name],
        allowedList,
        allowedName
      );
      if (!result.mismatches) {
        info(`Skipping ${name}: allowed differences.`);
        continue;
      }
      stale = result.stale;
    }

    info(
      `No differences allowed for ${name}:\n${differences[name].join("\n")}`
    );
    info(
      `To allow them, ${
        stale ? "update" : "add"
      } this entry to ${allowedName}:\n  ${JSON.stringify(
        name
      )}: ${JSON.stringify(differences[name], null, 2)},`
    );
    realDifferences[name] = differences[name];
  }

  return realDifferences;
}

// Returns the Firefox entries Thunderbird does not have and that are not
// listed in `allowedList` (named `allowedName` in the logs).
function findMissing(
  tbirdEntries,
  browserEntries,
  allowedList,
  allowedName,
  skipped = []
) {
  const missing = [];

  for (const name in browserEntries) {
    if (skipped.includes(name)) {
      continue;
    }
    if (allowedList.includes(name)) {
      if (name in tbirdEntries) {
        ok(
          false,
          `${name} listed in ${allowedName} but present in Thunderbird. Please fix.`
        );
      }

      info(`Skipping ${name}: Missing allowed`);
      continue;
    }
    if (!(name in tbirdEntries)) {
      missing.push(name);
    }
  }

  return missing;
}

add_task(function test_check_common_policies() {
  const realDifferences = findRealDifferences(
    getPolicyEntries(THUNDERBIRD_POLICIES_URL),
    getPolicyEntries(FIREFOX_POLICIES_URL),
    allowedPoliciesDifferences,
    "allowedPoliciesDifferences",
    ["_cleanup"]
  );

  Assert.equal(
    Object.keys(realDifferences).length,
    0,
    `Policies ${Object.keys(realDifferences)} differs from Firefox`
  );
});

add_task(function test_check_missing_policies() {
  const missing = findMissing(
    getPolicyEntries(THUNDERBIRD_POLICIES_URL),
    getPolicyEntries(FIREFOX_POLICIES_URL),
    allowedPoliciesMissing,
    "allowedPoliciesMissing",
    ["_cleanup"]
  );

  const missingStr = missing.map(m => `"${m}"`);
  Assert.equal(
    missing.length,
    0,
    `Browser Policies are missing: ${missingStr}`
  );
});

add_task(async function test_check_common_policies_schema() {
  const realDifferences = findRealDifferences(
    await getSchemaEntries(THUNDERBIRD_SCHEMA_URL),
    await getSchemaEntries(FIREFOX_SCHEMA_URL),
    allowedSchemaDifferences,
    "allowedSchemaDifferences"
  );

  Assert.equal(
    Object.keys(realDifferences).length,
    0,
    `Schema entries ${Object.keys(realDifferences)} differ from Firefox`
  );
});

add_task(async function test_check_missing_policies_schema() {
  const missing = findMissing(
    await getSchemaEntries(THUNDERBIRD_SCHEMA_URL),
    await getSchemaEntries(FIREFOX_SCHEMA_URL),
    allowedSchemaMissing,
    "allowedSchemaMissing"
  );

  const missingStr = missing.map(m => `"${m}"`);
  Assert.equal(
    missing.length,
    0,
    `Browser schema policies are missing: ${missingStr}`
  );
});
