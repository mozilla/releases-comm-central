/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function Startup()
{
  SysPrefCheck();
  ShellServiceCheck();
  CrashReportsCheck();
}

/**
 * System preferences
 */

function SysPrefCheck()
{
  const kPrefService = "@mozilla.org/system-preference-service;1";
  let visible = kPrefService in Cc &&
    Cc[kPrefService].getService() instanceof Ci.nsIPrefBranch;
  document.getElementById("systemPrefs").hidden = !visible;
}

function ShellServiceCheck()
{
  const NS_SHELLSERVICE_CID = "@mozilla.org/suite/shell-service;1";

  if (NS_SHELLSERVICE_CID in Cc) try {
    Cc[NS_SHELLSERVICE_CID]
      .getService(Ci.nsIShellService)
      .shouldCheckDefaultClient;
    document.getElementById("checkDefault").hidden = false;
  } catch (e) {
  }
}

function CrashReportsCheck()
{
  if ("nsICrashReporter" in Ci)
  {
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
