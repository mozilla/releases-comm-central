/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* This file is a copy of mozilla/toolkit/content/aboutSupport.js with
   modifications for TB. */

/* globals AboutSupportPlatform, populateAccountsSection, sendViaEmail
    populateCalendarsSection, populateChatSection, populateLibrarySection */

"use strict";

var { XPCOMUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/XPCOMUtils.sys.mjs"
);
var { Troubleshoot } = ChromeUtils.importESModule(
  "resource://gre/modules/Troubleshoot.sys.mjs"
);
var { ResetProfile } = ChromeUtils.importESModule(
  "resource://gre/modules/ResetProfile.sys.mjs"
);
var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  DownloadUtils: "resource://gre/modules/DownloadUtils.sys.mjs",
  PlacesDBUtils: "resource://gre/modules/PlacesDBUtils.sys.mjs",
  PluralForm: "resource:///modules/PluralForm.sys.mjs",
  ProcessType: "resource://gre/modules/ProcessType.sys.mjs",
});

// added for TB
/* Node classes. All of these are mutually exclusive. */

// Any nodes marked with this class will be considered part of the UI only,
// and therefore will not be copied.
var CLASS_DATA_UIONLY = "data-uionly";

// Any nodes marked with this class will be considered private and will be
// hidden if the user requests only public data to be shown or copied.
var CLASS_DATA_PRIVATE = "data-private";

// Any nodes marked with this class will only be displayed when the user chooses
// to not display private data.
var CLASS_DATA_PUBLIC = "data-public";
// end of TB addition
window.addEventListener("load", function onload() {
  try {
    window.removeEventListener("load", onload);
    Troubleshoot.snapshot().then(async snapshot => {
      for (const prop in snapshotFormatters) {
        try {
          await snapshotFormatters[prop](snapshot[prop]);
        } catch (e) {
          console.error(
            "stack of snapshot error for about:support: ",
            e,
            ": ",
            e.stack
          );
        }
      }
    }, console.error);
    populateActionBox();
    setupEventListeners();

    let hasWinPackageId = false;
    try {
      hasWinPackageId = Services.sysinfo.getProperty("hasWinPackageId");
    } catch (_ex) {
      // The hasWinPackageId property doesn't exist; assume it would be false.
    }
    if (hasWinPackageId) {
      $("update-dir-row").hidden = true;
      $("update-history-row").hidden = true;
    }
  } catch (e) {
    console.error(
      "stack of load error for about:support: " + e + ": " + e.stack
    );
  }
  // added for TB
  populateAccountsSection();
  populateCalendarsSection();
  populateChatSection();
  populateLibrarySection();
  document
    .getElementById("check-show-private-data")
    .addEventListener("change", () => onShowPrivateDataChange());
});

function prefsTable(data) {
  return sortedArrayFromObject(data).map(function ([name, value]) {
    return $.new("tr", [
      $.new("td", name, "pref-name"),
      // Very long preference values can cause users problems when they
      // copy and paste them into some text editors.  Long values generally
      // aren't useful anyway, so truncate them to a reasonable length.
      $.new("td", String(value).substr(0, 120), "pref-value"),
    ]);
  });
}

// Fluent uses lisp-case IDs so this converts
// the SentenceCase info IDs to lisp-case.
const FLUENT_IDENT_REGEX = /^[a-zA-Z][a-zA-Z0-9_-]*$/;
function toFluentID(str) {
  if (!FLUENT_IDENT_REGEX.test(str)) {
    return null;
  }
  return str
    .toString()
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase();
}

// Each property in this object corresponds to a property in Troubleshoot.sys.mjs's
// snapshot data.  Each function is passed its property's corresponding data,
// and it's the function's job to update the page with it.
var snapshotFormatters = {
  async application(data) {
    $("application-box").textContent = data.name;
    $("useragent-box").textContent = data.userAgent;
    $("os-box").textContent = data.osVersion;
    if (data.osTheme) {
      $("os-theme-box").textContent = data.osTheme;
    } else {
      $("os-theme-row").hidden = true;
    }
    if (AppConstants.platform == "macosx") {
      $("rosetta-box").textContent = data.rosetta;
    }
    $("binary-box").textContent = Services.dirsvc.get(
      "XREExeF",
      Ci.nsIFile
    ).path;
    $("supportLink").href = data.supportURL;
    let version = AppConstants.MOZ_APP_VERSION_DISPLAY;
    if (data.vendor) {
      version += " (" + data.vendor + ")";
    }
    $("version-box").textContent = version;
    $("buildid-box").textContent = data.buildID;
    $("distributionid-box").textContent = data.distributionID;
    if (data.updateChannel) {
      $("updatechannel-box").textContent = data.updateChannel;
    }
    if (AppConstants.MOZ_UPDATER) {
      $("update-dir-box").textContent = Services.dirsvc.get(
        "UpdRootD",
        Ci.nsIFile
      ).path;
    }

    try {
      let launcherStatusTextId = "launcher-process-status-unknown";
      switch (data.launcherProcessState) {
        case 0:
        case 1:
        case 2:
          launcherStatusTextId =
            "launcher-process-status-" + data.launcherProcessState;
          break;
      }

      document.l10n.setAttributes(
        $("launcher-process-box"),
        launcherStatusTextId
      );
    } catch (e) {}

    const STATUS_STRINGS = {
      disabledByE10sEnv: "fission-status-disabled-by-e10s-env",
      enabledByEnv: "fission-status-enabled-by-env",
      enabledByDefault: "fission-status-enabled-by-default",
      disabledByDefault: "fission-status-disabled-by-default",
      enabledByUserPref: "fission-status-enabled-by-user-pref",
      disabledByUserPref: "fission-status-disabled-by-user-pref",
      disabledByE10sOther: "fission-status-disabled-by-e10s-other",
    };

    const statusTextId = STATUS_STRINGS[data.fissionDecisionStatus];

    document.l10n.setAttributes(
      $("multiprocess-box-process-count"),
      "multi-process-windows",
      {
        remoteWindows: data.numRemoteWindows,
        totalWindows: data.numTotalWindows,
      }
    );
    document.l10n.setAttributes(
      $("fission-box-process-count"),
      "fission-windows",
      {
        fissionWindows: data.numFissionWindows,
        totalWindows: data.numTotalWindows,
      }
    );
    document.l10n.setAttributes($("fission-box-status"), statusTextId);

    if (Services.policies) {
      let policiesStrId = "";
      let aboutPolicies = "about:policies";
      switch (data.policiesStatus) {
        case Services.policies.INACTIVE:
          policiesStrId = "policies-inactive";
          break;

        case Services.policies.ACTIVE:
          policiesStrId = "policies-active";
          aboutPolicies += "#active";
          break;

        default:
          policiesStrId = "policies-error";
          aboutPolicies += "#errors";
          break;
      }

      if (data.policiesStatus != Services.policies.INACTIVE) {
        const activePolicies = $.new("a", null, null, {
          href: aboutPolicies,
        });
        document.l10n.setAttributes(activePolicies, policiesStrId);
        $("policies-status").appendChild(activePolicies);
      } else {
        document.l10n.setAttributes($("policies-status"), policiesStrId);
      }
    } else {
      $("policies-status-row").hidden = true;
    }

    const keyLocationServiceGoogleFound = data.keyLocationServiceGoogleFound
      ? "found"
      : "missing";
    document.l10n.setAttributes(
      $("key-location-service-google-box"),
      keyLocationServiceGoogleFound
    );

    const keySafebrowsingGoogleFound = data.keySafebrowsingGoogleFound
      ? "found"
      : "missing";
    document.l10n.setAttributes(
      $("key-safebrowsing-google-box"),
      keySafebrowsingGoogleFound
    );

    const keyMozillaFound = data.keyMozillaFound ? "found" : "missing";
    document.l10n.setAttributes($("key-mozilla-box"), keyMozillaFound);

    $("safemode-box").textContent = data.safeMode;

    const formatHumanReadableBytes = (elem, bytes) => {
      const size = DownloadUtils.convertByteUnits(bytes);
      document.l10n.setAttributes(elem, "app-basics-data-size", {
        value: size[0],
        unit: size[1],
      });
    };

    formatHumanReadableBytes($("memory-size-box"), data.memorySizeBytes);
    formatHumanReadableBytes($("disk-available-box"), data.diskAvailableBytes);

    // added for TB
    // Add profile path as private info into the page.
    const currProfD = Services.dirsvc.get("ProfD", Ci.nsIFile);
    const profElem = document.getElementById("profile-dir-button").parentNode;
    const profDirNode = document.getElementById("profile-dir-box");
    profDirNode.setAttribute("class", CLASS_DATA_PRIVATE);
    const profLinkNode = document.createElement("a");
    profLinkNode.setAttribute("href", Services.io.newFileURI(currProfD).spec);
    profLinkNode.addEventListener("click", function (event) {
      openProfileDirectory();
      event.preventDefault();
    });
    const profPathNode = document.createTextNode(currProfD.path);
    profLinkNode.appendChild(profPathNode);
    profDirNode.appendChild(profLinkNode);
    profElem.appendChild(document.createTextNode(" "));

    // Show type of filesystem detected.
    let fsType;
    try {
      fsType = AboutSupportPlatform.getFileSystemType(currProfD);
      if (fsType) {
        const bundle = Services.strings.createBundle(
          "chrome://messenger/locale/aboutSupportMail.properties"
        );
        const fsText = bundle.GetStringFromName("fsType." + fsType);
        const fsTextNode = document.createElement("span");
        fsTextNode.textContent = fsText;
        profElem.appendChild(fsTextNode);
      }
    } catch (x) {
      console.error(x);
    }
    // end of TB addition
  },

  async legacyUserStylesheets(legacyUserStylesheets) {
    $("legacyUserStylesheets-enabled").textContent =
      legacyUserStylesheets.active;
    $("legacyUserStylesheets-types").textContent =
      new Intl.ListFormat(undefined, { style: "short", type: "unit" }).format(
        legacyUserStylesheets.types
      ) ||
      document.l10n.setAttributes(
        $("legacyUserStylesheets-types"),
        "legacy-user-stylesheets-no-stylesheets-found"
      );
  },

  crashes(data) {
    if (!AppConstants.MOZ_CRASHREPORTER) {
      return;
    }

    const daysRange = Troubleshoot.kMaxCrashAge / (24 * 60 * 60 * 1000);
    document.l10n.setAttributes($("crashes-title"), "report-crash-for-days", {
      days: daysRange,
    });
    let reportURL;
    try {
      reportURL = Services.prefs.getCharPref("breakpad.reportURL");
      // Ignore any non http/https urls
      if (!/^https?:/i.test(reportURL)) {
        reportURL = null;
      }
    } catch (e) {}
    if (!reportURL) {
      $("crashes-noConfig").style.display = "block";
      $("crashes-noConfig").classList.remove("no-copy");
      return;
    }
    $("crashes-allReports").style.display = "block";

    if (data.pending > 0) {
      document.l10n.setAttributes(
        $("crashes-allReportsWithPending"),
        "pending-reports",
        { reports: data.pending }
      );
    }

    const dateNow = new Date();
    $.append(
      $("crashes-tbody"),
      data.submitted.map(function (crash) {
        const date = new Date(crash.date);
        const timePassed = dateNow - date;
        let formattedDateStrId;
        let formattedDateStrArgs;
        if (timePassed >= 24 * 60 * 60 * 1000) {
          const daysPassed = Math.round(timePassed / (24 * 60 * 60 * 1000));
          formattedDateStrId = "crashes-time-days";
          formattedDateStrArgs = { days: daysPassed };
        } else if (timePassed >= 60 * 60 * 1000) {
          const hoursPassed = Math.round(timePassed / (60 * 60 * 1000));
          formattedDateStrId = "crashes-time-hours";
          formattedDateStrArgs = { hours: hoursPassed };
        } else {
          const minutesPassed = Math.max(
            Math.round(timePassed / (60 * 1000)),
            1
          );
          formattedDateStrId = "crashes-time-minutes";
          formattedDateStrArgs = { minutes: minutesPassed };
        }
        return $.new("tr", [
          $.new("td", [
            $.new("a", crash.id, null, { href: reportURL + crash.id }),
          ]),
          $.new("td", null, null, {
            "data-l10n-id": formattedDateStrId,
            "data-l10n-args": formattedDateStrArgs,
          }),
        ]);
      })
    );
  },

  addons(data) {
    $.append(
      $("addons-tbody"),
      data.map(function (addon) {
        return $.new("tr", [
          $.new("td", addon.name),
          $.new("td", addon.type),
          $.new("td", addon.version),
          $.new("td", addon.isActive),
          $.new("td", addon.locationName),
          $.new("td", addon.id),
        ]);
      })
    );
  },

  securitySoftware(data) {
    if (AppConstants.platform !== "win") {
      $("security-software-title").hidden = true;
      $("security-software-table").hidden = true;
      return;
    }

    $("security-software-antivirus").textContent = data.registeredAntiVirus;
    $("security-software-antispyware").textContent = data.registeredAntiSpyware;
    $("security-software-firewall").textContent = data.registeredFirewall;
  },

  async processes(data) {
    async function buildEntry(name, value) {
      const fluentName = ProcessType.fluentNameFromProcessTypeString(name);
      const entryName = (await document.l10n.formatValue(fluentName)) || name;
      $("processes-tbody").appendChild(
        $.new("tr", [$.new("td", entryName), $.new("td", value)])
      );
    }

    const remoteProcessesCount = Object.values(data.remoteTypes).reduce(
      (a, b) => a + b,
      0
    );
    document.querySelector("#remoteprocesses-row a").textContent =
      remoteProcessesCount;

    // Display the regular "web" process type first in the list,
    // and with special formatting.
    if (data.remoteTypes.web) {
      await buildEntry(
        "web",
        `${data.remoteTypes.web} / ${data.maxWebContentProcesses}`
      );
      delete data.remoteTypes.web;
    }

    for (const remoteProcessType in data.remoteTypes) {
      await buildEntry(remoteProcessType, data.remoteTypes[remoteProcessType]);
    }
  },

  environmentVariables(data) {
    if (!data) {
      return;
    }
    $.append(
      $("environment-variables-tbody"),
      Object.entries(data).map(([name, value]) => {
        return $.new("tr", [
          $.new("td", name, "pref-name"),
          $.new("td", value, "pref-value"),
        ]);
      })
    );
  },

  modifiedPreferences(data) {
    $.append($("prefs-tbody"), prefsTable(data));
  },

  lockedPreferences(data) {
    $.append($("locked-prefs-tbody"), prefsTable(data));
  },

  printingPreferences(data) {
    if (AppConstants.platform == "android") {
      return;
    }
    const tbody = $("support-printing-prefs-tbody");
    $.append(tbody, prefsTable(data));
    $("support-printing-clear-settings-button").addEventListener(
      "click",
      function () {
        for (const name in data) {
          Services.prefs.clearUserPref(name);
        }
        tbody.textContent = "";
      }
    );
  },

  async graphics(data) {
    function localizedMsg(msg) {
      if (typeof msg == "object" && msg.key) {
        return document.l10n.formatValue(msg.key, msg.args);
      }
      const msgId = toFluentID(msg);
      if (msgId) {
        return document.l10n.formatValue(msgId);
      }
      return "";
    }

    // Read APZ info out of data.info, stripping it out in the process.
    let apzInfo = [];
    const formatApzInfo = function (info) {
      const out = [];
      for (const type of [
        "Wheel",
        "Touch",
        "Drag",
        "Keyboard",
        "Autoscroll",
        "Zooming",
      ]) {
        const key = "Apz" + type + "Input";

        if (!(key in info)) {
          continue;
        }

        delete info[key];

        out.push(toFluentID(type.toLowerCase() + "Enabled"));
      }

      return out;
    };

    // Create a <tr> element with key and value columns.
    //
    // @key      Text in the key column. Localized automatically, unless starts with "#".
    // @value    Fluent ID for text in the value column, or array of children.
    function buildRow(key, value) {
      const title = key[0] == "#" ? key.substr(1) : key;
      const keyStrId = toFluentID(key);
      const valueStrId = Array.isArray(value) ? null : toFluentID(value);
      const td = $.new("td", value);
      td.style["white-space"] = "pre-wrap";
      if (valueStrId) {
        document.l10n.setAttributes(td, valueStrId);
      }

      const th = $.new("th", title, "column");
      if (!key.startsWith("#")) {
        document.l10n.setAttributes(th, keyStrId);
      }
      return $.new("tr", [th, td]);
    }

    // @where    The name in "graphics-<name>-tbody", of the element to append to.
    // @trs      Array of row elements.
    function addRows(where, trs) {
      $.append($("graphics-" + where + "-tbody"), trs);
    }

    // Build and append a row.
    //
    // @where    The name in "graphics-<name>-tbody", of the element to append to.
    function addRow(where, key, value) {
      addRows(where, [buildRow(key, value)]);
    }
    if ("info" in data) {
      apzInfo = formatApzInfo(data.info);

      const trs = sortedArrayFromObject(data.info).map(function ([prop, val]) {
        const td = $.new("td", String(val));
        td.style["word-break"] = "break-all";
        return $.new("tr", [$.new("th", prop, "column"), td]);
      });
      addRows("diagnostics", trs);

      delete data.info;
    }

    const windowUtils = window.windowUtils;
    const gpuProcessPid = windowUtils.gpuProcessPid;

    if (gpuProcessPid != -1) {
      let gpuProcessKillButton = null;
      if (AppConstants.NIGHTLY_BUILD || AppConstants.MOZ_DEV_EDITION) {
        gpuProcessKillButton = $.new("button");

        gpuProcessKillButton.addEventListener("click", function () {
          windowUtils.terminateGPUProcess();
        });

        document.l10n.setAttributes(
          gpuProcessKillButton,
          "gpu-process-kill-button"
        );
      }

      addRow("diagnostics", "gpu-process-pid", [new Text(gpuProcessPid)]);
      if (gpuProcessKillButton) {
        addRow("diagnostics", "gpu-process", [gpuProcessKillButton]);
      }
    }

    if (
      (AppConstants.NIGHTLY_BUILD || AppConstants.MOZ_DEV_EDITION) &&
      AppConstants.platform != "macosx"
    ) {
      const gpuDeviceResetButton = $.new("button");

      gpuDeviceResetButton.addEventListener("click", function () {
        windowUtils.triggerDeviceReset();
      });

      document.l10n.setAttributes(
        gpuDeviceResetButton,
        "gpu-device-reset-button"
      );
      addRow("diagnostics", "gpu-device-reset", [gpuDeviceResetButton]);
    }

    // graphics-failures-tbody tbody
    if ("failures" in data) {
      // If indices is there, it should be the same length as failures,
      // (see Troubleshoot.sys.mjs) but we check anyway:
      if ("indices" in data && data.failures.length == data.indices.length) {
        const combined = [];
        for (let i = 0; i < data.failures.length; i++) {
          const assembled = assembleFromGraphicsFailure(i, data);
          combined.push(assembled);
        }
        combined.sort(function (a, b) {
          if (a.index < b.index) {
            return -1;
          }
          if (a.index > b.index) {
            return 1;
          }
          return 0;
        });
        $.append(
          $("graphics-failures-tbody"),
          combined.map(function (val) {
            return $.new("tr", [
              $.new("th", val.header, "column"),
              $.new("td", val.message),
            ]);
          })
        );
        delete data.indices;
      } else {
        $.append($("graphics-failures-tbody"), [
          $.new("tr", [
            $.new("th", "LogFailure", "column"),
            $.new(
              "td",
              data.failures.map(function (val) {
                return $.new("p", val);
              })
            ),
          ]),
        ]);
      }
      delete data.failures;
    } else {
      $("graphics-failures-tbody").style.display = "none";
    }

    // Add a new row to the table, and take the key (or keys) out of data.
    //
    // @where        Table section to add to.
    // @key          Data key to use.
    // @colKey       The localization key to use, if different from key.
    async function addRowFromKey(where, key, colKey) {
      if (!(key in data)) {
        return;
      }
      colKey = colKey || key;

      let value;
      const messageKey = key + "Message";
      if (messageKey in data) {
        value = await localizedMsg(data[messageKey]);
        delete data[messageKey];
      } else {
        value = data[key];
      }
      delete data[key];

      if (value) {
        addRow(where, colKey, [new Text(value)]);
      }
    }

    // graphics-features-tbody
    let compositor = "";
    if (data.windowLayerManagerRemote) {
      compositor = data.windowLayerManagerType;
    } else {
      const noOMTCString = await document.l10n.formatValue(
        "main-thread-no-omtc"
      );
      compositor = "BasicLayers (" + noOMTCString + ")";
    }
    addRow("features", "compositing", [new Text(compositor)]);
    addRow("features", "supportFontDetermination", [
      new Text(data.supportFontDetermination),
    ]);
    delete data.windowLayerManagerRemote;
    delete data.windowLayerManagerType;
    delete data.numTotalWindows;
    delete data.numAcceleratedWindows;
    delete data.numAcceleratedWindowsMessage;

    addRow(
      "features",
      "asyncPanZoom",
      apzInfo.length
        ? [
            new Text(
              (
                await document.l10n.formatValues(
                  apzInfo.map(id => {
                    return { id };
                  })
                )
              ).join("; ")
            ),
          ]
        : "apz-none"
    );
    const featureKeys = [
      "webgl1WSIInfo",
      "webgl1Renderer",
      "webgl1Version",
      "webgl1DriverExtensions",
      "webgl1Extensions",
      "webgl2WSIInfo",
      "webgl2Renderer",
      "webgl2Version",
      "webgl2DriverExtensions",
      "webgl2Extensions",
      ["supportsHardwareH264", "hardware-h264"],
      ["direct2DEnabled", "#Direct2D"],
      ["windowProtocol", "graphics-window-protocol"],
      ["desktopEnvironment", "graphics-desktop-environment"],
      "usesTiling",
      "targetFrameRate",
    ];
    for (const feature of featureKeys) {
      if (Array.isArray(feature)) {
        await addRowFromKey("features", feature[0], feature[1]);
        continue;
      }
      await addRowFromKey("features", feature);
    }

    if ("directWriteEnabled" in data) {
      let message = data.directWriteEnabled;
      if ("directWriteVersion" in data) {
        message += " (" + data.directWriteVersion + ")";
      }
      await addRow("features", "#DirectWrite", [new Text(message)]);
      delete data.directWriteEnabled;
      delete data.directWriteVersion;
    }

    // Adapter tbodies.
    const adapterKeys = [
      ["adapterDescription", "gpu-description"],
      ["adapterVendorID", "gpu-vendor-id"],
      ["adapterDeviceID", "gpu-device-id"],
      ["driverVendor", "gpu-driver-vendor"],
      ["driverVersion", "gpu-driver-version"],
      ["driverDate", "gpu-driver-date"],
      ["adapterDrivers", "gpu-drivers"],
      ["adapterSubsysID", "gpu-subsys-id"],
      ["adapterRAM", "gpu-ram"],
    ];

    function showGpu(id, suffix) {
      function get(prop) {
        return data[prop + suffix];
      }

      const trs = [];
      for (const [prop, key] of adapterKeys) {
        const value = get(prop);
        if (value === undefined || value === "") {
          continue;
        }
        trs.push(buildRow(key, [new Text(value)]));
      }

      if (trs.length == 0) {
        $("graphics-" + id + "-tbody").style.display = "none";
        return;
      }

      let active = "yes";
      if ("isGPU2Active" in data && (suffix == "2") != data.isGPU2Active) {
        active = "no";
      }

      addRow(id, "gpu-active", active);
      addRows(id, trs);
    }
    showGpu("gpu-1", "");
    showGpu("gpu-2", "2");

    // Remove adapter keys.
    for (const [prop /* key */] of adapterKeys) {
      delete data[prop];
      delete data[prop + "2"];
    }
    delete data.isGPU2Active;

    const featureLog = data.featureLog;
    delete data.featureLog;

    if (featureLog.features.length) {
      for (const feature of featureLog.features) {
        const trs = [];
        for (const entry of feature.log) {
          let contents;
          if (!entry.hasOwnProperty("message")) {
            // This is a default entry.
            contents = entry.status + " by " + entry.type;
          } else if (entry.message.length && entry.message[0] == "#") {
            // This is a failure ID. See nsIGfxInfo.idl.
            const m = /#BLOCKLIST_FEATURE_FAILURE_BUG_(\d+)/.exec(
              entry.message
            );
            if (m) {
              const bugSpan = $.new("span");

              const bugHref = $.new("a");
              bugHref.href =
                "https://bugzilla.mozilla.org/show_bug.cgi?id=" + m[1];
              bugHref.setAttribute("data-l10n-name", "bug-link");
              bugSpan.append(bugHref);
              document.l10n.setAttributes(bugSpan, "support-blocklisted-bug", {
                bugNumber: m[1],
              });

              contents = [bugSpan];
            } else {
              const unknownFailure = $.new("span");
              document.l10n.setAttributes(unknownFailure, "unknown-failure", {
                failureCode: entry.message.substr(1),
              });
              contents = [unknownFailure];
            }
          } else {
            contents =
              entry.status + " by " + entry.type + ": " + entry.message;
          }

          trs.push($.new("tr", [$.new("td", contents)]));
        }
        addRow("decisions", "#" + feature.name, [$.new("table", trs)]);
      }
    } else {
      $("graphics-decisions-tbody").style.display = "none";
    }

    if (featureLog.fallbacks.length) {
      for (const fallback of featureLog.fallbacks) {
        addRow("workarounds", "#" + fallback.name, [
          new Text(fallback.message),
        ]);
      }
    } else {
      $("graphics-workarounds-tbody").style.display = "none";
    }

    const crashGuards = data.crashGuards;
    delete data.crashGuards;

    if (crashGuards.length) {
      for (const guard of crashGuards) {
        const resetButton = $.new("button");
        const onClickReset = function () {
          Services.prefs.setIntPref(guard.prefName, 0);
          resetButton.removeEventListener("click", onClickReset);
          resetButton.disabled = true;
        };

        document.l10n.setAttributes(resetButton, "reset-on-next-restart");
        resetButton.addEventListener("click", onClickReset);

        addRow("crashguards", guard.type + "CrashGuard", [resetButton]);
      }
    } else {
      $("graphics-crashguards-tbody").style.display = "none";
    }

    // Now that we're done, grab any remaining keys in data and drop them into
    // the diagnostics section.
    for (const key in data) {
      const value = data[key];
      addRow("diagnostics", key, [new Text(value)]);
    }
  },

  media(data) {
    function insertBasicInfo(key, value) {
      function createRow(rowKey, rowValue) {
        const th = $.new("th", null, "column");
        document.l10n.setAttributes(th, rowKey);
        const td = $.new("td", rowValue);
        td.style["white-space"] = "pre-wrap";
        td.colSpan = 8;
        return $.new("tr", [th, td]);
      }
      $.append($("media-info-tbody"), [createRow(key, value)]);
    }

    function createDeviceInfoRow(device) {
      const states = {};
      states[Ci.nsIAudioDeviceInfo.STATE_DISABLED] = "Disabled";
      states[Ci.nsIAudioDeviceInfo.STATE_UNPLUGGED] = "Unplugged";
      states[Ci.nsIAudioDeviceInfo.STATE_ENABLED] = "Enabled";

      const preferreds = {};
      preferreds[Ci.nsIAudioDeviceInfo.PREF_NONE] = "None";
      preferreds[Ci.nsIAudioDeviceInfo.PREF_MULTIMEDIA] = "Multimedia";
      preferreds[Ci.nsIAudioDeviceInfo.PREF_VOICE] = "Voice";
      preferreds[Ci.nsIAudioDeviceInfo.PREF_NOTIFICATION] = "Notification";
      preferreds[Ci.nsIAudioDeviceInfo.PREF_ALL] = "All";

      const formats = {};
      formats[Ci.nsIAudioDeviceInfo.FMT_S16LE] = "S16LE";
      formats[Ci.nsIAudioDeviceInfo.FMT_S16BE] = "S16BE";
      formats[Ci.nsIAudioDeviceInfo.FMT_F32LE] = "F32LE";
      formats[Ci.nsIAudioDeviceInfo.FMT_F32BE] = "F32BE";

      function toPreferredString(preferred) {
        if (preferred == Ci.nsIAudioDeviceInfo.PREF_NONE) {
          return preferreds[Ci.nsIAudioDeviceInfo.PREF_NONE];
        } else if (preferred & Ci.nsIAudioDeviceInfo.PREF_ALL) {
          return preferreds[Ci.nsIAudioDeviceInfo.PREF_ALL];
        }
        let str = "";
        for (const pref of [
          Ci.nsIAudioDeviceInfo.PREF_MULTIMEDIA,
          Ci.nsIAudioDeviceInfo.PREF_VOICE,
          Ci.nsIAudioDeviceInfo.PREF_NOTIFICATION,
        ]) {
          if (preferred & pref) {
            str += " " + preferreds[pref];
          }
        }
        return str;
      }

      function toFromatString(dev) {
        let str = "default: " + formats[dev.defaultFormat] + ", support:";
        for (const fmt of [
          Ci.nsIAudioDeviceInfo.FMT_S16LE,
          Ci.nsIAudioDeviceInfo.FMT_S16BE,
          Ci.nsIAudioDeviceInfo.FMT_F32LE,
          Ci.nsIAudioDeviceInfo.FMT_F32BE,
        ]) {
          if (dev.supportedFormat & fmt) {
            str += " " + formats[fmt];
          }
        }
        return str;
      }

      function toRateString(dev) {
        return (
          "default: " +
          dev.defaultRate +
          ", support: " +
          dev.minRate +
          " - " +
          dev.maxRate
        );
      }

      function toLatencyString(dev) {
        return dev.minLatency + " - " + dev.maxLatency;
      }

      return $.new("tr", [
        $.new("td", device.name),
        $.new("td", device.groupId),
        $.new("td", device.vendor),
        $.new("td", states[device.state]),
        $.new("td", toPreferredString(device.preferred)),
        $.new("td", toFromatString(device)),
        $.new("td", device.maxChannels),
        $.new("td", toRateString(device)),
        $.new("td", toLatencyString(device)),
      ]);
    }

    function insertDeviceInfo(side, devices) {
      const rows = [];
      for (const dev of devices) {
        rows.push(createDeviceInfoRow(dev));
      }
      $.append($("media-" + side + "-devices-tbody"), rows);
    }

    function insertEnumerateDatabase() {
      if (
        !Services.prefs.getBoolPref("media.mediacapabilities.from-database")
      ) {
        $("media-capabilities-tbody").style.display = "none";
        return;
      }
      const button = $("enumerate-database-button");
      if (button) {
        button.addEventListener("click", function () {
          const { KeyValueService } = ChromeUtils.importESModule(
            "resource://gre/modules/kvstore.sys.mjs"
          );
          const currProfDir = Services.dirsvc.get("ProfD", Ci.nsIFile);
          currProfDir.append("mediacapabilities");
          const path = currProfDir.path;

          function enumerateDatabase(name) {
            KeyValueService.getOrCreate(path, name)
              .then(database => {
                return database.enumerate();
              })
              .then(enumerator => {
                var logs = [];
                logs.push(`${name}:`);
                for (const { key, value } of enumerator) {
                  logs.push(`${key}: ${value}`);
                }
                $("enumerate-database-result").textContent +=
                  logs.join("\n") + "\n";
              })
              .catch(() => {
                $("enumerate-database-result").textContent += `${name}:\n`;
              });
          }

          $("enumerate-database-result").style.display = "block";
          $("enumerate-database-result").classList.remove("no-copy");
          $("enumerate-database-result").textContent = "";

          enumerateDatabase("video/av1");
          enumerateDatabase("video/vp8");
          enumerateDatabase("video/vp9");
          enumerateDatabase("video/avc");
          enumerateDatabase("video/theora");
        });
      }
    }

    function roundtripAudioLatency() {
      insertBasicInfo("roundtrip-latency", "...");
      window.windowUtils
        .defaultDevicesRoundTripLatency()
        .then(latency => {
          var latencyString = `${(latency[0] * 1000).toFixed(2)}ms (${(
            latency[1] * 1000
          ).toFixed(2)})`;
          data.defaultDevicesRoundTripLatency = latencyString;
          document.querySelector(
            'th[data-l10n-id="roundtrip-latency"]'
          ).nextSibling.textContent = latencyString;
        })
        .catch(() => {});
    }

    // Basic information
    insertBasicInfo("audio-backend", data.currentAudioBackend);
    insertBasicInfo("max-audio-channels", data.currentMaxAudioChannels);
    insertBasicInfo("sample-rate", data.currentPreferredSampleRate);

    if (AppConstants.platform == "macosx") {
      var micStatus = {};
      const permission = Cc["@mozilla.org/ospermissionrequest;1"].getService(
        Ci.nsIOSPermissionRequest
      );
      permission.getAudioCapturePermissionState(micStatus);
      if (micStatus.value == permission.PERMISSION_STATE_AUTHORIZED) {
        roundtripAudioLatency();
      }
    } else if (
      AppConstants.platform != "win" ||
      !Services.sysinfo.getProperty("hasWinPackageId", false)
    ) {
      roundtripAudioLatency();
    }

    // Output devices information
    insertDeviceInfo("output", data.audioOutputDevices);

    // Input devices information
    insertDeviceInfo("input", data.audioInputDevices);

    // Media Capabilitites
    insertEnumerateDatabase();
  },

  remoteAgent(data) {
    if (!AppConstants.ENABLE_WEBDRIVER) {
      return;
    }
    $("remote-debugging-accepting-connections").textContent = data.listening;
    $("remote-debugging-url").textContent = data.url;
  },

  accessibility(data) {
    $("a11y-activated").textContent = data.isActive;
    $("a11y-force-disabled").textContent = data.forceDisabled || 0;

    const a11yHandlerUsed = $("a11y-handler-used");
    if (a11yHandlerUsed) {
      a11yHandlerUsed.textContent = data.handlerUsed;
    }

    const a11yInstantiator = $("a11y-instantiator");
    if (a11yInstantiator) {
      a11yInstantiator.textContent = data.instantiator;
    }
  },

  startupCache(data) {
    $("startup-cache-disk-cache-path").textContent = data.DiskCachePath;
    $("startup-cache-ignore-disk-cache").textContent = data.IgnoreDiskCache;
    $("startup-cache-found-disk-cache-on-init").textContent =
      data.FoundDiskCacheOnInit;
    $("startup-cache-wrote-to-disk-cache").textContent = data.WroteToDiskCache;
  },

  libraryVersions(data) {
    const trs = [
      $.new("tr", [
        $.new("th", ""),
        $.new("th", null, null, { "data-l10n-id": "min-lib-versions" }),
        $.new("th", null, null, { "data-l10n-id": "loaded-lib-versions" }),
      ]),
    ];
    sortedArrayFromObject(data).forEach(function ([name, val]) {
      trs.push(
        $.new("tr", [
          $.new("td", name),
          $.new("td", val.minVersion),
          $.new("td", val.version),
        ])
      );
    });
    $.append($("libversions-tbody"), trs);
  },

  userJS(data) {
    if (!data.exists) {
      return;
    }
    const userJSFile = Services.dirsvc.get("PrefD", Ci.nsIFile);
    userJSFile.append("user.js");
    $("prefs-user-js-link").href = Services.io.newFileURI(userJSFile).spec;
    $("prefs-user-js-section").style.display = "";
    // Clear the no-copy class
    $("prefs-user-js-section").className = "";
  },

  sandbox(data) {
    if (!AppConstants.MOZ_SANDBOX) {
      return;
    }

    const tbody = $("sandbox-tbody");
    for (const key in data) {
      // Simplify the display a little in the common case.
      if (
        key === "hasPrivilegedUserNamespaces" &&
        data[key] === data.hasUserNamespaces
      ) {
        continue;
      }
      if (key === "syscallLog") {
        // Not in this table.
        continue;
      }
      const keyStrId = toFluentID(key);
      const th = $.new("th", null, "column");
      document.l10n.setAttributes(th, keyStrId);
      tbody.appendChild($.new("tr", [th, $.new("td", data[key])]));
    }

    if ("syscallLog" in data) {
      const syscallBody = $("sandbox-syscalls-tbody");
      const argsHead = $("sandbox-syscalls-argshead");
      for (const syscall of data.syscallLog) {
        if (argsHead.colSpan < syscall.args.length) {
          argsHead.colSpan = syscall.args.length;
        }
        const procTypeStrId = toFluentID(syscall.procType);
        const cells = [
          $.new("td", syscall.index, "integer"),
          $.new("td", syscall.msecAgo / 1000),
          $.new("td", syscall.pid, "integer"),
          $.new("td", syscall.tid, "integer"),
          $.new("td", null, null, {
            "data-l10n-id": "sandbox-proc-type-" + procTypeStrId,
          }),
          $.new("td", syscall.syscall, "integer"),
        ];
        for (const arg of syscall.args) {
          cells.push($.new("td", arg, "integer"));
        }
        syscallBody.appendChild($.new("tr", cells));
      }
    }
  },

  intl(data) {
    $("intl-locale-requested").textContent = JSON.stringify(
      data.localeService.requested
    );
    $("intl-locale-available").textContent = JSON.stringify(
      data.localeService.available
    );
    $("intl-locale-supported").textContent = JSON.stringify(
      data.localeService.supported
    );
    $("intl-locale-regionalprefs").textContent = JSON.stringify(
      data.localeService.regionalPrefs
    );
    $("intl-locale-default").textContent = JSON.stringify(
      data.localeService.defaultLocale
    );

    $("intl-osprefs-systemlocales").textContent = JSON.stringify(
      data.osPrefs.systemLocales
    );
    $("intl-osprefs-regionalprefs").textContent = JSON.stringify(
      data.osPrefs.regionalPrefsLocales
    );
  },
};

var $ = document.getElementById.bind(document);

// eslint-disable-next-line func-names
$.new = function $_new(tag, textContentOrChildren, className, attributes) {
  const elt = document.createElement(tag);
  if (className) {
    elt.className = className;
  }
  if (attributes) {
    if (attributes["data-l10n-id"]) {
      const args = attributes.hasOwnProperty("data-l10n-args")
        ? attributes["data-l10n-args"]
        : undefined;
      document.l10n.setAttributes(elt, attributes["data-l10n-id"], args);
      delete attributes["data-l10n-id"];
      if (args) {
        delete attributes["data-l10n-args"];
      }
    }

    for (const attrName in attributes) {
      elt.setAttribute(attrName, attributes[attrName]);
    }
  }
  if (Array.isArray(textContentOrChildren)) {
    this.append(elt, textContentOrChildren);
  } else if (!attributes || !attributes["data-l10n-id"]) {
    elt.textContent = String(textContentOrChildren);
  }
  return elt;
};

// eslint-disable-next-line func-names
$.append = function $_append(parent, children) {
  children.forEach(c => parent.appendChild(c));
};

function assembleFromGraphicsFailure(i, data) {
  // Only cover the cases we have today; for example, we do not have
  // log failures that assert and we assume the log level is 1/error.
  let message = data.failures[i];
  const index = data.indices[i];
  let what = "";
  if (message.search(/\[GFX1-\]: \(LF\)/) == 0) {
    // Non-asserting log failure - the message is substring(14)
    what = "LogFailure";
    message = message.substring(14);
  } else if (message.search(/\[GFX1-\]: /) == 0) {
    // Non-asserting - the message is substring(9)
    what = "Error";
    message = message.substring(9);
  } else if (message.search(/\[GFX1\]: /) == 0) {
    // Asserting - the message is substring(8)
    what = "Assert";
    message = message.substring(8);
  }
  const assembled = {
    index,
    header: "(#" + index + ") " + what,
    message,
  };
  return assembled;
}

function sortedArrayFromObject(obj) {
  const tuples = [];
  for (const prop in obj) {
    tuples.push([prop, obj[prop]]);
  }
  tuples.sort(([prop1], [prop2]) => prop1.localeCompare(prop2));
  return tuples;
}

function copyRawDataToClipboard(button) {
  if (button) {
    button.disabled = true;
  }
  Troubleshoot.snapshot().then(
    async snapshot => {
      if (button) {
        button.disabled = false;
      }
      const str = Cc["@mozilla.org/supports-string;1"].createInstance(
        Ci.nsISupportsString
      );
      str.data = JSON.stringify(snapshot, undefined, 2);
      const transferable = Cc[
        "@mozilla.org/widget/transferable;1"
      ].createInstance(Ci.nsITransferable);
      transferable.init(getLoadContext());
      transferable.addDataFlavor("text/plain");
      transferable.setTransferData("text/plain", str);
      Services.clipboard.setData(
        transferable,
        null,
        Ci.nsIClipboard.kGlobalClipboard
      );
    },
    err => {
      if (button) {
        button.disabled = false;
      }
      console.error(err);
    }
  );
}

function getLoadContext() {
  return window.docShell.QueryInterface(Ci.nsILoadContext);
}

async function copyContentsToClipboard() {
  // Get the HTML and text representations for the important part of the page.
  const contentsDiv = $("contents").cloneNode(true);
  // Remove the items we don't want to copy from the clone:
  contentsDiv.querySelectorAll(".no-copy, [hidden]").forEach(n => n.remove());
  const dataHtml = contentsDiv.innerHTML;
  const dataText = createTextForElement(contentsDiv);

  // We can't use plain strings, we have to use nsSupportsString.
  const supportsStringClass = Cc["@mozilla.org/supports-string;1"];
  const ssHtml = supportsStringClass.createInstance(Ci.nsISupportsString);
  const ssText = supportsStringClass.createInstance(Ci.nsISupportsString);

  const transferable = Cc["@mozilla.org/widget/transferable;1"].createInstance(
    Ci.nsITransferable
  );
  transferable.init(getLoadContext());

  // Add the HTML flavor.
  transferable.addDataFlavor("text/html");
  ssHtml.data = dataHtml;
  transferable.setTransferData("text/html", ssHtml);

  // Add the plain text flavor.
  transferable.addDataFlavor("text/plain");
  ssText.data = dataText;
  transferable.setTransferData("text/plain", ssText);

  // Store the data into the clipboard.
  Services.clipboard.setData(
    transferable,
    null,
    Services.clipboard.kGlobalClipboard
  );
}

// Return the plain text representation of an element.  Do a little bit
// of pretty-printing to make it human-readable.
function createTextForElement(elem) {
  const serializer = new Serializer();
  let text = serializer.serialize(elem);

  // Actual CR/LF pairs are needed for some Windows text editors.
  if (AppConstants.platform == "win") {
    text = text.replace(/\n/g, "\r\n");
  }

  return text;
}

function Serializer() {}

Serializer.prototype = {
  serialize(rootElem) {
    this._lines = [];
    this._startNewLine();
    this._serializeElement(rootElem);
    this._startNewLine();
    return this._lines.join("\n").trim() + "\n";
  },

  // The current line is always the line that writing will start at next.  When
  // an element is serialized, the current line is updated to be the line at
  // which the next element should be written.
  get _currentLine() {
    return this._lines.length ? this._lines[this._lines.length - 1] : null;
  },

  set _currentLine(val) {
    this._lines[this._lines.length - 1] = val;
  },

  _serializeElement(elem) {
    // table
    if (elem.localName == "table") {
      this._serializeTable(elem);
      return;
    }

    // all other elements

    let hasText = false;
    for (const child of elem.childNodes) {
      if (child.nodeType == Node.TEXT_NODE) {
        const text = this._nodeText(child);
        this._appendText(text);
        hasText = hasText || !!text.trim();
      } else if (child.nodeType == Node.ELEMENT_NODE) {
        this._serializeElement(child);
      }
    }

    // For headings, draw a "line" underneath them so they stand out.
    const isHeader = /^h[0-9]+$/.test(elem.localName);
    if (isHeader) {
      const headerText = (this._currentLine || "").trim();
      if (headerText) {
        this._startNewLine();
        this._appendText("-".repeat(headerText.length));
      }
    }

    // Add a blank line underneath elements but only if they contain text.
    if (hasText && (isHeader || "p" == elem.localName)) {
      this._startNewLine();
      this._startNewLine();
    }
  },

  _startNewLine() {
    const currLine = this._currentLine;
    if (currLine) {
      // The current line is not empty.  Trim it.
      this._currentLine = currLine.trim();
      if (!this._currentLine) {
        // The current line became empty.  Discard it.
        this._lines.pop();
      }
    }
    this._lines.push("");
  },

  _appendText(text) {
    this._currentLine += text;
  },

  _isHiddenSubHeading(th) {
    return th.parentNode.parentNode.style.display == "none";
  },

  _serializeTable(table) {
    // Collect the table's column headings if in fact there are any.  First
    // check thead.  If there's no thead, check the first tr.
    const colHeadings = {};
    let tableHeadingElem = table.querySelector("thead");
    if (!tableHeadingElem) {
      tableHeadingElem = table.querySelector("tr");
    }
    if (tableHeadingElem) {
      const tableHeadingCols = tableHeadingElem.querySelectorAll("th,td");
      // If there's a contiguous run of th's in the children starting from the
      // rightmost child, then consider them to be column headings.
      for (let i = tableHeadingCols.length - 1; i >= 0; i--) {
        const col = tableHeadingCols[i];
        if (col.localName != "th" || col.classList.contains("title-column")) {
          break;
        }
        colHeadings[i] = this._nodeText(col).trim();
      }
    }
    const hasColHeadings = Object.keys(colHeadings).length > 0;
    if (!hasColHeadings) {
      tableHeadingElem = null;
    }

    const trs = table.querySelectorAll("table > tr, tbody > tr");
    const startRow =
      tableHeadingElem && tableHeadingElem.localName == "tr" ? 1 : 0;

    if (startRow >= trs.length) {
      // The table's empty.
      return;
    }

    if (hasColHeadings) {
      // Use column headings.  Print each tr as a multi-line chunk like:
      //   Heading 1: Column 1 value
      //   Heading 2: Column 2 value
      for (let i = startRow; i < trs.length; i++) {
        const children = trs[i].querySelectorAll("td");
        for (let j = 0; j < children.length; j++) {
          let text = "";
          if (colHeadings[j]) {
            text += colHeadings[j] + ": ";
          }
          text += this._nodeText(children[j]).trim();
          this._appendText(text);
          this._startNewLine();
        }
        this._startNewLine();
      }
      return;
    }

    // Don't use column headings.  Assume the table has only two columns and
    // print each tr in a single line like:
    //   Column 1 value: Column 2 value
    for (let i = startRow; i < trs.length; i++) {
      const children = trs[i].querySelectorAll("th,td");
      const rowHeading = this._nodeText(children[0]).trim();
      if (children[0].classList.contains("title-column")) {
        if (!this._isHiddenSubHeading(children[0])) {
          this._appendText(rowHeading);
        }
      } else if (children.length == 1) {
        // This is a single-cell row.
        this._appendText(rowHeading);
      } else {
        const childTables = trs[i].querySelectorAll("table");
        if (childTables.length) {
          // If we have child tables, don't use nodeText - its trs are already
          // queued up from querySelectorAll earlier.
          this._appendText(rowHeading + ": ");
        } else {
          this._appendText(
            rowHeading + ": " + this._nodeText(children[1]).trim()
          );
        }
      }
      this._startNewLine();
    }
    this._startNewLine();
  },

  _nodeText(node) {
    return node.textContent.replace(/\s+/g, " ");
  },
};

function openProfileDirectory() {
  // Get the profile directory.
  const currProfD = Services.dirsvc.get("ProfD", Ci.nsIFile);
  const profileDir = currProfD.path;

  // Show the profile directory.
  const nsLocalFile = Components.Constructor(
    "@mozilla.org/file/local;1",
    "nsIFile",
    "initWithPath"
  );
  new nsLocalFile(profileDir).reveal();
}

/**
 * Profile reset is only supported for the default profile if the appropriate migrator exists.
 */
function populateActionBox() {
  if (ResetProfile.resetSupported()) {
    $("reset-box").style.display = "block";
  }
  if (!Services.appinfo.inSafeMode && AppConstants.platform !== "android") {
    $("safe-mode-box").style.display = "block";

    if (Services.policies && !Services.policies.isAllowed("safeMode")) {
      $("restart-in-safe-mode-button").setAttribute("disabled", "true");
    }
  }
}

// Prompt user to restart the browser in safe mode
function safeModeRestart() {
  const cancelQuit = Cc["@mozilla.org/supports-PRBool;1"].createInstance(
    Ci.nsISupportsPRBool
  );
  Services.obs.notifyObservers(
    cancelQuit,
    "quit-application-requested",
    "restart"
  );

  if (!cancelQuit.data) {
    Services.startup.restartInSafeMode(Ci.nsIAppStartup.eAttemptQuit);
  }
}

// Added for TB.
function onShowPrivateDataChange() {
  document
    .getElementById("contents")
    .classList.toggle(
      "show-private-data",
      document.getElementById("check-show-private-data").checked
    );
}

/**
 * Set up event listeners for buttons.
 */
function setupEventListeners() {
  /* not used by TB
  let button = $("reset-box-button");
  if (button) {
    button.addEventListener("click", function(event) {
      ResetProfile.openConfirmationDialog(window);
    });
  }
*/
  let button = $("clear-startup-cache-button");
  if (button) {
    button.addEventListener("click", async function () {
      const [promptTitle, promptBody, restartButtonLabel] =
        await document.l10n.formatValues([
          { id: "startup-cache-dialog-title2" },
          { id: "startup-cache-dialog-body2" },
          { id: "restart-button-label" },
        ]);
      const buttonFlags =
        Services.prompt.BUTTON_POS_0 * Services.prompt.BUTTON_TITLE_IS_STRING +
        Services.prompt.BUTTON_POS_1 * Services.prompt.BUTTON_TITLE_CANCEL +
        Services.prompt.BUTTON_POS_0_DEFAULT;
      const result = Services.prompt.confirmEx(
        window.docShell.chromeEventHandler.ownerGlobal,
        promptTitle,
        promptBody,
        buttonFlags,
        restartButtonLabel,
        null,
        null,
        null,
        {}
      );
      if (result !== 0) {
        return;
      }
      Services.appinfo.invalidateCachesOnRestart();
      Services.startup.quit(
        Ci.nsIAppStartup.eRestart | Ci.nsIAppStartup.eAttemptQuit
      );
    });
  }
  button = $("restart-in-safe-mode-button");
  if (button) {
    button.addEventListener("click", function () {
      if (
        Services.obs
          .enumerateObservers("restart-in-safe-mode")
          .hasMoreElements()
      ) {
        Services.obs.notifyObservers(null, "restart-in-safe-mode");
      } else {
        safeModeRestart();
      }
    });
  }
  if (AppConstants.MOZ_UPDATER) {
    button = $("update-dir-button");
    if (button) {
      button.addEventListener("click", function () {
        // Get the update directory.
        const updateDir = Services.dirsvc.get("UpdRootD", Ci.nsIFile);
        if (!updateDir.exists()) {
          updateDir.create(Ci.nsIFile.DIRECTORY_TYPE, 0o755);
        }
        const updateDirPath = updateDir.path;
        // Show the update directory.
        const nsLocalFile = Components.Constructor(
          "@mozilla.org/file/local;1",
          "nsIFile",
          "initWithPath"
        );
        new nsLocalFile(updateDirPath).reveal();
      });
    }
    button = $("show-update-history-button");
    if (button) {
      button.addEventListener("click", function () {
        window.browsingContext.topChromeWindow.openDialog(
          "chrome://mozapps/content/update/history.xhtml",
          "Update:History",
          "centerscreen,resizable=no,titlebar,modal"
        );
      });
    }
  }
  button = $("verify-place-integrity-button");
  if (button) {
    button.addEventListener("click", function () {
      PlacesDBUtils.checkAndFixDatabase().then(tasksStatusMap => {
        let logs = [];
        for (const [key, value] of tasksStatusMap) {
          logs.push(`> Task: ${key}`);
          const prefix = value.succeeded ? "+ " : "- ";
          logs = logs.concat(value.logs.map(m => `${prefix}${m}`));
        }
        $("verify-place-result").style.display = "block";
        $("verify-place-result").classList.remove("no-copy");
        $("verify-place-result").textContent = logs.join("\n");
      });
    });
  }

  // added for TB
  $("send-via-email").addEventListener("click", function () {
    sendViaEmail();
  });
  // end of TB addition
  /* not used by TB
  $("copy-raw-data-to-clipboard").addEventListener("click", function(event) {
    copyRawDataToClipboard(this);
  });
*/
  $("copy-to-clipboard").addEventListener("click", function () {
    copyContentsToClipboard();
  });
  $("profile-dir-button").addEventListener("click", function () {
    openProfileDirectory();
  });
}
