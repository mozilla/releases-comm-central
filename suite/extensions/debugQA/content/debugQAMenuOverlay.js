/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { Services } =
  ChromeUtils.import("resource://gre/modules/Services.jsm");

// "about:bloat" is available only when
// (the application is) compiled with |--enable-logrefcnt|.
if ("@mozilla.org/network/protocol/about;1?what=bloat" in Cc)
  window.addEventListener("load", onLoadBloat);

// Unhide (and enable) the Bloat menu and its associated separator.
function onLoadBloat()
{
  window.removeEventListener("load", onLoadBloat);

  // Ignore windows which don't get the Debug menu, like 'View Source'.
  if (!document.getElementById("debugMenu"))
    return;

  // Enable the menu, only if its feature is currently active.
  var envSvc = Cc["@mozilla.org/process/environment;1"]
                 .getService(Ci.nsIEnvironment);
  // Checking the environment variables is good enough,
  // as the Bloat service doesn't report the status of its statistics feature.
  if (envSvc.exists("XPCOM_MEM_BLOAT_LOG") ||
      envSvc.exists("XPCOM_MEM_LEAK_LOG"))
    document.getElementById("bloatMenu").disabled = false;

  document.getElementById("bloatSeparator").hidden = false;
  document.getElementById("bloatMenu").hidden = false;
}

// Open a debug QA link from the menu in the current tab.
function openQAUrl(aUrl)
{
  openUILinkIn(aUrl, "current",
               { triggeringPrincipal:
                   Services.scriptSecurityManager.createNullPrincipal({}),
               });
}

// Flush the memory using minimizeMemoryUsage.
function flushMemory() {
  Services.obs.notifyObservers(null, "child-mmu-request");
  Cc["@mozilla.org/memory-reporter-manager;1"]
    .getService(Ci.nsIMemoryReporterManager)
    .minimizeMemoryUsage(() => {});
}
