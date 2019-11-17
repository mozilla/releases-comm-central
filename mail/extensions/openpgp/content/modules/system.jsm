/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */


"use strict";

var EXPORTED_SYMBOLS = ["EnigmailSystem"];





const ctypes = ChromeUtils.import("resource://gre/modules/ctypes.jsm").ctypes;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;

var gKernel32Dll = null;
var gSystemCharset = null;

const CODEPAGE_MAPPING = {
  "437": "ISO-8859-1",
  "855": "IBM855",
  "866": "IBM866",
  "874": "ISO-8859-11",
  "932": "Shift_JIS",
  "936": "GB2312",
  "950": "BIG5",
  "1200": "UTF-16LE",
  "1201": "UTF-16BE",
  "1250": "windows-1250",
  "1251": "windows-1251",
  "1252": "windows-1252",
  "1253": "windows-1253",
  "1254": "windows-1254",
  "1255": "windows-1255",
  "1256": "windows-1256",
  "1257": "windows-1257",
  "1258": "windows-1258",
  "20866": "KOI8-R",
  "20932": "EUC-JP",
  "28591": "ISO-8859-1",
  "28592": "ISO-8859-2",
  "28593": "ISO-8859-3",
  "28594": "ISO-8859-4",
  "28595": "ISO-8859-5",
  "28596": "ISO-8859-6",
  "28597": "ISO-8859-7",
  "28598": "ISO-8859-8",
  "28599": "ISO-8859-9",
  "28603": "ISO-8859-13",
  "28605": "ISO-8859-15",
  "38598": "ISO-8859-8",
  "50220": "ISO-2022-JP",
  "50221": "ISO-2022-JP",
  "50222": "ISO-2022-JP",
  "50225": "ISO-2022-KR",
  "50227": "ISO-2022-CN",
  "50229": "ISO-2022-CN",
  "51932": "EUC-JP",
  "51949": "EUC-KR",
  "52936": "HZ-GB2312",
  "65000": "UTF-7",
  "65001": "UTF-8"
};


/**
 * Get the default codepage that is set on Windows (which equals to the chatset of the console output of gpg)
 */
function getWindowsCopdepage() {
  EnigmailLog.DEBUG("system.jsm: getWindowsCopdepage\n");

  if (EnigmailPrefs.getPref("gpgLocaleEn")) {
    return "437";
  }

  let output = "";
  let env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  let sysRoot = env.get("SystemRoot");

  if (!sysRoot || sysRoot.length === 0) {
    sysRoot = "C:\\windows";
  }

  try {
    let p = subprocess.call({
      command: sysRoot + "\\system32\\chcp.com",
      arguments: [],
      environment: [],
      charset: null,
      mergeStderr: false,
      stdout: function(data) {
        output += data;
      }
    });
    p.wait();

    output = output.replace(/[\r\n]/g, "");
    output = output.replace(/^(.*[: ])([0-9]+)([^0-9].*)?$/, "$2");
  }
  catch (ex) {
    output = "437";
  }

  return output;
}

/**
 * Get the charset defined with LC_ALL or locale. That's the charset used by gpg console output
 */
function getUnixCharset() {
  EnigmailLog.DEBUG("system.jsm: getUnixCharset\n");
  let env = Cc["@mozilla.org/process/environment;1"].getService(Ci.nsIEnvironment);
  let lc = env.get("LC_ALL");


  if (lc.length === 0) {
    let places = [
      "/usr/bin/locale",
      "/usr/local/bin/locale",
      "/opt/bin/locale"
    ];
    var localeFile = Cc["@mozilla.org/file/local;1"].createInstance(Ci.nsIFile);

    for (let i = 0; i < places.length; i++) {
      localeFile.initWithPath(places[i]);
      if (localeFile.exists()) break;
    }

    if (!localeFile.exists()) return "utf-8";

    let output = "";

    let p = subprocess.call({
      command: localeFile,
      arguments: [],
      environment: [],
      charset: null,
      mergeStderr: false,
      stdout: function(data) {
        output += data;
      }
    });
    p.wait();

    let m = output.match(/^(LC_ALL=)(.*)$/m);
    if (m && m.length > 2) {
      lc = m[2].replace(/"/g, "");
    }
    else return "utf-8";
  }

  let i = lc.search(/[.@]/);

  if (i < 0) return "utf-8";

  lc = lc.substr(i + 1);

  return lc;

}

function getKernel32Dll() {
  if (!gKernel32Dll) {
    if (EnigmailOS.isWin32) {
      gKernel32Dll = ctypes.open("kernel32.dll");
    }
    else {
      return null;
    }
  }

  return gKernel32Dll;
}


var EnigmailSystem = {

  determineSystemCharset: function() {
    EnigmailLog.DEBUG("system.jsm: determineSystemCharset\n");

    if (!gSystemCharset) {
      if (EnigmailOS.isWin32) {
        gSystemCharset = getWindowsCopdepage();
      }
      else {
        gSystemCharset = getUnixCharset();
      }
    }

    EnigmailLog.DEBUG("system.jsm: determineSystemCharset: charset='" + gSystemCharset + "'\n");
    return gSystemCharset;
  },

  /**
   * Convert system output coming in a native charset into Unicode (Gecko-platfrom)
   * applying an appropriate charset conversion
   *
   * @param str   String - input string in native charset
   * @param cs    String - [Optional] character set (Unix), or codepage (Windows).
   *                       If not specified, determine the system default.
   *
   * @param String - output in Unicode format. If something failed, the unmodified
   *                 input isreturned.
   */

  convertNativeToUnicode: function(str, cs) {
    try {
      if (!cs) cs = this.determineSystemCharset();

      if (EnigmailOS.isWin32) {
        if (cs in CODEPAGE_MAPPING) {
          return EnigmailData.convertToUnicode(str, CODEPAGE_MAPPING[cs]);
        }
        else {
          let charSetNum = Number(cs);
          if (Number.isNaN(charSetNum)) {
            return EnigmailData.convertToUnicode(str, cs);
          }
          else
            return EnigmailData.convertToUnicode(this.winConvertNativeToUnichar(str, Number(cs)), "UTF-8");
        }
      }
      else {
        return EnigmailData.convertToUnicode(str, cs);
      }
    }
    catch (ex) {
      EnigmailLog.DEBUG("system.jsm: convertNativeToUnicode: exception +" + ex.toString() + "\n");

      return str;
    }
  },

  /**
   * Convert from native Windows output (often Codepage 437) to a Mozilla Unichar string
   *
   * @param byteStr: String - the data to convert in the current Windows codepage
   *
   * @return String: the Unicode string directly display-able
   */
  winConvertNativeToUnichar: function(byteStr, codePage) {
    /*
    int MultiByteToWideChar(
    _In_      UINT   CodePage,
    _In_      DWORD  dwFlags,
    _In_      LPCSTR lpMultiByteStr,
    _In_      int    cbMultiByte,
    _Out_opt_ LPWSTR lpWideCharStr,
    _In_      int    cchWideChar
    );
    */

    if (!getKernel32Dll()) {
      return byteStr;
    }

    var multiByteToWideChar = gKernel32Dll.declare("MultiByteToWideChar",
      ctypes.winapi_abi,
      ctypes.int, // return value
      ctypes.unsigned_int, // Codepage
      ctypes.uint32_t, // dwFlags
      ctypes.char.ptr, // input string
      ctypes.int, // cbMultiByte
      ctypes.jschar.ptr, // widechar string
      ctypes.int // ccWideChar
    );

    let n = multiByteToWideChar(codePage, 0, byteStr, byteStr.length, null, 0);

    if (n > 0) {
      let OutStrType = ctypes.jschar.array(n + 1);
      let outStr = new OutStrType();

      multiByteToWideChar(codePage, 0, byteStr, byteStr.length, outStr.addressOfElement(0), n);

      let r = new RegExp(String.fromCharCode(9516), "g");
      return outStr.readString().replace(r, "");

    }
    else
      return byteStr;
  }
};
