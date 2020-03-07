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
// Adam Christian.
// Portions created by the Initial Developer are Copyright (C) 2008
// the Initial Developer. All Rights Reserved.
//
// Contributor(s):
//  Adam Christian <adam.christian@gmail.com>
//  Mikeal Rogers <mikeal.rogers@gmail.com>
//  Henrik Skupin <hskupin@mozilla.com>
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
  "openFile",
  "saveFile",
  "saveAsFile",
  "genBoiler",
  "getFile",
  "Copy",
  "getChromeWindow",
  "getWindows",
  "runEditor",
  "runFile",
  "getWindowByTitle",
  "getWindowByType",
  "getWindowId",
  "tempfile",
  "getMethodInWindows",
  "getPreference",
  "setPreference",
  "sleep",
  "assert",
  "unwrapNode",
  "TimeoutError",
  "waitFor",
];

const { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");

var hwindow = Services.appShell.hiddenDOMWindow;
var uuidgen = Cc["@mozilla.org/uuid-generator;1"].getService(
  Ci.nsIUUIDGenerator
);

function Copy(obj) {
  for (var n in obj) {
    this[n] = obj[n];
  }
}

function getChromeWindow(aWindow) {
  return aWindow.docShell.rootTreeItem.domWindow;
}

function getWindows(type) {
  if (type == undefined) {
    type = "";
  }
  let windows = [...Services.wm.getEnumerator(type)];
  if (type == "") {
    windows.push(hwindow);
  }
  return windows;
}

function getMethodInWindows(methodName) {
  for (var w of getWindows()) {
    if (w[methodName] != undefined) {
      return w[methodName];
    }
  }
  throw new Error(
    "Method with name: '" + methodName + "' is not in any open window."
  );
}

function getWindowByTitle(title) {
  for (var w of getWindows()) {
    if (w.document.title && w.document.title == title) {
      return w;
    }
  }
  return null;
}

function getWindowByType(type) {
  return Services.wm.getMostRecentWindow(type);
}

/**
 * Retrieve the outer window id for the given window
 **/
function getWindowId(aWindow) {
  try {
    // Normally we can retrieve the id via window utils
    return aWindow.windowUtils.outerWindowID;
  } catch (e) {
    // ... but for observer notifications we need another interface
    return aWindow.QueryInterface(Ci.nsISupportsPRUint64).data;
  }
}

function tempfile(appention) {
  if (appention == undefined) {
    appention = "utils.tempfile";
  }
  var tempfile = Services.dirsvc.get("TmpD", Ci.nsIFile);
  tempfile.append(
    uuidgen
      .generateUUID()
      .toString()
      .replace("-", "")
      .replace("{", "")
      .replace("}", "")
  );
  tempfile.create(Ci.nsIFile.DIRECTORY_TYPE, 0o777);
  tempfile.append(appention);
  tempfile.createUnique(Ci.nsIFile.NORMAL_FILE_TYPE, 0o666);
  // do whatever you need to the created file
  return tempfile.clone();
}

function runFile(w) {
  var nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(w, "Select a File", nsIFilePicker.modeOpen);
  fp.appendFilter("JavaScript Files", "*.js");
  fp.open(rv => {
    if (rv != nsIFilePicker.returnOK || !fp.files) {
      return;
    }
    let thefile = fp.file;
    // create the paramObj with a files array attrib
    var paramObj = {};
    paramObj.files = [];
    paramObj.files.push(thefile.path);

    // Move focus to output tab
    // w.document.getElementById('mmtabs').setAttribute("selectedIndex", 2);
    // send it into the JS test framework to run the file
    // jstest.runFromFile(thefile.path);
  });
}

function saveFile(w, content, filename) {
  var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  file.initWithPath(filename);

  // file is nsIFile, data is a string
  var foStream = Cc["@mozilla.org/network/file-output-stream;1"].createInstance(
    Ci.nsIFileOutputStream
  );

  // use 0x02 | 0x10 to open file for appending.
  foStream.init(file, 0x02 | 0x08 | 0x20, 0o666, 0);
  // write, create, truncate
  // In a c file operation, we have no need to set file mode with or operation,
  // directly using "r" or "w" usually.

  foStream.write(content, content.length);
  foStream.close();
}

function saveAsFile(w, content) {
  var nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  fp.init(w, "Select a File", nsIFilePicker.modeSave);
  fp.appendFilter("JavaScript Files", "*.js");

  return new Promise(resolve => {
    fp.open(rv => {
      if (
        (rv != nsIFilePicker.returnOK && rv != nsIFilePicker.returnReplace) ||
        !fp.file
      ) {
        resolve(null);
        return;
      }
      var thefile = fp.file;

      // forcing the user to save as a .js file
      if (!thefile.path.includes(".js")) {
        // define the file interface
        var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
        // point it at the file we want to get at
        file.initWithPath(thefile.path + ".js");
        thefile = file;
      }

      // file is nsIFile, data is a string
      var foStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);

      // use 0x02 | 0x10 to open file for appending.
      foStream.init(thefile, 0x02 | 0x08 | 0x20, 0o666, 0);
      // write, create, truncate
      // In a c file operation, we have no need to set file mode with or operation,
      // directly using "r" or "w" usually.
      foStream.write(content, content.length);
      foStream.close();
      resolve(thefile.path);
    });
  });
}

function openFile(w) {
  // define the interface
  var nsIFilePicker = Ci.nsIFilePicker;
  var fp = Cc["@mozilla.org/filepicker;1"].createInstance(nsIFilePicker);
  // define the file picker window
  fp.init(w, "Select a File", nsIFilePicker.modeOpen);
  fp.appendFilter("JavaScript Files", "*.js");
  return new Promise(resolve => {
    // show the window
    fp.open(rv => {
      if (rv != nsIFilePicker.returnOK || !fp.file) {
        resolve(null);
        return;
      }
      var thefile = fp.file;
      // create the paramObj with a files array attrib
      var data = getFile(thefile.path);
      resolve({ path: thefile.path, data });
    });
  });
}

function getFile(path) {
  // define the file interface
  var file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
  // point it at the file we want to get at
  file.initWithPath(path);
  // define file stream interfaces
  var data = "";
  var fstream = Cc["@mozilla.org/network/file-input-stream;1"].createInstance(
    Ci.nsIFileInputStream
  );
  var sstream = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(
    Ci.nsIScriptableInputStream
  );
  fstream.init(file, -1, 0, 0);
  sstream.init(fstream);

  // pull the contents of the file out
  var str = sstream.read(4096);
  while (str.length > 0) {
    data += str;
    str = sstream.read(4096);
  }

  sstream.close();
  fstream.close();

  // data = data.replace(/\r|\n|\r\n/g, "");
  return data;
}

/**
 * Called to get the state of an individual preference.
 *
 * @param aPrefName     string The preference to get the state of.
 * @param aDefaultValue any    The default value if preference was not found.
 *
 * @returns any The value of the requested preference
 *
 * @see setPref
 * Code by Henrik Skupin: <hskupin@gmail.com>
 */
function getPreference(aPrefName, aDefaultValue) {
  try {
    switch (typeof aDefaultValue) {
      case "boolean":
        return Services.prefs.getBoolPref(aPrefName);
      case "string":
        return Services.prefs.getCharPref(aPrefName);
      case "number":
        return Services.prefs.getIntPref(aPrefName);
      default:
        return Services.prefs.getComplexValue(aPrefName);
    }
  } catch (e) {
    return aDefaultValue;
  }
}

/**
 * Called to set the state of an individual preference.
 *
 * @param aPrefName string The preference to set the state of.
 * @param aValue    any    The value to set the preference to.
 *
 * @returns boolean Returns true if value was successfully set.
 *
 * @see getPref
 * Code by Henrik Skupin: <hskupin@gmail.com>
 */
function setPreference(aName, aValue) {
  try {
    switch (typeof aValue) {
      case "boolean":
        Services.prefs.setBoolPref(aName, aValue);
        break;
      case "string":
        Services.prefs.setCharPref(aName, aValue);
        break;
      case "number":
        Services.prefs.setIntPref(aName, aValue);
        break;
      default:
        Services.prefs.setComplexValue(aName, aValue);
    }
  } catch (e) {
    return false;
  }

  return true;
}

/**
 * Sleep for the given amount of milliseconds
 *
 * @param {number} milliseconds
 *        Sleeps the given number of milliseconds
 */
function sleep(milliseconds) {
  // We basically just call this once after the specified number of milliseconds
  var timeup = false;
  function wait() {
    timeup = true;
  }
  hwindow.setTimeout(wait, milliseconds);

  var thread = Services.tm.currentThread;
  while (!timeup) {
    thread.processNextEvent(true);
  }
}

/**
 * Check if the callback function evaluates to true
 */
function assert(callback, message, thisObject) {
  var result = callback.call(thisObject);

  if (!result) {
    throw new Error(message || "assert: Failed for '" + callback + "'");
  }

  return true;
}

/**
 * TimeoutError
 *
 * Error object used for timeouts
 */
function TimeoutError(message, fileName, lineNumber) {
  var err = new Error();
  if (err.stack) {
    this.stack = err.stack;
  }
  this.message = message === undefined ? err.message : message;
  this.fileName = fileName === undefined ? err.fileName : fileName;
  this.lineNumber = lineNumber === undefined ? err.lineNumber : lineNumber;
}
TimeoutError.prototype = new Error();
TimeoutError.prototype.constructor = TimeoutError;
TimeoutError.prototype.name = "TimeoutError";

/**
 * Waits for the callback evaluates to true
 *
 * @param callback    Function that returns true when the waiting thould end.
 * @param message {string or function}  A message to throw if the callback didn't
 *                                      succeed until the timeout. Use a function
 *                                      if the message is to show some object state
 *                                      after the end of the wait (not before wait).
 * @param timeout     Milliseconds to wait until callback succeeds.
 * @param interval    Milliseconds to 'sleep' between checks of callback.
 * @param thisObject (optional) 'this' to be passed into the callback.
 */
function waitFor(callback, message, timeout, interval, thisObject) {
  timeout = timeout || 5000;
  interval = interval || 100;

  var self = { counter: 0, result: callback.call(thisObject) };

  function wait() {
    self.counter += interval;
    self.result = callback.call(thisObject);
  }

  var timeoutInterval = hwindow.setInterval(wait, interval);
  var thread = Services.tm.currentThread;

  while (!self.result && self.counter < timeout) {
    thread.processNextEvent(true);
  }

  hwindow.clearInterval(timeoutInterval);

  if (self.counter >= timeout) {
    let messageText;
    if (message) {
      if (typeof message === "function") {
        messageText = message();
      } else {
        messageText = message;
      }
    } else {
      messageText = "waitFor: Timeout exceeded for '" + callback + "'";
    }

    throw new TimeoutError(messageText);
  }

  return true;
}
