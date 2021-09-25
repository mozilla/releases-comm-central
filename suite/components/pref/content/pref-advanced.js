/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const {AppConstants} = ChromeUtils.import("resource://gre/modules/AppConstants.jsm");
const {ShellService} = ChromeUtils.import("resource:///modules/ShellService.jsm");

var defaultClient = 0;
var defaultApps = 0;

function Startup()
{
  InitPlatformIntegration();
  CrashReportsCheck();
}

/**
 * System preferences
 */

function InitPlatformIntegration() {
  if (ShellService) {
    try {
      this.defaultApps = ShellService.shouldBeDefaultClientFor;
      ["Browser", "Mail", "News", "Rss"].forEach(function(aType) {
        let button = document.getElementById("setDefault" + aType);
        try {
          let client = Ci.nsIShellService[aType.toUpperCase()];
          let isDefault = ShellService.isDefaultClient(false, client);
          if (isDefault) {
            this.defaultClient |= client;
          }
          button.disabled = isDefault;
          document.getElementById("defaultClientGroup").hidden = false;
        } catch (e) {
          button.hidden = true;
        }
      });
    } catch (e) {
    }
  }
}

function ApplySetAsDefaultClient() {
  let pane = document.getElementById("advanced_pane");
  ShellService.setDefaultClient(false, false, pane.defaultClient);
  ShellService.shouldBeDefaultClientFor = pane.defaultApps;
}

function onSetDefault(aButton, aType) {
  if (document.documentElement.instantApply) {
    ShellService.setDefaultClient(false, false, Ci.nsIShellService[aType]);
    ShellService.shouldBeDefaultClientFor |= Ci.nsIShellService[aType];
  } else {
    this.defaultClient |= Ci.nsIShellService[aType];
    this.defaultApps |= Ci.nsIShellService[aType];
    window.addEventListener("dialogaccept", this.ApplySetAsDefaultClient, true);
  }

  aButton.disabled = true;
}

function onNewsChange(aChecked) {
  let snws = document.getElementById("network.protocol-handler.external.snews");
  let nntp = document.getElementById("network.protocol-handler.external.nntp");

  if (!snws.locked)
    snws.value = aChecked;

  if (!nntp.locked)
    nntp.value = aChecked;
}

function CrashReportsCheck()
{
  if (AppConstants.MOZ_CRASHREPORTER) {
    var cr = Cc["@mozilla.org/toolkit/crash-reporter;1"]
               .getService(Ci.nsICrashReporter);
    document.getElementById("crashReports").hidden = !cr.enabled;
    document.getElementById("submitCrashes").checked = cr.submitReports;
  }
}

function updateSubmitCrashes(aChecked)
{
  Cc["@mozilla.org/toolkit/crash-reporter;1"]
    .getService(Ci.nsICrashReporter)
    .submitReports = aChecked;
}
