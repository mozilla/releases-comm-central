/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

Components.utils.import("resource://gre/modules/Services.jsm");

window.onload = function () {
  // get release notes URL and vendor URL from prefs
  var releaseNotesURL = Services.urlFormatter.formatURLPref("app.releaseNotesURL");
  if (releaseNotesURL != "about:blank") {
    var relnotes = document.getElementById("releaseNotesURL");
    relnotes.href = releaseNotesURL;
  }

  var vendorURL = Services.urlFormatter.formatURLPref("app.vendorURL");
  if (vendorURL != "about:blank") {
    var vendor = document.getElementById("vendorURL");
    vendor.href = vendorURL;
  }

  // append the version of the XUL application (!= XULRunner platform version)
  var versionNum = Services.appinfo.version;
  var version = document.getElementById("version");
  version.appendChild(document.createTextNode(versionNum));

  // append user agent
  var ua = navigator.userAgent;
  if (ua) {
    var uaItem = document.getElementById("userAgent");
    uaItem.appendChild(document.createTextNode(ua));
    uaItem.hidden = false;
  }

  // append build identifier
  var buildId = Services.appinfo.appBuildID;
  if (buildId) {
    var buildItem = document.getElementById("buildID");
    buildItem.appendChild(document.createTextNode(buildId));
    buildItem.hidden = false;
  }

  // Determine and display current channel.
  document.getElementById("currentChannel").textContent =
    Services.prefs.getDefaultBranch("").getCharPref("app.update.channel");
}
