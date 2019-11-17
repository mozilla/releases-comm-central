/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

const EXPORTED_SYMBOLS = ["EnigmailOS"];

const XPCOM_APPINFO = "@mozilla.org/xre/app-info;1";

// const getExecution = EnigmailLazy.loader("enigmail/execution.jsm", "EnigmailExecution");

let operatingSystem = null;

function getOS() {
  if (operatingSystem === null) {
    operatingSystem = Cc[XPCOM_APPINFO].getService(Ci.nsIXULRuntime).OS;
  }
  return operatingSystem;
}

function isDosLike() {
  return getOS() === "WINNT" || getOS() === "OS2";
}

function isMac() {
  return getOS() === "Darwin";
}

function isWin32() {
  return getOS() === "WINNT";
}

var EnigmailOS = {
  /*
   * getOS uses the Mozilla nsIXULRuntime Component to retrieve the OS Target
   *
   * @return   String    - OS Identifier
   */
  getOS: getOS,

  /**
   * isDosLike identifies whether the host computer is MS-DOS based
   *
   * @return    Boolean   - True if local host is MS-DOS based. False otherwise.
   */
  isDosLike: isDosLike(),

  /**
   * isWin32 identifies whether the running system is a Windows (32 or 64 bit) machine
   *
   * @return    Boolean   - True if local host is a Windows machine. False otherwise.
   */
  isWin32: isWin32(),

  /**
   * isMac identifies whether the running system is a Mac
   *
   * @return    Boolean   - True if local host is a derivative of Darwin. False otherwise.
   */
  isMac: isMac(),

  /**
   * get a Windows registry value (string)
   *
   * @param  keyPath String - the path of the registry (e.g. Software\\GNU\\GnuPG)
   * @param  keyName String - the name of the key to get (e.g. InstallDir)
   * @param  rootKey Number - HKLM, HKCU, etc. (according to constants in nsIWindowsRegKey)
   *
   * @return String - the found registry value (or empty string if not found)
   */
  getWinRegistryString: function(keyPath, keyName, rootKey) {
    const registry = Cc["@mozilla.org/windows-registry-key;1"].createInstance(Ci.nsIWindowsRegKey);

    let retval = "";
    try {
      registry.open(rootKey, keyPath, registry.ACCESS_READ);
      retval = registry.readStringValue(keyName);
      registry.close();
    }
    catch (ex) {}

    return retval;
  },

  getNullFile: function() {
    if (this.isDosLike) {
      return "NUL";
    }
    else {
      return "/dev/null";
    }
  }
};
