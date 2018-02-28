/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

function test_visibility_open()
{
  var dmui = Cc["@mozilla.org/download-manager-ui;1"]
               .getService(Ci.nsISuiteDownloadManagerUI);
  isnot(dmui.recentWindow, null,
     "nsIDownloadManagerUI indicates that the UI is visible");
}

function test_visibility_closed(aWin)
{
  var dmui = Cc["@mozilla.org/download-manager-ui;1"]
               .getService(Ci.nsISuiteDownloadManagerUI);

  function dmWindowClosedListener() {
    aWin.removeEventListener("unload", dmWindowClosedListener);
    is(dmui.recentWindow, null,
       "nsIDownloadManagerUI indicates that the UI is not visible");
    finish();
  }
  aWin.addEventListener("unload", dmWindowClosedListener);
  aWin.close();
}

var testFuncs = [
    test_visibility_open
  , test_visibility_closed /* all tests after this *must* expect there to be
                              no open window, otherwise they will fail! */
];

function test()
{
  var dm = Cc["@mozilla.org/download-manager;1"]
             .getService(Ci.nsIDownloadManager);
  var db = dm.DBConnection;

  // First, we populate the database with some fake data
  db.executeSimpleSQL("DELETE FROM moz_downloads");

  // See if the DM is already open, and if it is, close it!
  var win = Services.wm.getMostRecentWindow("Download:Manager");
  if (win)
    win.close();

  // OK, now that all the data is in, let's pull up the UI
  Cc["@mozilla.org/download-manager-ui;1"]
    .getService(Ci.nsISuiteDownloadManagerUI).showManager();

  let obs = Cc["@mozilla.org/observer-service;1"]
              .getService(Ci.nsIObserverService);
  const DLMGR_UI_DONE = "download-manager-ui-done";

  let testObs = {
    observe: function(aSubject, aTopic, aData) {
      obs.removeObserver(testObs, DLMGR_UI_DONE);
      var win = wm.getMostRecentWindow("Download:Manager");

      // Now we can run our tests
      for (let t of testFuncs)
        t(win);

      // finish will be called by the last test that also hides the DM UI
    }
  };

  waitForExplicitFinish();
  obs.addObserver(testObs, DLMGR_UI_DONE);
}
