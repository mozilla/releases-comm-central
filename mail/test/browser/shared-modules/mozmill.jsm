// ***** BEGIN LICENSE BLOCK *****
// Version: MPL 1.1/GPL 2.0/LGPL 2.1
//
// The contents of this file are subject to the Mozilla Public License Version
// 1.1 (the "License"); you may not use this file except in compliance with
// the License. You may obtain a copy of the License at
// http://www.mozilla.org/MPL/
//
// Software distributed under the License is distributed on an "AS IS" basis,
// WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
// for the specific language governing rights and limitations under the
// License.
//
// The Original Code is Mozilla Corporation Code.
//
// The Initial Developer of the Original Code is
// Mikeal Rogers.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Gary Kwong <nth10sd@gmail.com>
//
// Alternatively, the contents of this file may be used under the terms of
// either the GNU General Public License Version 2 or later (the "GPL"), or
// the GNU Lesser General Public License Version 2.1 or later (the "LGPL"),
// in which case the provisions of the GPL or the LGPL are applicable instead
// of those above. If you wish to allow use of your version of this file only
// under the terms of either the GPL or the LGPL, and not to allow others to
// use your version of this file under the terms of the MPL, indicate your
// decision by deleting the provisions above and replace them with the notice
// and other provisions required by the GPL or the LGPL. If you do not delete
// the provisions above, a recipient may use your version of this file under
// the terms of any one of the MPL, the GPL or the LGPL.
//
// ***** END LICENSE BLOCK *****

var EXPORTED_SYMBOLS = [
  "controller",
  "events",
  "utils",
  "elementslib",
  "os",
  "getBrowserController",
  "newBrowserController",
  "getAddonsController",
  "getPreferencesController",
  "newMail3PaneController",
  "getMail3PaneController",
  "wm",
  "platform",
  "getAddrbkController",
  "getMsgComposeController",
  "getDownloadsController",
  "Application",
  "MozMillAsyncTest",
  "cleanQuit",
  "getPlacesController",
  "isMac",
  "isLinux",
  "isWindows",
  "appInfo",
  "locale",
];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

ChromeUtils.import("resource://testing-common/mozmill/init.jsm");
var controller = ChromeUtils.import(
  "resource://testing-common/mozmill/controller.jsm"
);
var events = ChromeUtils.import("resource://testing-common/mozmill/events.jsm");
var utils = ChromeUtils.import("resource://testing-common/mozmill/utils.jsm");
var elementslib = ChromeUtils.import(
  "resource://testing-common/mozmill/elementslib.jsm"
);
var frame = ChromeUtils.import("resource://testing-common/mozmill/frame.jsm");

var os = ChromeUtils.import("resource://testing-common/mozmill/os.jsm");

var platform = os.getPlatform();

var isMac = false;
var isWindows = false;
var isLinux = false;

if (platform == "darwin") {
  isMac = true;
}
if (platform == "winnt") {
  isWindows = true;
}
if (platform == "linux") {
  isLinux = true;
}

var appInfo = Services.appinfo;

var locale = Services.locale.requestedLocale;

var applicationDictionary = {
  "{92650c4d-4b8e-4d2a-b7eb-24ecf4f6b63a}": "SeaMonkey",
  "{3550f703-e582-4d05-9a08-453d09bdfdc6}": "Thunderbird",
};
var Application = applicationDictionary[appInfo.ID];

function cleanQuit() {
  utils.getMethodInWindows("goQuitApplication")();
}

function newBrowserController() {
  return new controller.MozMillController(
    utils.getMethodInWindows("OpenBrowserWindow")()
  );
}

function getBrowserController() {
  var browserWindow = Services.wm.getMostRecentWindow("navigator:browser");
  if (browserWindow == null) {
    return newBrowserController();
  }

  return new controller.MozMillController(browserWindow);
}

function getPlacesController() {
  utils
    .getMethodInWindows("PlacesCommandHook")
    .showPlacesOrganizer("AllBookmarks");
  return new controller.MozMillController(Services.wm.getMostRecentWindow(""));
}

function getAddonsController() {
  if (Application == "SeaMonkey") {
    utils.getMethodInWindows("toEM")();
  } else if (Application == "Thunderbird") {
    utils.getMethodInWindows("openAddonsMgr")();
  } else {
    utils.getMethodInWindows("BrowserOpenAddonsMgr")();
  }
  return new controller.MozMillController(Services.wm.getMostRecentWindow(""));
}

function getDownloadsController() {
  utils.getMethodInWindows("BrowserDownloadsUI")();
  return new controller.MozMillController(Services.wm.getMostRecentWindow(""));
}

function getPreferencesController() {
  if (Application == "Thunderbird") {
    utils.getMethodInWindows("openOptionsDialog")();
  } else {
    utils.getMethodInWindows("openPreferences")();
  }
  // utils.sleep(1000)
  return new controller.MozMillController(Services.wm.getMostRecentWindow(""));
}

// Thunderbird functions
function newMail3PaneController() {
  return new controller.MozMillController(
    utils.getMethodInWindows("toMessengerWindow")()
  );
}

function getMail3PaneController() {
  var mail3PaneWindow = Services.wm.getMostRecentWindow("mail:3pane");
  if (mail3PaneWindow == null) {
    return newMail3PaneController();
  }

  return new controller.MozMillController(mail3PaneWindow);
}

// Thunderbird - Address book window
function newAddrbkController() {
  utils.getMethodInWindows("toAddressBook")();
  utils.sleep(2000);
  var addyWin = Services.wm.getMostRecentWindow("mail:addressbook");
  return new controller.MozMillController(addyWin);
}

function getAddrbkController() {
  var addrbkWindow = Services.wm.getMostRecentWindow("mail:addressbook");
  if (addrbkWindow == null) {
    return newAddrbkController();
  }

  return new controller.MozMillController(addrbkWindow);
}

var MozMillAsyncTest = controller.MozMillAsyncTest;

function timer(name) {
  this.name = name;
  this.timers = {};
  frame.timers.push(this);
  this.actions = [];
}
timer.prototype.start = function(name) {
  this.timers[name].startTime = new Date().getTime();
};
timer.prototype.stop = function(name) {
  var t = this.timers[name];
  t.endTime = new Date().getTime();
  t.totalTime = t.endTime - t.startTime;
};
timer.prototype.end = function() {
  frame.events.fireEvent("timer", this);
  frame.timers.remove(this);
};
