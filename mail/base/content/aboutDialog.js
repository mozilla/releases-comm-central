/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/* import-globals-from aboutDialog-appUpdater.js */

"use strict";

var { AppConstants } = ChromeUtils.importESModule(
  "resource://gre/modules/AppConstants.sys.mjs"
);
if (AppConstants.MOZ_UPDATER) {
  Services.scriptloader.loadSubScript(
    "chrome://messenger/content/aboutDialog-appUpdater.js",
    this
  );
}

window.addEventListener("DOMContentLoaded", onLoad);
if (AppConstants.MOZ_UPDATER) {
  // This method is in the aboutDialog-appUpdater.js file.
  window.addEventListener("unload", onUnload);
}

function onLoad(loadEvent) {
  if (loadEvent.target !== document) {
    return;
  }

  const defaults = Services.prefs.getDefaultBranch(null);
  let distroId = defaults.getCharPref("distribution.id", "");
  if (distroId) {
    const distroAbout = defaults.getStringPref("distribution.about", "");
    // If there is about text, we always show it.
    if (distroAbout) {
      const distroField = document.getElementById("distribution");
      distroField.innerText = distroAbout;
      distroField.style.display = "block";
    }
    // If it's not a mozilla distribution, show the rest,
    // unless about text exists, then we always show.
    if (!distroId.startsWith("mozilla-") || distroAbout) {
      const distroVersion = defaults.getCharPref("distribution.version", "");
      if (distroVersion) {
        distroId += " - " + distroVersion;
      }

      const distroIdField = document.getElementById("distributionId");
      distroIdField.innerText = distroId;
      distroIdField.style.display = "block";
    }
  }

  // Include the build ID and display warning if this is an "a#" (nightly or aurora) build
  const versionIdMap = new Map([
    ["base", "aboutDialog-version"],
    ["base-nightly", "aboutDialog-version-nightly"],
    ["base-arch", "aboutdialog-version-arch"],
    ["base-arch-nightly", "aboutdialog-version-arch-nightly"],
  ]);
  let versionIdKey = "base";
  const versionAttributes = {
    version: AppConstants.MOZ_APP_VERSION_DISPLAY,
  };

  const arch = Services.sysinfo.get("arch");
  if (["x86", "x86-64"].includes(arch)) {
    versionAttributes.bits = Services.appinfo.is64Bit ? 64 : 32;
  } else {
    versionIdKey += "-arch";
    versionAttributes.arch = arch;
  }

  const version = Services.appinfo.version;
  if (/a\d+$/.test(version)) {
    versionIdKey += "-nightly";
    const buildID = Services.appinfo.appBuildID;
    const year = buildID.slice(0, 4);
    const month = buildID.slice(4, 6);
    const day = buildID.slice(6, 8);
    versionAttributes.isodate = `${year}-${month}-${day}`;

    document.getElementById("experimental").hidden = false;
    document.getElementById("communityDesc").hidden = true;
  }

  // Use Fluent arguments for append version and the architecture of the build
  const versionField = document.getElementById("version");

  document.l10n.setAttributes(
    versionField,
    versionIdMap.get(versionIdKey),
    versionAttributes
  );

  if (!AppConstants.NIGHTLY_BUILD) {
    // Show a release notes link if we have a URL.
    const relNotesLink = document.getElementById("releasenotes");
    const relNotesPrefType = Services.prefs.getPrefType("app.releaseNotesURL");
    if (relNotesPrefType != Services.prefs.PREF_INVALID) {
      const relNotesURL = Services.urlFormatter.formatURLPref(
        "app.releaseNotesURL"
      );
      if (relNotesURL != "about:blank") {
        relNotesLink.href = relNotesURL;
        relNotesLink.hidden = false;
      }
    }
  }

  if (AppConstants.MOZ_UPDATER) {
    gAppUpdater = new appUpdater({ buttonAutoFocus: true });

    const channelLabel = document.getElementById("currentChannelText");
    const channelAttrs = document.l10n.getAttributes(channelLabel);
    const channel = UpdateUtils.UpdateChannel;
    document.l10n.setAttributes(channelLabel, channelAttrs.id, { channel });
    if (
      /^release($|\-)/.test(channel) ||
      Services.sysinfo.getProperty("isPackagedApp")
    ) {
      channelLabel.hidden = true;
    }
  }

  // Open external links in browser
  for (const link of document.getElementsByClassName("browser-link")) {
    link.onclick = event => {
      event.preventDefault();
      openLink(event.target.href);
    };
  }
  // Open internal (about:) links open in Thunderbird tab
  for (const link of document.getElementsByClassName("tab-link")) {
    link.onclick = event => {
      event.preventDefault();
      openAboutTab(event.target.href);
    };
  }
}

// This function is used to open about: tabs. The caller should ensure the url
// is only an about: url.
function openAboutTab(url) {
  // Check existing windows
  const mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (mailWindow) {
    mailWindow.focus();
    mailWindow.document
      .getElementById("tabmail")
      .openTab("contentTab", { url });
    return;
  }

  // No existing windows.
  window.openDialog(
    "chrome://messenger/content/messenger.xhtml",
    "_blank",
    "chrome,dialog=no,all",
    null,
    {
      tabType: "contentTab",
      tabParams: { url },
    }
  );
}

function openLink(url) {
  Cc["@mozilla.org/uriloader/external-protocol-service;1"]
    .getService(Ci.nsIExternalProtocolService)
    .loadURI(Services.io.newURI(url));
}
