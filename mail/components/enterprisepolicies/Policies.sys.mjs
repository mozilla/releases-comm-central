/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

import { XPCOMUtils } from "resource://gre/modules/XPCOMUtils.sys.mjs";

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

const lazy = {};

XPCOMUtils.defineLazyServiceGetters(lazy, {
  gCertDB: ["@mozilla.org/security/x509certdb;1", "nsIX509CertDB"],
  gExternalProtocolService: [
    "@mozilla.org/uriloader/external-protocol-service;1",
    "nsIExternalProtocolService",
  ],
  gHandlerService: [
    "@mozilla.org/uriloader/handler-service;1",
    "nsIHandlerService",
  ],
  gMIMEService: ["@mozilla.org/mime;1", "nsIMIMEService"],
});

ChromeUtils.defineESModuleGetters(lazy, {
  AddonManager: "resource://gre/modules/AddonManager.sys.mjs",
  FileUtils: "resource://gre/modules/FileUtils.sys.mjs",
  ProxyPolicies: "resource:///modules/policies/ProxyPolicies.sys.mjs",
});

const PREF_LOGLEVEL = "browser.policies.loglevel";
const ABOUT_CONTRACT = "@mozilla.org/network/protocol/about;1?what=";

const isXpcshell = Services.env.exists("XPCSHELL_TEST_PROFILE_DIR");

ChromeUtils.defineLazyGetter(lazy, "log", () => {
  return console.createInstance({
    prefix: "Policies.jsm",
    // tip: set maxLogLevel to "debug" and use log.debug() to create detailed
    // messages during development. See LOG_LEVELS in Console.jsm for details.
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
    onBeforeAddons(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onBeforeAddons");
        clearBlockedAboutPages();
      }
    },
    onProfileAfterChange(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onProfileAfterChange");
      }
    },
    onBeforeUIStartup(manager) {
      if (Cu.isInAutomation || isXpcshell) {
        lazy.log.debug("_cleanup from onBeforeUIStartup");
      }
    },
    onAllWindowsRestored(manager) {
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
        PoliciesUtils.setDefaultPref(
          "network.negotiate-auth.trusted-uris",
          param.SPNEGO.join(", "),
          locked
        );
      }
      if ("Delegated" in param) {
        PoliciesUtils.setDefaultPref(
          "network.negotiate-auth.delegation-uris",
          param.Delegated.join(", "),
          locked
        );
      }
      if ("NTLM" in param) {
        PoliciesUtils.setDefaultPref(
          "network.automatic-ntlm-auth.trusted-uris",
          param.NTLM.join(", "),
          locked
        );
      }
      if ("AllowNonFQDN" in param) {
        if ("NTLM" in param.AllowNonFQDN) {
          PoliciesUtils.setDefaultPref(
            "network.automatic-ntlm-auth.allow-non-fqdn",
            param.AllowNonFQDN.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowNonFQDN) {
          PoliciesUtils.setDefaultPref(
            "network.negotiate-auth.allow-non-fqdn",
            param.AllowNonFQDN.SPNEGO,
            locked
          );
        }
      }
      if ("AllowProxies" in param) {
        if ("NTLM" in param.AllowProxies) {
          PoliciesUtils.setDefaultPref(
            "network.automatic-ntlm-auth.allow-proxies",
            param.AllowProxies.NTLM,
            locked
          );
        }
        if ("SPNEGO" in param.AllowProxies) {
          PoliciesUtils.setDefaultPref(
            "network.negotiate-auth.allow-proxies",
            param.AllowProxies.SPNEGO,
            locked
          );
        }
      }
      if ("PrivateBrowsing" in param) {
        PoliciesUtils.setDefaultPref(
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
                    pemToBase64(certFile)
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
                    pemToBase64(certFile),
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
      addAllowDenyPermissions("cookie", param.Allow, param.Block);

      if (param.Block) {
        const hosts = param.Block.map(url => url.hostname)
          .sort()
          .join("\n");
        runOncePerModification("clearCookiesForBlockedHosts", hosts, () => {
          for (const blocked of param.Block) {
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

        PoliciesUtils.setDefaultPref(
          "network.cookie.cookieBehavior",
          newCookieBehavior,
          param.Locked
        );
        PoliciesUtils.setDefaultPref(
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
      PoliciesUtils.setDefaultPref(
        "browser.download.dir",
        replacePathVariables(param)
      );
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

  DisableBuiltinPDFViewer: {
    onBeforeAddons(manager, param) {
      if (param) {
        setAndLockPref("pdfjs.disabled", true);
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
        setAndLockPref(cipherPrefs[cipher], !param[cipher]);
      }
    },
  },

  DisableDeveloperTools: {
    onBeforeAddons(manager, param) {
      if (param) {
        setAndLockPref("devtools.policy.disabled", true);
        setAndLockPref("devtools.chrome.enabled", false);

        manager.disallowFeature("devtools");
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
        setAndLockPref("toolkit.telemetry.archive.enabled", false);
        blockAboutPage(manager, "about:telemetry");
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
        PoliciesUtils.setDefaultPref("network.trr.mode", mode, locked);
      }
      if ("ProviderURL" in param) {
        PoliciesUtils.setDefaultPref(
          "network.trr.uri",
          param.ProviderURL.href,
          locked
        );
      }
      if ("ExcludedDomains" in param) {
        PoliciesUtils.setDefaultPref(
          "network.trr.excluded-domains",
          param.ExcludedDomains.join(","),
          locked
        );
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
        runOncePerModification(
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
              installAddonFromURL(uri.spec);
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
          const restrictedDomains = Services.prefs
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
        setAndLockPref("extensions.update.enabled", param);
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
          processMIMEInfo(mimeInfo, realMIMEInfo);
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
            processMIMEInfo(mimeInfo, realMIMEInfo);
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
          processMIMEInfo(handlerInfo, realHandlerInfo);
        }
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

  ManualAppUpdateOnly: {
    onBeforeAddons(manager, param) {
      if (param) {
        manager.disallowFeature("autoAppUpdateChecking");
      }
    },
  },

  NetworkPrediction: {
    onBeforeAddons(manager, param) {
      setAndLockPref("network.dns.disablePrefetch", !param);
      setAndLockPref("network.dns.disablePrefetchFromHTTPS", !param);
    },
  },

  OfferToSaveLogins: {
    onBeforeUIStartup(manager, param) {
      setAndLockPref("signon.rememberSignons", param);
      setAndLockPref("services.passwordSavingEnabled", param);
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
        PoliciesUtils.setDefaultPref("signon.rememberSignons", param);
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

  PDFjs: {
    onBeforeAddons(manager, param) {
      if ("Enabled" in param) {
        setAndLockPref("pdfjs.disabled", !param.Enabled);
      }
      if ("EnablePermissions" in param) {
        setAndLockPref("pdfjs.enablePermissions", !param.Enabled);
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
          setAndLockPref(preference, param[preference]);
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
      setAndLockPref("browser.download.useDownloadDir", !param);
    },
  },

  Proxy: {
    onBeforeAddons(manager, param) {
      if (param.Locked) {
        manager.disallowFeature("changeProxySettings");
        lazy.ProxyPolicies.configureProxySettings(param, setAndLockPref);
      } else {
        lazy.ProxyPolicies.configureProxySettings(
          param,
          PoliciesUtils.setDefaultPref
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
      runOncePerModification(
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
      Services.search.init().then(async () => {
        // Adding of engines is handled by the SearchService in the init().
        // Remove can happen after those are added - no engines are allowed
        // to replace the application provided engines, even if they have been
        // removed.
        if (param.Remove) {
          // Only rerun if the list of engine names has changed.
          await runOncePerModification(
            "removeSearchEngines",
            JSON.stringify(param.Remove),
            async function () {
              for (const engineName of param.Remove) {
                const engine = Services.search.getEngineByName(engineName);
                if (engine) {
                  try {
                    await Services.search.removeEngine(engine);
                  } catch (ex) {
                    lazy.log.error("Unable to remove the search engine", ex);
                  }
                }
              }
            }
          );
        }
        if (param.Default) {
          await runOncePerModification(
            "setDefaultSearchEngine",
            param.Default,
            async () => {
              let defaultEngine;
              try {
                defaultEngine = Services.search.getEngineByName(param.Default);
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
                  await Services.search.setDefault(
                    defaultEngine,
                    Ci.nsISearchService.CHANGE_REASON_ENTERPRISE
                  );
                } catch (ex) {
                  lazy.log.error("Unable to set the default search engine", ex);
                }
              }
            }
          );
        }
        if (param.DefaultPrivate) {
          await runOncePerModification(
            "setDefaultPrivateSearchEngine",
            param.DefaultPrivate,
            async () => {
              let defaultPrivateEngine;
              try {
                defaultPrivateEngine = Services.search.getEngineByName(
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
                  await Services.search.setDefaultPrivate(
                    defaultPrivateEngine,
                    Ci.nsISearchService.CHANGE_REASON_ENTERPRISE
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
export function setAndLockPref(prefName, prefValue) {
  PoliciesUtils.setDefaultPref(prefName, prefValue, true);
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
export var PoliciesUtils = {
  setDefaultPref(prefName, prefValue, locked = false) {
    if (Services.prefs.prefIsLocked(prefName)) {
      Services.prefs.unlockPref(prefName);
    }

    const defaults = Services.prefs.getDefaultBranch("");

    switch (typeof prefValue) {
      case "boolean":
        defaults.setBoolPref(prefName, prefValue);
        break;

      case "number":
        if (!Number.isInteger(prefValue)) {
          throw new Error(`Non-integer value for ${prefName}`);
        }

        // This is ugly, but necessary. On Windows GPO and macOS
        // configs, booleans are converted to 0/1. In the previous
        // Preferences implementation, the schema took care of
        // automatically converting these values to booleans.
        // Since we allow arbitrary prefs now, we have to do
        // something different. See bug 1666836.
        if (
          defaults.getPrefType(prefName) == defaults.PREF_INT ||
          ![0, 1].includes(prefValue)
        ) {
          defaults.setIntPref(prefName, prefValue);
        } else {
          defaults.setBoolPref(prefName, !!prefValue);
        }
        break;

      case "string":
        defaults.setStringPref(prefName, prefValue);
        break;
    }

    if (locked) {
      Services.prefs.lockPref(prefName);
    }
  },
};

/**
 * addAllowDenyPermissions
 *
 * Helper function to call the permissions manager (Services.perms.addFromPrincipal)
 * for two arrays of URLs.
 *
 * @param {string} permissionName
 *        The name of the permission to change
 * @param {Array} allowList
 *        The list of URLs to be set as ALLOW_ACTION for the chosen permission.
 * @param {Array} blockList
 *        The list of URLs to be set as DENY_ACTION for the chosen permission.
 */
function addAllowDenyPermissions(permissionName, allowList, blockList) {
  allowList = allowList || [];
  blockList = blockList || [];

  for (const origin of allowList) {
    try {
      Services.perms.addFromPrincipal(
        Services.scriptSecurityManager.createContentPrincipalFromOrigin(origin),
        permissionName,
        Ci.nsIPermissionManager.ALLOW_ACTION,
        Ci.nsIPermissionManager.EXPIRE_POLICY
      );
    } catch (ex) {
      lazy.log
        .error(`Added by default for ${permissionName} permission in the permission
      manager - ${origin.href}`);
    }
  }

  for (const origin of blockList) {
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
export function runOnce(actionName, callback) {
  const prefName = `browser.policies.runonce.${actionName}`;
  if (Services.prefs.getBoolPref(prefName, false)) {
    lazy.log.debug(
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
  const prefName = `browser.policies.runOncePerModification.${actionName}`;
  const oldPolicyValue = Services.prefs.getStringPref(prefName, undefined);
  if (policyValue === oldPolicyValue) {
    lazy.log.debug(
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
  const prefName = `browser.policies.runOncePerModification.${actionName}`;
  Services.prefs.clearUserPref(prefName);
}

function replacePathVariables(path) {
  if (path.includes("${home}")) {
    return path.replace(
      "${home}",
      Services.dirsvc.get("Home", Ci.nsIFile).path
    );
  }
  return path;
}

/**
 * installAddonFromURL
 *
 * Helper function that installs an addon from a URL
 * and verifies that the addon ID matches.
 */
function installAddonFromURL(url, extensionID, addon) {
  if (
    addon &&
    addon.sourceURI &&
    addon.sourceURI.spec == url &&
    !addon.sourceURI.schemeIs("file")
  ) {
    // It's the same addon, don't reinstall.
    return;
  }
  lazy.AddonManager.getInstallForURL(url, {
    telemetryInfo: { source: "enterprise-policy" },
  }).then(install => {
    if (install.addon && install.addon.appDisabled) {
      lazy.log.error(`Incompatible add-on - ${install.addon.id}`);
      install.cancel();
      return;
    }
    const listener = {
      /* eslint-disable-next-line no-shadow */
      onDownloadEnded: install => {
        // Install failed, error will be reported elsewhere.
        if (!install.addon) {
          return;
        }
        if (extensionID && install.addon.id != extensionID) {
          lazy.log.error(
            `Add-on downloaded from ${url} had unexpected id (got ${install.addon.id} expected ${extensionID})`
          );
          install.removeListener(listener);
          install.cancel();
        }
        if (install.addon.appDisabled) {
          lazy.log.error(`Incompatible add-on - ${url}`);
          install.removeListener(listener);
          install.cancel();
        }
        if (
          addon &&
          Services.vc.compare(addon.version, install.addon.version) == 0
        ) {
          lazy.log.debug(
            "Installation cancelled because versions are the same"
          );
          install.removeListener(listener);
          install.cancel();
        }
      },
      onDownloadFailed: () => {
        install.removeListener(listener);
        lazy.log.error(
          `Download failed - ${lazy.AddonManager.errorToString(
            install.error
          )} - ${url}`
        );
        clearRunOnceModification("extensionsInstall");
      },
      onInstallFailed: () => {
        install.removeListener(listener);
        lazy.log.error(
          `Installation failed - ${lazy.AddonManager.errorToString(
            install.error
          )} - {url}`
        );
      },
      /* eslint-disable-next-line no-shadow */
      onInstallEnded: (install, addon) => {
        if (addon.type == "theme") {
          addon.enable();
        }
        install.removeListener(listener);
        lazy.log.debug(`Installation succeeded - ${url}`);
      },
    };
    // If it's a local file install, onDownloadEnded is never called.
    // So we call it manually, to handle some error cases.
    if (url.startsWith("file:")) {
      listener.onDownloadEnded(install);
      if (install.state == lazy.AddonManager.STATE_CANCELLED) {
        return;
      }
    }
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
    const aboutModule = Cc[ABOUT_CONTRACT + feature.split(":")[1]].getService(
      Ci.nsIAboutModule
    );
    const chromeURL = aboutModule.getChromeURI(
      Services.io.newURI(feature)
    ).spec;
    gBlockedAboutPages.push(chromeURL);
  } catch (e) {
    // Some about pages don't have chrome URLS (compat)
  }
}

const ChromeURLBlockPolicy = {
  shouldLoad(contentLocation, loadInfo, mimeTypeGuess) {
    const contentType = loadInfo.externalContentPolicyType;
    if (
      (contentLocation.scheme != "chrome" &&
        contentLocation.scheme != "about") ||
      (contentType != Ci.nsIContentPolicy.TYPE_DOCUMENT &&
        contentType != Ci.nsIContentPolicy.TYPE_SUBDOCUMENT)
    ) {
      return Ci.nsIContentPolicy.ACCEPT;
    }
    if (
      gBlockedAboutPages.some(function (aboutPage) {
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
  createInstance(iid) {
    return this.QueryInterface(iid);
  },
};

function addChromeURLBlocker() {
  if (Cc[ChromeURLBlockPolicy.contractID]) {
    return;
  }

  const registrar = Components.manager.QueryInterface(Ci.nsIComponentRegistrar);
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

function processMIMEInfo(mimeInfo, realMIMEInfo) {
  if ("handlers" in mimeInfo) {
    let firstHandler = true;
    for (const handler of mimeInfo.handlers) {
      // handler can be null which means they don't
      // want a preferred handler.
      if (handler) {
        let handlerApp;
        if ("path" in handler) {
          try {
            const file = new lazy.FileUtils.File(handler.path);
            handlerApp = Cc[
              "@mozilla.org/uriloader/local-handler-app;1"
            ].createInstance(Ci.nsILocalHandlerApp);
            handlerApp.executable = file;
          } catch (ex) {
            lazy.log.error(
              `Unable to create handler executable (${handler.path})`
            );
            continue;
          }
        } else if ("uriTemplate" in handler) {
          const templateURL = new URL(handler.uriTemplate);
          if (templateURL.protocol != "https:") {
            lazy.log.error(
              `Web handler must be https (${handler.uriTemplate})`
            );
            continue;
          }
          if (
            !templateURL.pathname.includes("%s") &&
            !templateURL.search.includes("%s")
          ) {
            lazy.log.error(
              `Web handler must contain %s (${handler.uriTemplate})`
            );
            continue;
          }
          handlerApp = Cc[
            "@mozilla.org/uriloader/web-handler-app;1"
          ].createInstance(Ci.nsIWebHandlerApp);
          handlerApp.uriTemplate = handler.uriTemplate;
        } else {
          lazy.log.error("Invalid handler");
          continue;
        }
        if ("name" in handler) {
          handlerApp.name = handler.name;
        }
        realMIMEInfo.possibleApplicationHandlers.appendElement(handlerApp);
        if (firstHandler) {
          realMIMEInfo.preferredApplicationHandler = handlerApp;
        }
      }
      firstHandler = false;
    }
  }
  if ("action" in mimeInfo) {
    const action = realMIMEInfo[mimeInfo.action];
    if (
      action == realMIMEInfo.useHelperApp &&
      !realMIMEInfo.possibleApplicationHandlers.length
    ) {
      lazy.log.error("useHelperApp requires a handler");
      return;
    }
    realMIMEInfo.preferredAction = action;
  }
  if ("ask" in mimeInfo) {
    realMIMEInfo.alwaysAskBeforeHandling = mimeInfo.ask;
  }
  lazy.gHandlerService.store(realMIMEInfo);
}
