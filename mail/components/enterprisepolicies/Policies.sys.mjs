/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gCertDB: ["@mozilla.org/security/x509certdb;1", Ci.nsIX509CertDB],
  gExternalProtocolService: [
    "@mozilla.org/uriloader/external-protocol-service;1",
    Ci.nsIExternalProtocolService,
  ],
  gMIMEService: ["@mozilla.org/mime;1", Ci.nsIMIMEService],
});

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  ProxyPolicies: "resource:///modules/policies/ProxyPolicies.sys.mjs",
  SearchService: "moz-src:///toolkit/components/search/SearchService.sys.mjs",

  PoliciesUtils: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  addAllowDenyPermissions: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  blockAboutPage: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  clearBlockedAboutPages: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  installAddonFromURL: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  pemToBase64: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  processMIMEInfo: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  replacePathVariables: "resource://gre/modules/PoliciesHelpers.sys.mjs",
  runOncePerModification: "resource://gre/modules/PoliciesHelpers.sys.mjs",
});

const PREF_LOGLEVEL = "browser.policies.loglevel";

const isXpcshell = Services.env.exists("XPCSHELL_TEST_PROFILE_DIR");

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "Policies",
    // tip: set maxLogLevel to "debug" and use log.debug() to create detailed
    // messages during development. See LOG_LEVELS in Console.sys.mjs for details.
    maxLogLevel: "Error",
    maxLogLevelPref: PREF_LOGLEVEL,
  });
});

/*
 * ============================
 * = POLICIES IMPLEMENTATIONS =
 * ============================
 *
 * The Policies object below is where the implementation for each policy
 * happens. An object for each policy should be defined, containing
 * callback functions that will be called by the engine.
 *
 * See the _callbacks object in EnterprisePolicies.js for the list of
 * possible callbacks and an explanation of each.
 *
 * Each callback will be called with two parameters:
 * - manager
 *   This is the EnterprisePoliciesManager singleton object from
 *   EnterprisePolicies.js
 *
 * - param
 *   The parameter defined for this policy in policies-schema.json.
 *   It will be different for each policy. It could be a boolean,
 *   a string, an array or a complex object. All parameters have
 *   been validated according to the schema, and no unknown
 *   properties will be present on them.
 *
 * The callbacks will be bound to their parent policy object.
 */
export var Policies = {
  // Used for cleaning up policies.
  // Use the same timing that you used for setting up the policy.
  _cleanup: {
    onBeforeAddons() {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onBeforeAddons");
        lazy.clearBlockedAboutPages();
      }
    },
    onProfileAfterChange() {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onProfileAfterChange");
      }
    },
    onBeforeUIStartup() {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onBeforeUIStartup");
      }
    },
    onAllWindowsRestored() {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onAllWindowsRestored");
      }
    },
  },

  "3rdparty": {
    onBeforeAddons(manager, param) {
      manager.setExtensionPolicies(param.Extensions);
    },
  },

  AppAutoUpdate: {
    onBeforeUIStartup(manager, param) {
      // Logic feels a bit reversed here, but it's correct. If AppAutoUpdate is
      // true, we disallow turning off auto updating, and visa versa.
      if (param) {
        manager.disallowFeature("app-auto-updates-off");
      } else {
        manager.disallowFeature("app-auto-updates-on");
      }
    },
  },

  AppUpdatePin: {
    validate(param) {
      // This is the version when pinning was introduced. Attempting to set a
      // pin before this will not work, because Balrog's pinning table will
      // never have the necessary entry.
      const earliestPinMajorVersion = 102;
      const earliestPinMinorVersion = 0;

      const pinParts = param.split(".");

      if (pinParts.length < 2) {
        lazy.log.error("AppUpdatePin has too few dots.");
        return false;
      }
      if (pinParts.length > 3) {
        lazy.log.error("AppUpdatePin has too many dots.");
        return false;
      }

      const trailingPinPart = pinParts.pop();
      if (trailingPinPart != "") {
        lazy.log.error("AppUpdatePin does not end with a trailing dot.");
        return false;
      }

      const pinMajorVersionStr = pinParts.shift();
      if (!pinMajorVersionStr.length) {
        lazy.log.error("AppUpdatePin's major version is empty.");
        return false;
      }
      if (!/^\d+$/.test(pinMajorVersionStr)) {
        lazy.log.error(
          "AppUpdatePin's major version contains a non-numeric character."
        );
        return false;
      }
      if (/^0/.test(pinMajorVersionStr)) {
        lazy.log.error("AppUpdatePin's major version contains a leading 0.");
        return false;
      }
      const pinMajorVersionInt = parseInt(pinMajorVersionStr, 10);
      if (isNaN(pinMajorVersionInt)) {
        lazy.log.error(
          "AppUpdatePin's major version could not be parsed to an integer."
        );
        return false;
      }
      if (pinMajorVersionInt < earliestPinMajorVersion) {
        lazy.log.error(
          `AppUpdatePin must not be earlier than '${earliestPinMajorVersion}.${earliestPinMinorVersion}.'.`
        );
        return false;
      }

      if (pinParts.length) {
        const pinMinorVersionStr = pinParts.shift();
        if (!pinMinorVersionStr.length) {
          lazy.log.error("AppUpdatePin's minor version is empty.");
          return false;
        }
        if (!/^\d+$/.test(pinMinorVersionStr)) {
          lazy.log.error(
            "AppUpdatePin's minor version contains a non-numeric character."
          );
          return false;
        }
        if (/^0\d/.test(pinMinorVersionStr)) {
          lazy.log.error("AppUpdatePin's minor version contains a leading 0.");
          return false;
        }
        const pinMinorVersionInt = parseInt(pinMinorVersionStr, 10);
        if (isNaN(pinMinorVersionInt)) {
          lazy.log.error(
            "AppUpdatePin's minor version could not be parsed to an integer."
          );
          return false;
        }
        if (
          pinMajorVersionInt == earliestPinMajorVersion &&
          pinMinorVersionInt < earliestPinMinorVersion
        ) {
          lazy.log.error(
            `AppUpdatePin must not be earlier than '${earliestPinMajorVersion}.${earliestPinMinorVersion}.'.`
          );
          return false;
        }
      }

      return true;
    },
    // No additional implementation needed here. UpdateService.sys.mjs will
    // check for this policy directly when determining the update URL.
  },

  AppUpdateURL: {
    // No implementation needed here. UpdateService.sys.mjs will check for this
    // policy directly when determining the update URL.
  },

  Authentication: {
    onBeforeAddons(manager, param) {
      let locked = true;
      if ("Locked" in param) {
        locked = param.Locked;
      }

      if ("SPNEGO" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.negotiate-auth.trusted-uris",
          param.SPNEGO.join(", "),
          locked
        );
      }
      if ("Delegated" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.negotiate-auth.delegation-uris",
          param.Delegated.join(", "),
          locked
        );
      }
      if ("NTLM" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.automatic-ntlm-auth.trusted-uris",
          param.NTLM.join(", "),
          locked
        );
      }
      if ("AllowNonFQDN" in param) {
        if ("NTLM" in param.AllowNonFQDN) {
          lazy.PoliciesUtils.setDefaultPref(
            "network.automatic-ntlm-auth.allow-non-fqdn",
            param.AllowNonFQDN.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowNonFQDN) {
          lazy.PoliciesUtils.setDefaultPref(
            "network.negotiate-auth.allow-non-fqdn",
            param.AllowNonFQDN.SPNEGO,
            locked
          );
        }
      }
      if ("AllowProxies" in param) {
        if ("NTLM" in param.AllowProxies) {
          lazy.PoliciesUtils.setDefaultPref(
            "network.automatic-ntlm-auth.allow-proxies",
            param.AllowProxies.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowProxies) {
          lazy.PoliciesUtils.setDefaultPref(
            "network.negotiate-auth.allow-proxies",
            param.AllowProxies.SPNEGO,
            locked
          );
        }
      }
      if ("PrivateBrowsing" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.auth.private-browsing-sso",
          param.PrivateBrowsing,
          locked
        );
      }
    },
  },

  BackgroundAppUpdate: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("app-background-update-off");
      } else {
        manager.disallowFeature("app-background-update-on");
      }
    },
  },

  BlockAboutAddons: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        lazy.blockAboutPage(manager, "about:addons", true);
      }
    },
  },

  BlockAboutConfig: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        lazy.blockAboutPage(manager, "about:config");
        lazy.PoliciesUtils.setAndLockPref("devtools.chrome.enabled", false);
      }
    },
  },

  BlockAboutProfiles: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        lazy.blockAboutPage(manager, "about:profiles");
      }
    },
  },

  BlockAboutSupport: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        lazy.blockAboutPage(manager, "about:support");
      }
    },
  },

  CaptivePortal: {
    onBeforeAddons(manager, param) {
      lazy.PoliciesUtils.setAndLockPref(
        "network.captive-portal-service.enabled",
        param
      );
    },
  },

  Certificates: {
    onBeforeAddons(manager, param) {
      if ("ImportEnterpriseRoots" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "security.enterprise_roots.enabled",
          param.ImportEnterpriseRoots
        );
      }
      if ("Install" in param) {
        (async () => {
          let dirs = [];
          const platform = AppConstants.platform;
          if (platform == "win") {
            dirs = [
              // Ugly, but there is no official way to get %USERNAME\AppData\Roaming\Mozilla.
              Services.dirsvc.get("XREUSysExt", Ci.nsIFile).parent,
              // Even more ugly, but there is no official way to get %USERNAME\AppData\Local\Mozilla.
              Services.dirsvc.get("DefProfLRt", Ci.nsIFile).parent.parent,
            ];
          } else if (platform == "macosx" || platform == "linux") {
            dirs = [
              // These two keys are named wrong. They return the Mozilla directory.
              Services.dirsvc.get("XREUserNativeManifests", Ci.nsIFile),
              Services.dirsvc.get("XRESysNativeManifests", Ci.nsIFile),
            ];
          }
          dirs.unshift(Services.dirsvc.get("XREAppDist", Ci.nsIFile));
          for (const certfilename of param.Install) {
            let certfile;
            try {
              certfile = Cc["@mozilla.org/file/local;1"].createInstance(
                Ci.nsIFile
              );
              certfile.initWithPath(certfilename);
            } catch (e) {
              for (const dir of dirs) {
                certfile = dir.clone();
                certfile.append(
                  platform == "linux" ? "certificates" : "Certificates"
                );
                certfile.append(certfilename);
                if (certfile.exists()) {
                  break;
                }
              }
            }
            let file;
            try {
              file = await File.createFromNsIFile(certfile);
            } catch (e) {
              lazy.log.error(`Unable to find certificate - ${certfilename}`);
              continue;
            }
            const reader = new FileReader();
            reader.onloadend = function () {
              if (reader.readyState != reader.DONE) {
                lazy.log.error(`Unable to read certificate - ${certfile.path}`);
                return;
              }
              const certFile = reader.result;
              const certFileArray = [];
              for (let i = 0; i < certFile.length; i++) {
                certFileArray.push(certFile.charCodeAt(i));
              }
              let cert;
              try {
                cert = lazy.gCertDB.constructX509(certFileArray);
              } catch (e) {
                lazy.log.debug(
                  `constructX509 failed with error '${e}' - trying constructX509FromBase64.`
                );
                try {
                  // It might be PEM instead of DER.
                  cert = lazy.gCertDB.constructX509FromBase64(
                    lazy.pemToBase64(certFile)
                  );
                } catch (ex) {
                  lazy.log.error(
                    `Unable to add certificate - ${certfile.path}`,
                    ex
                  );
                }
              }
              if (cert) {
                if (
                  lazy.gCertDB.isCertTrusted(
                    cert,
                    Ci.nsIX509Cert.CA_CERT,
                    Ci.nsIX509CertDB.TRUSTED_SSL
                  )
                ) {
                  // Certificate is already installed.
                  return;
                }
                try {
                  lazy.gCertDB.addCert(certFile, "CT,CT,");
                } catch (e) {
                  // It might be PEM instead of DER.
                  lazy.gCertDB.addCertFromBase64(
                    lazy.pemToBase64(certFile),
                    "CT,CT,"
                  );
                }
              }
            };
            reader.readAsBinaryString(file);
          }
        })();
      }
    },
  },

  Cookies: {
    onBeforeUIStartup(manager, param) {
      lazy.addAllowDenyPermissions("cookie", param.Allow, param.Block);

      if (param.Block) {
        const hosts = param.Block.map(url => url.hostname)
          .sort()
          .join("\n");
        lazy.runOncePerModification(
          "clearCookiesForBlockedHosts",
          hosts,
          () => {
            for (const blocked of param.Block) {
              Services.cookies.removeCookiesWithOriginAttributes(
                "{}",
                blocked.hostname
              );
            }
          }
        );
      }

      if (
        param.Default !== undefined ||
        param.AcceptThirdParty !== undefined ||
        param.Locked
      ) {
        const ACCEPT_COOKIES = 0;
        const REJECT_THIRD_PARTY_COOKIES = 1;
        const REJECT_ALL_COOKIES = 2;
        const REJECT_UNVISITED_THIRD_PARTY = 3;

        let newCookieBehavior = ACCEPT_COOKIES;
        if (param.Default !== undefined && !param.Default) {
          newCookieBehavior = REJECT_ALL_COOKIES;
        } else if (param.AcceptThirdParty) {
          if (param.AcceptThirdParty == "never") {
            newCookieBehavior = REJECT_THIRD_PARTY_COOKIES;
          } else if (param.AcceptThirdParty == "from-visited") {
            newCookieBehavior = REJECT_UNVISITED_THIRD_PARTY;
          }
        }

        lazy.PoliciesUtils.setDefaultPref(
          "network.cookie.cookieBehavior",
          newCookieBehavior,
          param.Locked
        );
        lazy.PoliciesUtils.setDefaultPref(
          "network.cookie.cookieBehavior.pbmode",
          newCookieBehavior,
          param.Locked
        );
      }

      if (param.ExpireAtSessionEnd != undefined) {
        lazy.log.error(
          "'ExpireAtSessionEnd' has been deprecated and it has no effect anymore."
        );
      }
    },
  },

  DefaultDownloadDirectory: {
    onBeforeAddons(manager, param) {
      lazy.PoliciesUtils.setDefaultPref(
        "browser.download.dir",
        lazy.replacePathVariables(param)
      );
      // If a custom download directory is being used, just lock folder list to 2.
      lazy.PoliciesUtils.setAndLockPref("browser.download.folderList", 2);
    },
  },

  DisableAppUpdate: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("appUpdate");
      }
    },
  },

  DisableBuiltinPDFViewer: {
    onBeforeAddons(manager, param) {
      if (param) {
        lazy.PoliciesUtils.setAndLockPref("pdfjs.disabled", true);
      }
    },
  },

  DisabledCiphers: {
    onBeforeAddons(manager, param) {
      const cipherPrefs = {
        TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256:
          "security.ssl3.ecdhe_rsa_aes_128_gcm_sha256",
        TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256:
          "security.ssl3.ecdhe_ecdsa_aes_128_gcm_sha256",
        TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256:
          "security.ssl3.ecdhe_ecdsa_chacha20_poly1305_sha256",
        TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256:
          "security.ssl3.ecdhe_rsa_chacha20_poly1305_sha256",
        TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384:
          "security.ssl3.ecdhe_ecdsa_aes_256_gcm_sha384",
        TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384:
          "security.ssl3.ecdhe_rsa_aes_256_gcm_sha384",
        TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA:
          "security.ssl3.ecdhe_rsa_aes_128_sha",
        TLS_ECDHE_ECDSA_WITH_AES_128_CBC_SHA:
          "security.ssl3.ecdhe_ecdsa_aes_128_sha",
        TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA:
          "security.ssl3.ecdhe_rsa_aes_256_sha",
        TLS_ECDHE_ECDSA_WITH_AES_256_CBC_SHA:
          "security.ssl3.ecdhe_ecdsa_aes_256_sha",
        TLS_DHE_RSA_WITH_AES_128_CBC_SHA: "security.ssl3.dhe_rsa_aes_128_sha",
        TLS_DHE_RSA_WITH_AES_256_CBC_SHA: "security.ssl3.dhe_rsa_aes_256_sha",
        TLS_RSA_WITH_AES_128_GCM_SHA256: "security.ssl3.rsa_aes_128_gcm_sha256",
        TLS_RSA_WITH_AES_256_GCM_SHA384: "security.ssl3.rsa_aes_256_gcm_sha384",
        TLS_RSA_WITH_AES_128_CBC_SHA: "security.ssl3.rsa_aes_128_sha",
        TLS_RSA_WITH_AES_256_CBC_SHA: "security.ssl3.rsa_aes_256_sha",
        TLS_RSA_WITH_3DES_EDE_CBC_SHA:
          "security.ssl3.deprecated.rsa_des_ede3_sha",
      };

      for (const cipher in param) {
        lazy.PoliciesUtils.setAndLockPref(cipherPrefs[cipher], !param[cipher]);
      }
    },
  },

  DisableDeveloperTools: {
    onBeforeAddons(manager, param) {
      if (param) {
        lazy.PoliciesUtils.setAndLockPref("devtools.policy.disabled", true);
        lazy.PoliciesUtils.setAndLockPref("devtools.chrome.enabled", false);

        manager.disallowFeature("devtools");
        lazy.blockAboutPage(manager, "about:debugging");
        lazy.blockAboutPage(manager, "about:devtools-toolbox");
      }
    },
  },

  DisableMasterPasswordCreation: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        manager.disallowFeature("createMasterPassword");
      }
    },
  },

  DisablePasswordReveal: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        manager.disallowFeature("passwordReveal");
      }
    },
  },

  DisableSafeMode: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        manager.disallowFeature("safeMode");
      }
    },
  },

  DisableSecurityBypass: {
    onBeforeUIStartup(manager, param) {
      if ("InvalidCertificate" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "security.certerror.hideAddException",
          param.InvalidCertificate
        );
      }

      if ("SafeBrowsing" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "browser.safebrowsing.allowOverride",
          !param.SafeBrowsing
        );
      }
    },
  },

  DisableSystemAddonUpdate: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("SysAddonUpdate");
      }
    },
  },

  DisableTelemetry: {
    onBeforeAddons(manager, param) {
      if (param) {
        lazy.PoliciesUtils.setAndLockPref(
          "datareporting.healthreport.uploadEnabled",
          false
        );
        lazy.PoliciesUtils.setAndLockPref(
          "datareporting.policy.dataSubmissionEnabled",
          false
        );
        lazy.PoliciesUtils.setAndLockPref(
          "toolkit.telemetry.archive.enabled",
          false
        );
        lazy.blockAboutPage(manager, "about:telemetry");
      }
    },
  },

  DNSOverHTTPS: {
    onBeforeAddons(manager, param) {
      let locked = false;
      if ("Locked" in param) {
        locked = param.Locked;
      }
      if ("Enabled" in param) {
        const mode = param.Enabled ? 2 : 5;
        lazy.PoliciesUtils.setDefaultPref("network.trr.mode", mode, locked);
      }
      if ("ProviderURL" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.trr.uri",
          param.ProviderURL.href,
          locked
        );
      }
      if ("ExcludedDomains" in param) {
        lazy.PoliciesUtils.setDefaultPref(
          "network.trr.excluded-domains",
          param.ExcludedDomains.join(","),
          locked
        );
      }
    },
  },

  DownloadDirectory: {
    onBeforeAddons(manager, param) {
      lazy.PoliciesUtils.setAndLockPref(
        "browser.download.dir",
        lazy.replacePathVariables(param)
      );
      // If a custom download directory is being used, just lock folder list to 2.
      lazy.PoliciesUtils.setAndLockPref("browser.download.folderList", 2);
      // Per Chrome spec, user can't choose to download every time
      // if this is set.
      lazy.PoliciesUtils.setAndLockPref(
        "browser.download.useDownloadDir",
        true
      );
    },
  },

  Extensions: {
    onBeforeUIStartup(manager, param) {
      let uninstallingPromise = Promise.resolve();
      if ("Uninstall" in param) {
        uninstallingPromise = lazy.runOncePerModification(
          "extensionsUninstall",
          JSON.stringify(param.Uninstall),
          async () => {
            // If we're uninstalling add-ons, re-run the extensionsInstall runOnce even if it hasn't
            // changed, which will allow add-ons to be updated.
            Services.prefs.clearUserPref(
              "browser.policies.runOncePerModification.extensionsInstall"
            );
            const addons = await lazy.AddonManager.getAddonsByIDs(
              param.Uninstall
            );
            for (const addon of addons) {
              if (addon) {
                try {
                  await addon.uninstall();
                } catch (e) {
                  // This can fail for add-ons that can't be uninstalled.
                  lazy.log.debug(
                    `Add-on ID (${addon.id}) couldn't be uninstalled.`
                  );
                }
              }
            }
          }
        );
      }
      if ("Install" in param) {
        lazy.runOncePerModification(
          "extensionsInstall",
          JSON.stringify(param.Install),
          async () => {
            await uninstallingPromise;
            for (const location of param.Install) {
              let uri;
              try {
                // We need to try as a file first because
                // Windows paths are valid URIs.
                // This is done for legacy support (old API)
                const xpiFile = new lazy.FileUtils.File(location);
                uri = Services.io.newFileURI(xpiFile);
              } catch (e) {
                uri = Services.io.newURI(location);
              }
              lazy.installAddonFromURL(uri.spec);
            }
          }
        );
      }
      if ("Locked" in param) {
        for (const ID of param.Locked) {
          manager.disallowFeature(`uninstall-extension:${ID}`);
          manager.disallowFeature(`disable-extension:${ID}`);
        }
      }
    },
  },

  ExtensionSettings: {
    onBeforeAddons(manager, param) {
      try {
        manager.setExtensionSettings(param);
      } catch (e) {
        lazy.log.error("Invalid ExtensionSettings");
      }
    },
    async onBeforeUIStartup(manager, param) {
      const extensionSettings = param;
      let blockAllExtensions = false;
      if ("*" in extensionSettings) {
        if (
          "installation_mode" in extensionSettings["*"] &&
          extensionSettings["*"].installation_mode == "blocked"
        ) {
          blockAllExtensions = true;
          // Turn off discovery pane in about:addons
          lazy.PoliciesUtils.setAndLockPref(
            "extensions.getAddons.showPane",
            false
          );
          // Turn off recommendations
          lazy.PoliciesUtils.setAndLockPref(
            "extensions.htmlaboutaddons.recommendations.enable",
            false
          );
          // Block about:debugging
          lazy.blockAboutPage(manager, "about:debugging");
        }
        if ("restricted_domains" in extensionSettings["*"]) {
          const restrictedDomains = Services.prefs
            .getCharPref("extensions.webextensions.restrictedDomains")
            .split(",");
          lazy.PoliciesUtils.setAndLockPref(
            "extensions.webextensions.restrictedDomains",
            restrictedDomains
              .concat(extensionSettings["*"].restricted_domains)
              .join(",")
          );
        }
      }
      const addons = await lazy.AddonManager.getAllAddons();
      const allowedExtensions = [];
      for (const extensionID in extensionSettings) {
        if (extensionID == "*") {
          // Ignore global settings
          continue;
        }
        if ("installation_mode" in extensionSettings[extensionID]) {
          if (
            extensionSettings[extensionID].installation_mode ==
              "force_installed" ||
            extensionSettings[extensionID].installation_mode ==
              "normal_installed"
          ) {
            if (!extensionSettings[extensionID].install_url) {
              throw new Error(`Missing install_url for ${extensionID}`);
            }
            lazy.installAddonFromURL(
              extensionSettings[extensionID].install_url,
              extensionID,
              addons.find(addon => addon.id == extensionID)
            );
            manager.disallowFeature(`uninstall-extension:${extensionID}`);
            if (
              extensionSettings[extensionID].installation_mode ==
              "force_installed"
            ) {
              manager.disallowFeature(`disable-extension:${extensionID}`);
            }
            allowedExtensions.push(extensionID);
          } else if (
            extensionSettings[extensionID].installation_mode == "allowed"
          ) {
            allowedExtensions.push(extensionID);
          } else if (
            extensionSettings[extensionID].installation_mode == "blocked"
          ) {
            if (addons.find(addon => addon.id == extensionID)) {
              // Can't use the addon from getActiveAddons since it doesn't have uninstall.
              const addon = await lazy.AddonManager.getAddonByID(extensionID);
              try {
                await addon.uninstall();
              } catch (e) {
                // This can fail for add-ons that can't be uninstalled.
                lazy.log.debug(
                  `Add-on ID (${addon.id}) couldn't be uninstalled.`
                );
              }
            }
          }
        }
      }
      if (blockAllExtensions) {
        for (const addon of addons) {
          if (
            addon.isSystem ||
            addon.isBuiltin ||
            !(addon.scope & lazy.AddonManager.SCOPE_PROFILE)
          ) {
            continue;
          }
          if (!allowedExtensions.includes(addon.id)) {
            try {
              // Can't use the addon from getActiveAddons since it doesn't have uninstall.
              const addonToUninstall = await lazy.AddonManager.getAddonByID(
                addon.id
              );
              await addonToUninstall.uninstall();
            } catch (e) {
              // This can fail for add-ons that can't be uninstalled.
              lazy.log.debug(
                `Add-on ID (${addon.id}) couldn't be uninstalled.`
              );
            }
          }
        }
      }
    },
  },

  ExtensionUpdate: {
    onBeforeAddons(manager, param) {
      if (!param) {
        lazy.PoliciesUtils.setAndLockPref("extensions.update.enabled", param);
      }
    },
  },

  Handlers: {
    onBeforeAddons(manager, param) {
      if ("mimeTypes" in param) {
        for (const mimeType in param.mimeTypes) {
          const mimeInfo = param.mimeTypes[mimeType];
          const realMIMEInfo = lazy.gMIMEService.getFromTypeAndExtension(
            mimeType,
            ""
          );
          lazy.processMIMEInfo(mimeInfo, realMIMEInfo);
        }
      }
      if ("extensions" in param) {
        for (const extension in param.extensions) {
          const mimeInfo = param.extensions[extension];
          try {
            const realMIMEInfo = lazy.gMIMEService.getFromTypeAndExtension(
              "",
              extension
            );
            lazy.processMIMEInfo(mimeInfo, realMIMEInfo);
          } catch (e) {
            lazy.log.error(`Invalid file extension (${extension})`);
          }
        }
      }
      if ("schemes" in param) {
        for (const scheme in param.schemes) {
          const handlerInfo = param.schemes[scheme];
          const realHandlerInfo =
            lazy.gExternalProtocolService.getProtocolHandlerInfo(scheme);
          lazy.processMIMEInfo(handlerInfo, realHandlerInfo);
        }
      }
    },
  },

  HardwareAcceleration: {
    onBeforeAddons(manager, param) {
      if (!param) {
        lazy.PoliciesUtils.setAndLockPref("layers.acceleration.disabled", true);
      }
    },
  },

  InAppNotification: {
    onBeforeUIStartup(manager, param) {
      if ("DonationEnabled" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "mail.inappnotifications.donation_enabled",
          param.DonationEnabled
        );
      }
      if ("SurveyEnabled" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "mail.inappnotifications.blog_enabled", // This is the type/pref for surveys, currently.
          param.SurveyEnabled
        );
      }
      if ("MessageEnabled" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "mail.inappnotifications.message_enabled",
          param.MessageEnabled
        );
      }
      if ("Disabled" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "mail.inappnotifications.enabled",
          !param.Disabled
        );
      }
    },
  },

  InstallAddonsPermission: {
    onBeforeUIStartup(manager, param) {
      if ("Allow" in param) {
        lazy.addAllowDenyPermissions("install", param.Allow, null);
      }
      if ("Default" in param) {
        lazy.PoliciesUtils.setAndLockPref("xpinstall.enabled", param.Default);
        if (!param.Default) {
          lazy.blockAboutPage(manager, "about:debugging");
          manager.disallowFeature("xpinstall");
        }
      }
    },
  },

  ManualAppUpdateOnly: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("autoAppUpdateChecking");
      }
    },
  },

  NetworkPrediction: {
    onBeforeAddons(manager, param) {
      lazy.PoliciesUtils.setAndLockPref("network.dns.disablePrefetch", !param);
      lazy.PoliciesUtils.setAndLockPref(
        "network.dns.disablePrefetchFromHTTPS",
        !param
      );
    },
  },

  OfferToSaveLogins: {
    onBeforeUIStartup(manager, param) {
      lazy.PoliciesUtils.setAndLockPref("signon.rememberSignons", param);
      lazy.PoliciesUtils.setAndLockPref(
        "services.passwordSavingEnabled",
        param
      );
    },
  },

  OfferToSaveLoginsDefault: {
    onBeforeUIStartup(manager, param) {
      const policies = Services.policies.getActivePolicies();
      if ("OfferToSaveLogins" in policies) {
        lazy.log.error(
          `OfferToSaveLoginsDefault ignored because OfferToSaveLogins is present.`
        );
      } else {
        lazy.PoliciesUtils.setDefaultPref("signon.rememberSignons", param);
      }
    },
  },

  PasswordManagerEnabled: {
    onBeforeUIStartup(manager, param) {
      if (!param) {
        lazy.blockAboutPage(manager, "about:logins", true);
        lazy.PoliciesUtils.setAndLockPref(
          "pref.privacy.disable_button.view_passwords",
          true
        );
      }
      lazy.PoliciesUtils.setAndLockPref("signon.rememberSignons", param);
    },
  },

  PDFjs: {
    onBeforeAddons(manager, param) {
      if ("Enabled" in param) {
        lazy.PoliciesUtils.setAndLockPref("pdfjs.disabled", !param.Enabled);
      }
      if ("EnablePermissions" in param) {
        lazy.PoliciesUtils.setAndLockPref(
          "pdfjs.enablePermissions",
          !param.Enabled
        );
      }
    },
  },

  Preferences: {
    onBeforeAddons(manager, param) {
      const allowedPrefixes = [
        "accessibility.",
        "app.update.",
        "browser.",
        "calendar.",
        "chat.",
        "datareporting.policy.",
        "dom.",
        "extensions.",
        "general.autoScroll",
        "general.smoothScroll",
        "geo.",
        "gfx.",
        "intl.",
        "layers.",
        "layout.",
        "mail.",
        "mailnews.",
        "media.",
        "network.",
        "pdfjs.",
        "places.",
        "print.",
        "signon.",
        "spellchecker.",
        "ui.",
        "widget.",
      ];
      const allowedSecurityPrefs = [
        "security.default_personal_cert",
        "security.insecure_connection_text.enabled",
        "security.insecure_connection_text.pbmode.enabled",
        "security.insecure_field_warning.contextual.enabled",
        "security.mixed_content.block_active_content",
        "security.osclientcerts.autoload",
        "security.ssl.errorReporting.enabled",
        "security.tls.hello_downgrade_check",
        "security.tls.version.enable-deprecated",
        "security.warn_submit_secure_to_insecure",
      ];
      const blockedPrefs = [
        "app.update.channel",
        "app.update.lastUpdateTime",
        "app.update.migrated",
      ];

      for (const preference in param) {
        if (blockedPrefs.includes(preference)) {
          lazy.log.error(
            `Unable to set preference ${preference}. Preference not allowed for security reasons.`
          );
          continue;
        }
        if (preference.startsWith("security.")) {
          if (!allowedSecurityPrefs.includes(preference)) {
            lazy.log.error(
              `Unable to set preference ${preference}. Preference not allowed for security reasons.`
            );
            continue;
          }
        } else if (
          !allowedPrefixes.some(prefix => preference.startsWith(prefix))
        ) {
          lazy.log.error(
            `Unable to set preference ${preference}. Preference not allowed for stability reasons.`
          );
          continue;
        }
        if (typeof param[preference] != "object") {
          // Legacy policy preferences
          lazy.PoliciesUtils.setAndLockPref(preference, param[preference]);
        } else {
          if (param[preference].Status == "clear") {
            Services.prefs.clearUserPref(preference);
            continue;
          }

          if (param[preference].Status == "user") {
            var prefBranch = Services.prefs;
          } else {
            prefBranch = Services.prefs.getDefaultBranch("");
          }

          try {
            switch (typeof param[preference].Value) {
              case "boolean":
                prefBranch.setBoolPref(preference, param[preference].Value);
                break;

              case "number":
                if (!Number.isInteger(param[preference].Value)) {
                  throw new Error(`Non-integer value for ${preference}`);
                }

                // This is ugly, but necessary. On Windows GPO and macOS
                // configs, booleans are converted to 0/1. In the previous
                // Preferences implementation, the schema took care of
                // automatically converting these values to booleans.
                // Since we allow arbitrary prefs now, we have to do
                // something different. See bug 1666836.
                if (
                  prefBranch.getPrefType(preference) == prefBranch.PREF_INT ||
                  ![0, 1].includes(param[preference].Value)
                ) {
                  prefBranch.setIntPref(preference, param[preference].Value);
                } else {
                  prefBranch.setBoolPref(preference, !!param[preference].Value);
                }
                break;

              case "string":
                prefBranch.setStringPref(preference, param[preference].Value);
                break;
            }
          } catch (e) {
            lazy.log.error(
              `Unable to set preference ${preference}. Probable type mismatch.`
            );
          }

          if (param[preference].Status == "locked") {
            Services.prefs.lockPref(preference);
          }
        }
      }
    },
  },

  PrimaryPassword: {
    onAllWindowsRestored(manager, param) {
      if (param) {
        manager.disallowFeature("removeMasterPassword");
      } else {
        manager.disallowFeature("createMasterPassword");
      }
    },
  },

  PromptForDownloadLocation: {
    onBeforeAddons(manager, param) {
      lazy.PoliciesUtils.setAndLockPref(
        "browser.download.useDownloadDir",
        !param
      );
    },
  },

  Proxy: {
    onBeforeAddons(manager, param) {
      if (param.Locked) {
        manager.disallowFeature("changeProxySettings");
        lazy.ProxyPolicies.configureProxySettings(
          param,
          lazy.PoliciesUtils.setAndLockPref
        );
      } else {
        lazy.ProxyPolicies.configureProxySettings(
          param,
          lazy.PoliciesUtils.setDefaultPref
        );
      }
    },
  },

  RequestedLocales: {
    onBeforeAddons(manager, param) {
      let requestedLocales;
      if (Array.isArray(param)) {
        requestedLocales = param;
      } else if (param) {
        requestedLocales = param.split(",");
      } else {
        requestedLocales = [];
      }
      lazy.runOncePerModification(
        "requestedLocales",
        JSON.stringify(requestedLocales),
        () => {
          Services.locale.requestedLocales = requestedLocales;
        }
      );
    },
  },

  SearchEngines: {
    onBeforeUIStartup(manager, param) {
      if (param.PreventInstalls) {
        manager.disallowFeature("installSearchEngine", true);
      }
    },
    onAllWindowsRestored(manager, param) {
      lazy.SearchService.init().then(async () => {
        // Adding of engines is handled by the SearchService in the init().
        // Remove can happen after those are added - no engines are allowed
        // to replace the application provided engines, even if they have been
        // removed.
        if (param.Remove) {
          // Only rerun if the list of engine names has changed.
          await lazy.runOncePerModification(
            "removeSearchEngines",
            JSON.stringify(param.Remove),
            async function () {
              for (const engineName of param.Remove) {
                const engine = lazy.SearchService.getEngineByName(engineName);
                if (engine) {
                  try {
                    await lazy.SearchService.removeEngine(engine);
                  } catch (ex) {
                    lazy.log.error("Unable to remove the search engine", ex);
                  }
                }
              }
            }
          );
        }
        if (param.Default) {
          await lazy.runOncePerModification(
            "setDefaultSearchEngine",
            param.Default,
            async () => {
              let defaultEngine;
              try {
                defaultEngine = lazy.SearchService.getEngineByName(
                  param.Default
                );
                if (!defaultEngine) {
                  throw new Error("No engine by that name could be found");
                }
              } catch (ex) {
                lazy.log.error(
                  `Search engine lookup failed when attempting to set ` +
                    `the default engine. Requested engine was ` +
                    `"${param.Default}".`,
                  ex
                );
              }
              if (defaultEngine) {
                try {
                  await lazy.SearchService.setDefault(
                    defaultEngine,
                    lazy.SearchService.CHANGE_REASON.ENTERPRISE
                  );
                } catch (ex) {
                  lazy.log.error("Unable to set the default search engine", ex);
                }
              }
            }
          );
        }
        if (param.DefaultPrivate) {
          await lazy.runOncePerModification(
            "setDefaultPrivateSearchEngine",
            param.DefaultPrivate,
            async () => {
              let defaultPrivateEngine;
              try {
                defaultPrivateEngine = lazy.SearchService.getEngineByName(
                  param.DefaultPrivate
                );
                if (!defaultPrivateEngine) {
                  throw new Error("No engine by that name could be found");
                }
              } catch (ex) {
                lazy.log.error(
                  `Search engine lookup failed when attempting to set ` +
                    `the default private engine. Requested engine was ` +
                    `"${param.DefaultPrivate}".`,
                  ex
                );
              }
              if (defaultPrivateEngine) {
                try {
                  await lazy.SearchService.setDefaultPrivate(
                    defaultPrivateEngine,
                    lazy.SearchService.CHANGE_REASON.ENTERPRISE
                  );
                } catch (ex) {
                  lazy.log.error(
                    "Unable to set the default private search engine",
                    ex
                  );
                }
              }
            }
          );
        }
      });
    },
  },

  SecurityDevices: {
    async _onProfileAfterChangeImpl(manager, param) {
      const pkcs11db = Cc["@mozilla.org/security/pkcs11moduledb;1"].getService(
        Ci.nsIPKCS11ModuleDB
      );

      let securityDevices;
      if (param.Add || param.Delete) {
        // We're using the new syntax.
        securityDevices = param.Add;
        if (param.Delete) {
          for (const deviceName of param.Delete) {
            try {
              await pkcs11db.deleteModule(deviceName);
            } catch (e) {
              // Ignoring errors here since it might stick around in policy
              // after removing. Alternative would be to listModules and
              // make sure it's there before removing, but that seems
              // like unnecessary work.
            }
          }
        }
      } else {
        securityDevices = param;
      }

      if (!securityDevices) {
        return;
      }

      for (const deviceName in securityDevices) {
        let foundModule = false;
        for (const module of await pkcs11db.listModules()) {
          if (module && module.libName === securityDevices[deviceName]) {
            foundModule = true;
            break;
          }
        }

        if (foundModule) {
          continue;
        }

        try {
          await pkcs11db.addModule(
            deviceName,
            securityDevices[deviceName],
            0,
            0
          );
        } catch (ex) {
          lazy.log.error(`Unable to add security device ${deviceName}`);
          lazy.log.debug(ex);
        }
      }
    },

    onProfileAfterChange(manager, param) {
      this._onProfileAfterChangeImpl(manager, param).catch(ex => {
        lazy.log.error("Unable to apply SecurityDevices policy", ex);
      });
    },
  },

  SSLVersionMax: {
    onBeforeAddons(manager, param) {
      let tlsVersion;
      switch (param) {
        case "tls1":
          tlsVersion = 1;
          break;
        case "tls1.1":
          tlsVersion = 2;
          break;
        case "tls1.2":
          tlsVersion = 3;
          break;
        case "tls1.3":
          tlsVersion = 4;
          break;
      }
      lazy.PoliciesUtils.setAndLockPref("security.tls.version.max", tlsVersion);
    },
  },

  SSLVersionMin: {
    onBeforeAddons(manager, param) {
      let tlsVersion;
      switch (param) {
        case "tls1":
          tlsVersion = 1;
          break;
        case "tls1.1":
          tlsVersion = 2;
          break;
        case "tls1.2":
          tlsVersion = 3;
          break;
        case "tls1.3":
          tlsVersion = 4;
          break;
      }
      lazy.PoliciesUtils.setAndLockPref("security.tls.version.min", tlsVersion);
    },
  },
};
