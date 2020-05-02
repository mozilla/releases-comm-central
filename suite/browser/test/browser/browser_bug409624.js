/* This Source Code Form is subject to the terms of the Mozilla Public
 *  License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
ChromeUtils.defineModuleGetter(this, "FormHistory",
  "resource://gre/modules/FormHistory.jsm");

function test() {
  waitForExplicitFinish();

  // This test relies on the form history being empty to start with delete
  // all the items first.
  FormHistory.update({ op: "remove" },
                     { handleError: function (error) {
                         do_throw("Error occurred updating form history: " + error);
                       },
                       handleCompletion: function (reason) { if (!reason) test2(); },
                     });
}

function test2()
{
  let prefService = Cc["@mozilla.org/preferences-service;1"]
                      .getService(Ci.nsIPrefBranch);

  let findBar = document.getElementById("FindToolbar");
  let textbox = findBar.getElement("findbar-textbox");

  let temp = {};
  ChromeUtils.import("resource:///modules/Sanitizer.jsm", temp);
  let s = temp.Sanitizer;
  let prefBranch = prefService.getBranch("privacy.clearOnShutdown.");

  prefBranch.setBoolPref("cache", false);
  prefBranch.setBoolPref("cookies", false);
  prefBranch.setBoolPref("downloads", false);
  prefBranch.setBoolPref("formdata", true);
  prefBranch.setBoolPref("history", false);
  prefBranch.setBoolPref("offlineApps", false);
  prefBranch.setBoolPref("passwords", false);
  prefBranch.setBoolPref("sessions", false);
  prefBranch.setBoolPref("siteSettings", false);

  prefService.setBoolPref("privacy.sanitize.promptOnSanitize", false);

  // Sanitize now so we can test the baseline point.
  s.sanitize();
  ok(!gFindBar.hasTransactions, "pre-test baseline for sanitizer");

  gFindBar.getElement("findbar-textbox").value = "m";
  ok(gFindBar.hasTransactions, "formdata can be cleared after input");

  s.sanitize();
  is(gFindBar.getElement("findbar-textbox").value, "", "findBar textbox should be empty after sanitize");
  ok(!gFindBar.hasTransactions, "No transactions after sanitize");

  finish();
}
