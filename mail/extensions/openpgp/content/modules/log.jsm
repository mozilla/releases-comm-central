/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

/* global dump: false */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailLog"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailConsole: "chrome://openpgp/content/modules/pipeConsole.jsm",
  EnigmailFiles: "chrome://openpgp/content/modules/files.jsm",
  EnigmailOS: "chrome://openpgp/content/modules/os.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

const MAX_LOG_LEN = 2500;

var EnigmailLog = {
  level: 3,
  data: null,
  directory: null,
  fileStream: null,

  setLogLevel(newLogLevel) {
    EnigmailLog.level = newLogLevel;
  },

  getLogLevel() {
    return EnigmailLog.level;
  },

  setLogDirectory(newLogDirectory) {
    EnigmailLog.directory =
      newLogDirectory + (EnigmailOS.isDosLike ? "\\" : "/");
    EnigmailLog.createLogFiles();
  },

  createLogFiles() {
    if (
      EnigmailLog.directory &&
      !EnigmailLog.fileStream &&
      EnigmailLog.level >= 5
    ) {
      EnigmailLog.fileStream = EnigmailFiles.createFileStream(
        EnigmailLog.directory + "enigdbug.txt"
      );
    }
  },

  onShutdown() {
    if (EnigmailLog.fileStream) {
      EnigmailLog.fileStream.close();
    }
    EnigmailLog.fileStream = null;
  },

  getLogData(version, prefs) {
    let ioServ = Services.io;

    let oscpu = "";
    let platform = "";

    try {
      let httpHandler = ioServ.getProtocolHandler("http");
      httpHandler = httpHandler.QueryInterface(Ci.nsIHttpProtocolHandler);
      oscpu = httpHandler.oscpu;
      platform = httpHandler.platform;
    } catch (ex) {}

    let data =
      "Enigmail version " +
      version +
      "\n" +
      "OS/CPU=" +
      oscpu +
      "\n" +
      "Platform=" +
      platform +
      "\n" +
      "Non-default preference values:\n";

    let p = prefs.getPrefBranch().getChildList("");

    for (let i in p) {
      if (prefs.getPrefBranch().prefHasUserValue(p[i])) {
        data += p[i] + ": " + prefs.getPref(p[i]) + "\n";
      }
    }

    let otherPref = ["dom.workers.maxPerDomain"];
    let root = prefs.getPrefRoot();
    for (let op of otherPref) {
      try {
        data += op + ": " + root.getIntPref(op) + "\n";
      } catch (ex) {
        data += ex.toString() + "\n";
      }
    }
    return data + "\n" + EnigmailLog.data.join("");
  },

  WRITE(str) {
    function withZeroes(val, digits) {
      return ("0000" + val.toString()).substr(-digits);
    }

    var d = new Date();
    var datStr =
      d.getFullYear() +
      "-" +
      withZeroes(d.getMonth() + 1, 2) +
      "-" +
      withZeroes(d.getDate(), 2) +
      " " +
      withZeroes(d.getHours(), 2) +
      ":" +
      withZeroes(d.getMinutes(), 2) +
      ":" +
      withZeroes(d.getSeconds(), 2) +
      "." +
      withZeroes(d.getMilliseconds(), 3) +
      " ";
    if (EnigmailLog.level >= 4) {
      dump(datStr + str);
    }

    if (EnigmailLog.data === null) {
      EnigmailLog.data = [];
      let appInfo = Services.appinfo;
      EnigmailLog.WRITE(
        "Mozilla Platform: " + appInfo.name + " " + appInfo.version + "\n"
      );
    }
    // truncate first part of log data if it grow too much
    if (EnigmailLog.data.length > MAX_LOG_LEN) {
      EnigmailLog.data.splice(0, 200);
    }

    EnigmailLog.data.push(datStr + str);

    if (EnigmailLog.fileStream) {
      EnigmailLog.fileStream.write(datStr, datStr.length);
      EnigmailLog.fileStream.write(str, str.length);
    }
  },

  DEBUG(str) {
    try {
      EnigmailLog.WRITE("[DEBUG] " + str);
    } catch (ex) {}
  },

  WARNING(str) {
    EnigmailLog.WRITE("[WARN] " + str);
    EnigmailConsole.write(str);
  },

  ERROR(str) {
    try {
      var consoleSvc = Services.console;
      var scriptError = Cc["@mozilla.org/scripterror;1"].createInstance(
        Ci.nsIScriptError
      );
      scriptError.init(
        str,
        null,
        null,
        0,
        0,
        scriptError.errorFlag,
        "Enigmail"
      );
      consoleSvc.logMessage(scriptError);
    } catch (ex) {}

    EnigmailLog.WRITE("[ERROR] " + str);
  },

  CONSOLE(str) {
    if (EnigmailLog.level >= 3) {
      EnigmailLog.WRITE("[CONSOLE] " + str);
    }

    EnigmailConsole.write(str);
  },

  /**
   *  Log an exception including the stack trace
   *
   *  referenceInfo: String - arbitraty text to write before the exception is logged
   *  ex:            exception object
   */
  writeException(referenceInfo, ex) {
    EnigmailLog.ERROR(
      referenceInfo +
        ": caught exception: " +
        ex.name +
        "\n" +
        "Message: '" +
        ex.message +
        "'\n" +
        "File:    " +
        ex.fileName +
        "\n" +
        "Line:    " +
        ex.lineNumber +
        "\n" +
        "Stack:   " +
        ex.stack +
        "\n"
    );
  },
};
