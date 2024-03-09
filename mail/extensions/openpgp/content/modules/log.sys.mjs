/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

import { AppConstants } from "resource://gre/modules/AppConstants.sys.mjs";

export var EnigmailLog = {
  level: 3,
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
      newLogDirectory + (AppConstants.platform == "win" ? "\\" : "/");
    EnigmailLog.createLogFiles();
  },

  createLogFiles() {
    if (
      EnigmailLog.directory &&
      !EnigmailLog.fileStream &&
      EnigmailLog.level >= 5
    ) {
      const file = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);
      file.initWithPath(EnigmailLog.directory + "enigdbug.txt");
      const ofStream = Cc[
        "@mozilla.org/network/file-output-stream;1"
      ].createInstance(Ci.nsIFileOutputStream);
      ofStream.init(file, -1, -1, 0);

      EnigmailLog.fileStream = ofStream;
    }
  },

  onShutdown() {
    if (EnigmailLog.fileStream) {
      EnigmailLog.fileStream.close();
    }
    EnigmailLog.fileStream = null;
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
  },

  /**
   *  Log an exception including the stack trace
   *
   *  referenceInfo: String - arbitrary text to write before the exception is logged
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
