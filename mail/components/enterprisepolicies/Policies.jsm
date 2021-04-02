/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);
const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
const { AppConstants } = ChromeUtils.import(
  "resource://gre/modules/AppConstants.jsm"
);

XPCOMUtils.defineLazyServiceGetters(this, {
  gCertDB: ["@mozilla.org/security/x509certdb;1", "nsIX509CertDB"],
});

XPCOMUtils.defineLazyModuleGetters(this, {
  AddonManager: "resource://gre/modules/AddonManager.jsm",
  FileUtils: "resource://gre/modules/FileUtils.jsm",
  ProxyPolicies: "resource:///modules/policies/ProxyPolicies.jsm",
});

const PREF_LOGLEVEL = "browser.policies.loglevel";
const ABOUT_CONTRACT = "@mozilla.org/network/protocol/about;1?what=";

let env = Cc["@mozilla.org/process/environment;1"].getService(
  Ci.nsIEnvironment
);
const isXpcshell = env.exists("XPCSHELL_TEST_PROFILE_DIR");

XPCOMUtils.defineLazyGetter(this, "log", () => {
  let { ConsoleAPI } = ChromeUtils.import("resource://gre/modules/Console.jsm");
  return new ConsoleAPI({
    prefix: "Policies.jsm",
    // tip: set maxLogLevel to "debug" and use log.debug() to create detailed
    // messages during development. See LOG_LEVELS in Console.jsm for details.
    maxLogLevel: "error",
    maxLogLevelPref: PREF_LOGLEVEL,
  });
});

var EXPORTED_SYMBOLS = ["Policies"];

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
var Policies = {
  // Used for cleaning up policies.
  // Use the same timing that you used for setting up the policy.
  _cleanup: {
    onBeforeAddons(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        console.log("_cleanup from onBeforeAddons");
        clearBlockedAboutPages();
      }
    },
    onProfileAfterChange(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        console.log("_cleanup from onProfileAfterChange");
      }
    },
    onBeforeUIStartup(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        console.log("_cleanup from onBeforeUIStartup");
      }
    },
    onAllWindowsRestored(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        console.log("_cleanup from onAllWindowsRestored");
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

  AppUpdateURL: {
    onBeforeAddons(manager, param) {
      setDefaultPref("app.update.url", param.href);
    },
  },

  Authentication: {
    onBeforeAddons(manager, param) {
      let locked = true;
      if ("Locked" in param) {
        locked = param.Locked;
      }

      if ("SPNEGO" in param) {
        setDefaultPref(
          "network.negotiate-auth.trusted-uris",
          param.SPNEGO.join(", "),
          locked
        );
      }
      if ("Delegated" in param) {
        setDefaultPref(
          "network.negotiate-auth.delegation-uris",
          param.Delegated.join(", "),
          locked
        );
      }
      if ("NTLM" in param) {
        setDefaultPref(
          "network.automatic-ntlm-auth.trusted-uris",
          param.NTLM.join(", "),
          locked
        );
      }
      if ("AllowNonFQDN" in param) {
        if ("NTLM" in param.AllowNonFQDN) {
          setDefaultPref(
            "network.automatic-ntlm-auth.allow-non-fqdn",
            param.AllowNonFQDN.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowNonFQDN) {
          setDefaultPref(
            "network.negotiate-auth.allow-non-fqdn",
            param.AllowNonFQDN.SPNEGO,
            locked
          );
        }
      }
      if ("AllowProxies" in param) {
        if ("NTLM" in param.AllowProxies) {
          setDefaultPref(
            "network.automatic-ntlm-auth.allow-proxies",
            param.AllowProxies.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowProxies) {
          setDefaultPref(
            "network.negotiate-auth.allow-proxies",
            param.AllowProxies.SPNEGO,
            locked
          );
        }
      }
      if ("PrivateBrowsing" in param) {
        setDefaultPref(
          "network.auth.private-browsing-sso",
          param.PrivateBrowsing,
          locked
        );
      }
    },
  },

  BlockAboutAddons: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        blockAboutPage(manager, "about:addons", true);
      }
    },
  },

  BlockAboutConfig: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        blockAboutPage(manager, "about:config");
        setAndLockPref("devtools.chrome.enabled", false);
      }
    },
  },

  BlockAboutProfiles: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        blockAboutPage(manager, "about:profiles");
      }
    },
  },

  BlockAboutSupport: {
    onBeforeUIStartup(manager, param) {
      if (param) {
        blockAboutPage(manager, "about:support");
      }
    },
  },

  CaptivePortal: {
    onBeforeAddons(manager, param) {
      setAndLockPref("network.captive-portal-service.enabled", param);
    },
  },

  Certificates: {
    onBeforeAddons(manager, param) {
      if ("ImportEnterpriseRoots" in param) {
        setAndLockPref(
          "security.enterprise_roots.enabled",
          param.ImportEnterpriseRoots
        );
      }
      if ("Install" in param) {
        (async () => {
          let dirs = [];
          let platform = AppConstants.platform;
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
          for (let certfilename of param.Install) {
            let certfile;
            try {
              certfile = Cc["@mozilla.org/file/local;1"].createInstance(
                Ci.nsIFile
              );
              certfile.initWithPath(certfilename);
            } catch (e) {
              for (let dir of dirs) {
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
              log.error(`Unable to find certificate - ${certfilename}`);
              continue;
            }
            let reader = new FileReader();
            reader.onloadend = function() {
              if (reader.readyState != reader.DONE) {
                log.error(`Unable to read certificate - ${certfile.path}`);
                return;
              }
              let certFile = reader.result;
              let cert;
              try {
                cert = gCertDB.constructX509(certFile);
              } catch (e) {
                try {
                  // It might be PEM instead of DER.
                  cert = gCertDB.constructX509FromBase64(pemToBase64(certFile));
                } catch (ex) {
                  log.error(`Unable to add certificate - ${certfile.path}`);
                }
              }
              let now = Date.now() / 1000;
              if (cert) {
                gCertDB.asyncVerifyCertAtTime(
                  cert,
                  0x0008 /* certificateUsageSSLCA */,
                  0,
                  null,
                  now,
                  (aPRErrorCode, aVerifiedChain, aHasEVPolicy) => {
                    if (aPRErrorCode == Cr.NS_OK) {
                      // Certificate is already installed.
                      return;
                    }
                    try {
                      gCertDB.addCert(certFile, "CT,CT,");
                    } catch (e) {
                      // It might be PEM instead of DER.
                      gCertDB.addCertFromBase64(
                        pemToBase64(certFile),
                        "CT,CT,"
                      );
                    }
                  }
                );
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
      addAllowDenyPermissions("cookie", param.Allow, param.Block);

      if (param.Block) {
        const hosts = param.Block.map(url => url.hostname)
          .sort()
          .join("\n");
        runOncePerModification("clearCookiesForBlockedHosts", hosts, () => {
          for (let blocked of param.Block) {
            Services.cookies.removeCookiesWithOriginAttributes(
              "{}",
              blocked.hostname
            );
          }
        });
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

        setDefaultPref(
          "network.cookie.cookieBehavior",
          newCookieBehavior,
          param.Locked
        );
      }

      const KEEP_COOKIES_UNTIL_EXPIRATION = 0;
      const KEEP_COOKIES_UNTIL_END_OF_SESSION = 2;

      if (param.ExpireAtSessionEnd !== undefined || param.Locked) {
        let newLifetimePolicy = KEEP_COOKIES_UNTIL_EXPIRATION;
        if (param.ExpireAtSessionEnd) {
          newLifetimePolicy = KEEP_COOKIES_UNTIL_END_OF_SESSION;
        }

        setDefaultPref(
          "network.cookie.lifetimePolicy",
          newLifetimePolicy,
          param.Locked
        );
      }
    },
  },

  DefaultDownloadDirectory: {
    onBeforeAddons(manager, param) {
      setDefaultPref("browser.download.dir", replacePathVariables(param));
      // If a custom download directory is being used, just lock folder list to 2.
      setAndLockPref("browser.download.folderList", 2);
    },
  },

  DisableAppUpdate: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("appUpdate");
      }
    },
  },

  DisabledCiphers: {
    onBeforeAddons(manager, param) {
      if ("TLS_DHE_RSA_WITH_AES_128_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.dhe_rsa_aes_128_sha", false);
      }
      if ("TLS_DHE_RSA_WITH_AES_256_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.dhe_rsa_aes_256_sha", false);
      }
      if ("TLS_ECDHE_RSA_WITH_AES_128_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.ecdhe_rsa_aes_128_sha", false);
      }
      if ("TLS_ECDHE_RSA_WITH_AES_256_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.ecdhe_rsa_aes_256_sha", false);
      }
      if ("TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256" in param) {
        setAndLockPref("security.ssl3.ecdhe_rsa_aes_128_gcm_sha256", false);
      }
      if ("TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256" in param) {
        setAndLockPref("security.ssl3.ecdhe_ecdsa_aes_128_gcm_sha256", false);
      }
      if ("TLS_RSA_WITH_AES_128_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.rsa_aes_128_sha", false);
      }
      if ("TLS_RSA_WITH_AES_256_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.rsa_aes_256_sha", false);
      }
      if ("TLS_RSA_WITH_3DES_EDE_CBC_SHA" in param) {
        setAndLockPref("security.ssl3.rsa_des_ede3_sha", false);
      }
    },
  },

  DisableDeveloperTools: {
    onBeforeAddons(manager, param) {
      if (param) {
        setAndLockPref("devtools.policy.disabled", true);
        setAndLockPref("devtools.chrome.enabled", false);

        manager.disallowFeature("devtools");
        blockAboutPage(manager, "about:devtools");
        blockAboutPage(manager, "about:debugging");
        blockAboutPage(manager, "about:devtools-toolbox");
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
        setAndLockPref(
          "security.certerror.hideAddException",
          param.InvalidCertificate
        );
      }

      if ("SafeBrowsing" in param) {
        setAndLockPref(
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
        setAndLockPref("datareporting.healthreport.uploadEnabled", false);
        setAndLockPref("datareporting.policy.dataSubmissionEnabled", false);
        blockAboutPage(manager, "about:telemetry");
      }
    },
  },

  DownloadDirectory: {
    onBeforeAddons(manager, param) {
      setAndLockPref("browser.download.dir", replacePathVariables(param));
      // If a custom download directory is being used, just lock folder list to 2.
      setAndLockPref("browser.download.folderList", 2);
      // Per Chrome spec, user can't choose to download every time
      // if this is set.
      setAndLockPref("browser.download.useDownloadDir", true);
    },
  },

  Extensions: {
    onBeforeUIStartup(manager, param) {
      let uninstallingPromise = Promise.resolve();
      if ("Uninstall" in param) {
        uninstallingPromise = runOncePerModification(
          "extensionsUninstall",
          JSON.stringify(param.Uninstall),
          async () => {
            // If we're uninstalling add-ons, re-run the extensionsInstall runOnce even if it hasn't
            // changed, which will allow add-ons to be updated.
            Services.prefs.clearUserPref(
              "browser.policies.runOncePerModification.extensionsInstall"
            );
            let addons = await AddonManager.getAddonsByIDs(param.Uninstall);
            for (let addon of addons) {
              if (addon) {
                try {
                  await addon.uninstall();
                } catch (e) {
                  // This can fail for add-ons that can't be uninstalled.
                  log.debug(`Add-on ID (${addon.id}) couldn't be uninstalled.`);
                }
              }
            }
          }
        );
      }
      if ("Install" in param) {
        runOncePerModification(
          "extensionsInstall",
          JSON.stringify(param.Install),
          async () => {
            await uninstallingPromise;
            for (let location of param.Install) {
              let uri;
              try {
                uri = Services.io.newURI(location);
              } catch (e) {
                // If it's not a URL, it's probably a file path.
                // Assume location is a file path
                // This is done for legacy support (old API)
                try {
                  let xpiFile = new FileUtils.File(location);
                  uri = Services.io.newFileURI(xpiFile);
                } catch (ex) {
                  log.error(`Invalid extension path location - ${location}`);
                  return;
                }
              }
              installAddonFromURL(uri.spec);
            }
          }
        );
      }
      if ("Locked" in param) {
        for (let ID of param.Locked) {
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
        log.error("Invalid ExtensionSettings");
      }
    },
    async onBeforeUIStartup(manager, param) {
      let extensionSettings = param;
      let blockAllExtensions = false;
      if ("*" in extensionSettings) {
        if (
          "installation_mode" in extensionSettings["*"] &&
          extensionSettings["*"].installation_mode == "blocked"
        ) {
          blockAllExtensions = true;
          // Turn off discovery pane in about:addons
          setAndLockPref("extensions.getAddons.showPane", false);
          // Turn off recommendations
          setAndLockPref(
            "extensions.htmlaboutaddons.recommendations.enable",
            false
          );
          // Block about:debugging
          blockAboutPage(manager, "about:debugging");
        }
        if ("restricted_domains" in extensionSettings["*"]) {
          let restrictedDomains = Services.prefs
            .getCharPref("extensions.webextensions.restrictedDomains")
            .split(",");
          setAndLockPref(
            "extensions.webextensions.restrictedDomains",
            restrictedDomains
              .concat(extensionSettings["*"].restricted_domains)
              .join(",")
          );
        }
      }
      let addons = await AddonManager.getAllAddons();
      let allowedExtensions = [];
      for (let extensionID in extensionSettings) {
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
            installAddonFromURL(
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
              let addon = await AddonManager.getAddonByID(extensionID);
              try {
                await addon.uninstall();
              } catch (e) {
                // This can fail for add-ons that can't be uninstalled.
                log.debug(`Add-on ID (${addon.id}) couldn't be uninstalled.`);
              }
            }
          }
        }
      }
      if (blockAllExtensions) {
        for (let addon of addons) {
          if (
            addon.isSystem ||
            addon.isBuiltin ||
            !(addon.scope & AddonManager.SCOPE_PROFILE)
          ) {
            continue;
          }
          if (!allowedExtensions.includes(addon.id)) {
            try {
              // Can't use the addon from getActiveAddons since it doesn't have uninstall.
              let addonToUninstall = await AddonManager.getAddonByID(addon.id);
              await addonToUninstall.uninstall();
            } catch (e) {
              // This can fail for add-ons that can't be uninstalled.
              log.debug(`Add-on ID (${addon.id}) couldn't be uninstalled.`);
            }
          }
        }
      }
    },
  },

  ExtensionUpdate: {
    onBeforeAddons(manager, param) {
      if (!param) {
        setAndLockPref("extensions.update.enabled", param);
      }
    },
  },

  HardwareAcceleration: {
    onBeforeAddons(manager, param) {
      if (!param) {
        setAndLockPref("layers.acceleration.disabled", true);
      }
    },
  },

  InstallAddonsPermission: {
    onBeforeUIStartup(manager, param) {
      if ("Allow" in param) {
        addAllowDenyPermissions("install", param.Allow, null);
      }
      if ("Default" in param) {
        setAndLockPref("xpinstall.enabled", param.Default);
        if (!param.Default) {
          blockAboutPage(manager, "about:debugging");
          manager.disallowFeature("xpinstall");
        }
      }
    },
  },

  PasswordManagerEnabled: {
    onBeforeUIStartup(manager, param) {
      if (!param) {
        blockAboutPage(manager, "about:logins", true);
        setAndLockPref("pref.privacy.disable_button.view_passwords", true);
      }
      setAndLockPref("signon.rememberSignons", param);
    },
  },

  Preferences: {
    onBeforeAddons(manager, param) {
      for (let preference in param) {
        setAndLockPref(preference, param[preference]);
      }
    },
  },

  PromptForDownloadLocation: {
    onBeforeAddons(manager, param) {
      setAndLockPref("browser.download.useDownloadDir", !param);
    },
  },

  Proxy: {
    onBeforeAddons(manager, param) {
      if (param.Locked) {
        manager.disallowFeature("changeProxySettings");
        ProxyPolicies.configureProxySettings(param, setAndLockPref);
      } else {
        ProxyPolicies.configureProxySettings(param, setDefaultPref);
      }
    },
  },

  RequestedLocales: {
    onBeforeAddons(manager, param) {
      if (Array.isArray(param)) {
        Services.locale.requestedLocales = param;
      } else {
        Services.locale.requestedLocales = param.split(",");
      }
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
      setAndLockPref("security.tls.version.max", tlsVersion);
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
      setAndLockPref("security.tls.version.min", tlsVersion);
    },
  },
};

/*
 * ====================
 * = HELPER FUNCTIONS =
 * ====================
 *
 * The functions below are helpers to be used by several policies.
 */

/**
 * setAndLockPref
 *
 * Sets the _default_ value of a pref, and locks it (meaning that
 * the default value will always be returned, independent from what
 * is stored as the user value).
 * The value is only changed in memory, and not stored to disk.
 *
 * @param {string} prefName
 *        The pref to be changed
 * @param {boolean,number,string} prefValue
 *        The value to set and lock
 */
function setAndLockPref(prefName, prefValue) {
  setDefaultPref(prefName, prefValue, true);
}

/**
 * setDefaultPref
 *
 * Sets the _default_ value of a pref and optionally locks it.
 * The value is only changed in memory, and not stored to disk.
 *
 * @param {string} prefName
 *        The pref to be changed
 * @param {boolean,number,string} prefValue
 *        The value to set
 * @param {boolean} locked
 *        Optionally lock the pref
 */
function setDefaultPref(prefName, prefValue, locked = false) {
  if (Services.prefs.prefIsLocked(prefName)) {
    Services.prefs.unlockPref(prefName);
  }

  let defaults = Services.prefs.getDefaultBranch("");

  switch (typeof prefValue) {
    case "boolean":
      defaults.setBoolPref(prefName, prefValue);
      break;

    case "number":
      if (!Number.isInteger(prefValue)) {
        throw new Error(`Non-integer value for ${prefName}`);
      }

      defaults.setIntPref(prefName, prefValue);
      break;

    case "string":
      defaults.setStringPref(prefName, prefValue);
      break;
  }

  if (locked) {
    Services.prefs.lockPref(prefName);
  }
}

/**
 * addAllowDenyPermissions
 *
 * Helper function to call the permissions manager (Services.perms.add)
 * for two arrays of URLs.
 *
 * @param {string} permissionName
 *        The name of the permission to change
 * @param {array} allowList
 *        The list of URLs to be set as ALLOW_ACTION for the chosen permission.
 * @param {array} blockList
 *        The list of URLs to be set as DENY_ACTION for the chosen permission.
 */
function addAllowDenyPermissions(permissionName, allowList, blockList) {
  allowList = allowList || [];
  blockList = blockList || [];

  for (let origin of allowList) {
    try {
      Services.perms.addFromPrincipal(
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
        permissionName,
        Ci.nsIPermissionManager.ALLOW_ACTION,
        Ci.nsIPermissionManager.EXPIRE_POLICY
      );
    } catch (ex) {
      log.error(`Added by default for ${permissionName} permission in the permission
      manager - ${origin.href}`);
    }
  }

  for (let origin of blockList) {
    Services.perms.addFromPrincipal(
      Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
      permissionName,
      Ci.nsIPermissionManager.DENY_ACTION,
      Ci.nsIPermissionManager.EXPIRE_POLICY
    );
  }
}

/**
 * runOnce
 *
 * Helper function to run a callback only once per policy.
 *
 * @param {string} actionName
 *        A given name which will be used to track if this callback has run.
 * @param {Function} callback
 *        The callback to run only once.
 */
// eslint-disable-next-line no-unused-vars
function runOnce(actionName, callback) {
  let prefName = `browser.policies.runonce.${actionName}`;
  if (Services.prefs.getBoolPref(prefName, false)) {
    log.debug(
      `Not running action ${actionName} again because it has already run.`
    );
    return;
  }
  Services.prefs.setBoolPref(prefName, true);
  callback();
}

/**
 * runOncePerModification
 *
 * Helper function similar to runOnce. The difference is that runOnce runs the
 * callback once when the policy is set, then never again.
 * runOncePerModification runs the callback once each time the policy value
 * changes from its previous value.
 * If the callback that was passed is an async function, you can await on this
 * function to await for the callback.
 *
 * @param {string} actionName
 *        A given name which will be used to track if this callback has run.
 *        This string will be part of a pref name.
 * @param {string} policyValue
 *        The current value of the policy. This will be compared to previous
 *        values given to this function to determine if the policy value has
 *        changed. Regardless of the data type of the policy, this must be a
 *        string.
 * @param {Function} callback
 *        The callback to be run when the pref value changes
 * @returns Promise
 *        A promise that will resolve once the callback finishes running.
 *
 */
async function runOncePerModification(actionName, policyValue, callback) {
  let prefName = `browser.policies.runOncePerModification.${actionName}`;
  let oldPolicyValue = Services.prefs.getStringPref(prefName, undefined);
  if (policyValue === oldPolicyValue) {
    log.debug(
      `Not running action ${actionName} again because the policy's value is unchanged`
    );
    return Promise.resolve();
  }
  Services.prefs.setStringPref(prefName, policyValue);
  return callback();
}

/**
 * clearRunOnceModification
 *
 * Helper function that clears a runOnce policy.
 */
function clearRunOnceModification(actionName) {
  let prefName = `browser.policies.runOncePerModification.${actionName}`;
  Services.prefs.clearUserPref(prefName);
}

function replacePathVariables(path) {
  if (path.includes("${home}")) {
    return path.replace("${home}", FileUtils.getFile("Home", []).path);
  }
  return path;
}

/**
 * installAddonFromURL
 *
 * Helper function that installs an addon from a URL
 * and verifies that the addon ID matches.
 */
function installAddonFromURL(url, extensionID) {
  AddonManager.getInstallForURL(url, {
    telemetryInfo: { source: "enterprise-policy" },
  }).then(install => {
    if (install.addon && install.addon.appDisabled) {
      log.error(`Incompatible add-on - ${location}`);
      install.cancel();
      return;
    }
    let listener = {
      /* eslint-disable-next-line no-shadow */
      onDownloadEnded: install => {
        if (extensionID && install.addon.id != extensionID) {
          log.error(
            `Add-on downloaded from ${url} had unexpected id (got ${install.addon.id} expected ${extensionID})`
          );
          install.removeListener(listener);
          install.cancel();
        }
        if (install.addon && install.addon.appDisabled) {
          log.error(`Incompatible add-on - ${url}`);
          install.removeListener(listener);
          install.cancel();
        }
      },
      onDownloadFailed: () => {
        install.removeListener(listener);
        log.error(`Download failed - ${url}`);
        clearRunOnceModification("extensionsInstall");
      },
      onInstallFailed: () => {
        install.removeListener(listener);
        log.error(`Installation failed - ${url}`);
      },
      onInstallEnded: () => {
        install.removeListener(listener);
        log.debug(`Installation succeeded - ${url}`);
      },
    };
    install.addListener(listener);
    install.install();
  });
}

let gBlockedAboutPages = [];

function clearBlockedAboutPages() {
  gBlockedAboutPages = [];
}

function blockAboutPage(manager, feature, neededOnContentProcess = false) {
  addChromeURLBlocker();
  gBlockedAboutPages.push(feature);

  try {
    let aboutModule = Cc[ABOUT_CONTRACT + feature.split(":")[1]].getService(
      Ci.nsIAboutModule
    );
    let chromeURL = aboutModule.getChromeURI(Services.io.newURI(feature)).spec;
    gBlockedAboutPages.push(chromeURL);
  } catch (e) {
    // Some about pages don't have chrome URLS (compat)
  }
}

let ChromeURLBlockPolicy = {
  shouldLoad(contentLocation, loadInfo, mimeTypeGuess) {
    let contentType = loadInfo.externalContentPolicyType;
    if (
      (contentLocation.scheme != "chrome" &&
        contentLocation.scheme != "about") ||
      (contentType != Ci.nsIContentPolicy.TYPE_DOCUMENT &&
        contentType != Ci.nsIContentPolicy.TYPE_SUBDOCUMENT)
    ) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    if (
      gBlockedAboutPages.some(function(aboutPage) {
        return contentLocation.spec.startsWith(aboutPage);
      })
    ) {
      return Ci.nsIContentPolicy.REJECT_POLICY;
    }
    return Ci.nsIContentPolicy.ACCEPT;
  },
  shouldProcess(contentLocation, loadInfo, mimeTypeGuess) {
    return Ci.nsIContentPolicy.ACCEPT;
  },
  classDescription: "Policy Engine Content Policy",
  contractID: "@mozilla-org/policy-engine-content-policy-service;1",
  classID: Components.ID("{ba7b9118-cabc-4845-8b26-4215d2a59ed7}"),
  QueryInterface: ChromeUtils.generateQI(["nsIContentPolicy"]),
  createInstance(outer, iid) {
    return this.QueryInterface(iid);
  },
};

function addChromeURLBlocker() {
  if (Cc[ChromeURLBlockPolicy.contractID]) {
    return;
  }

  let registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
  registrar.registerFactory(
    ChromeURLBlockPolicy.classID,
    ChromeURLBlockPolicy.classDescription,
    ChromeURLBlockPolicy.contractID,
    ChromeURLBlockPolicy
  );

  Services.catMan.addCategoryEntry(
    "content-policy",
    ChromeURLBlockPolicy.contractID,
    ChromeURLBlockPolicy.contractID,
    false,
    true
  );
}

function pemToBase64(pem) {
  return pem
    .replace(/(.*)-----BEGIN CERTIFICATE-----/, "")
    .replace(/-----END CERTIFICATE-----(.*)/, "")
    .replace(/[\r\n]/g, "");
}
