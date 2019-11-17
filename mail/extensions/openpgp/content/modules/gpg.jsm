/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */


"use strict";

const EXPORTED_SYMBOLS = ["EnigmailGpg"];





const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailPrefs = ChromeUtils.import("chrome://openpgp/content/modules/prefs.jsm").EnigmailPrefs;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const subprocess = ChromeUtils.import("chrome://openpgp/content/modules/subprocess.jsm").subprocess;
const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailVersioning = ChromeUtils.import("chrome://openpgp/content/modules/versioning.jsm").EnigmailVersioning;
const EnigmailLazy = ChromeUtils.import("chrome://openpgp/content/modules/lazy.jsm").EnigmailLazy;
const getGpgAgent = EnigmailLazy.loader("enigmail/gpgAgent.jsm", "EnigmailGpgAgent");
const getDialog = EnigmailLazy.loader("enigmail/dialog.jsm", "EnigmailDialog");

const MINIMUM_GPG_VERSION = "2.0.14";
const GPG_BATCH_OPT_LIST = ["--batch", "--no-tty", "--no-verbose", "--status-fd", "2"];

function pushTrimmedStr(arr, str, splitStr) {
  // Helper function for pushing a string without leading/trailing spaces
  // to an array
  str = str.replace(/^ */, "").replace(/ *$/, "");
  if (str.length > 0) {
    if (splitStr) {
      const tmpArr = str.split(/[\t ]+/);
      for (let i = 0; i < tmpArr.length; i++) {
        arr.push(tmpArr[i]);
      }
    } else {
      arr.push(str);
    }
  }
  return (str.length > 0);
}

function getDirmngrTorStatus(exitCodeObj) {
  const command = getGpgAgent().resolveToolPath("gpg-connect-agent");
  if (command === null) {
    return null;
  }

  const args = ["--dirmngr"];

  EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

  let stdout = "";
  try {
    exitCodeObj.value = subprocess.call({
      command: command,
      arguments: args,
      environment: EnigmailCore.getEnvList(),
      stdin: function(stdin) {
        stdin.write("GETINFO tor\r\n");
        stdin.write("bye\r\n");
        stdin.write("\r\n");
        stdin.close();
      },
      stdout: function(data) {
        stdout += data;
      }
    }).wait();
  } catch (ex) {
    exitCodeObj.value = -1;
    EnigmailLog.DEBUG("enigmail> DONE with FAILURE\n");
  }

  return stdout;
}

function dirmngrConfiguredWithTor() {
  if (!EnigmailGpg.getGpgFeature("supports-dirmngr")) return false;

  const exitCodeObj = {
    value: null
  };
  const output = getDirmngrTorStatus(exitCodeObj);

  if (output === null || exitCodeObj.value < 0) {
    return false;
  }
  return output.match(/Tor mode is enabled/) !== null;
}

var EnigmailGpg = {
  agentVersion: "",
  _agentPath: null,

  get agentPath() {
    return this._agentPath;
  },

  setAgentPath: function(path) {
    this._agentPath = path;
  },

  /**
   * return the minimum version of GnuPG that is supported by Enigmail
   */
  getMinimumGpgVersion: function() {
    return MINIMUM_GPG_VERSION;
  },

  /***
   determine if a specific feature is available in the GnuPG version used

   @param featureName:  String; one of the following values:
   version-supported    - is the gpg version supported at all (true for gpg >= 2.0.10)
   supports-gpg-agent   - is gpg-agent is auto-started (true for gpg >= 2.0.16)
   keygen-passphrase    - can the passphrase be specified when generating keys (false for gpg 2.1 and 2.1.1)
   windows-photoid-bug  - is there a bug in gpg with the output of photoid on Windows (true for gpg < 2.0.16)
   genkey-no-protection - is "%no-protection" supported for generting keys (true for gpg >= 2.1)
   search-keys-cmd      - what command to use to terminate the --search-key operation. ("save" for gpg > 2.1; "quit" otherwise)
   socks-on-windows     - is SOCKS proxy supported on Windows (true for gpg >= 2.0.20)
   supports-dirmngr     - is dirmngr supported (true for gpg >= 2.1)
   supports-ecc-keys    - are ECC (elliptic curve) keys supported (true for gpg >= 2.1)
   supports-sender      - does gnupg understand the --sender argument (true for gpg >= 2.1.15)
   supports-wkd         - does gpg support wkd (web key directory) (true for gpg >= 2.1.19)
   export-result        - does gpg print EXPORTED when exporting keys (true for gpg >= 2.1.10)
   decryption-info      - does gpg print DECRYPTION_INFO (true for gpg >= 2.0.19)
   export-specific-uid  - does gpg support exporting a key with a specific UID (true for gpg >= 2.2.8)
   supports-show-only   - does gpg support --import-options show-only (true for gpg >= 2.1.14)
   handles-huge-keys    - can gpg deal with huge keys without aborting (true for gpg >= 2.2.17)

   @return: depending on featureName - Boolean unless specified differently:
   (true if feature is available / false otherwise)
   If the feature cannot be found, undefined is returned
   */
  getGpgFeature: function(featureName) {
    let gpgVersion = EnigmailGpg.agentVersion;

    if (!gpgVersion || typeof(gpgVersion) != "string" || gpgVersion.length === 0) {
      return undefined;
    }

    gpgVersion = gpgVersion.replace(/-.*$/, "");
    if (gpgVersion.search(/^\d+\.\d+/) < 0) {
      // not a valid version number
      return undefined;
    }

    switch (featureName) {
      case "version-supported":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, MINIMUM_GPG_VERSION);
      case "supports-gpg-agent":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.0.16");
      case "keygen-passphrase":
        return EnigmailVersioning.lessThan(gpgVersion, "2.1") || EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.1.2");
      case "genkey-no-protection":
        return EnigmailVersioning.greaterThan(gpgVersion, "2.1");
      case "windows-photoid-bug":
        return EnigmailVersioning.lessThan(gpgVersion, "2.0.16");
      case "supports-dirmngr":
        return EnigmailVersioning.greaterThan(gpgVersion, "2.1");
      case "supports-ecc-keys":
        return EnigmailVersioning.greaterThan(gpgVersion, "2.1");
      case "socks-on-windows":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.0.20");
      case "search-keys-cmd":
        // returns a string
        if (EnigmailVersioning.greaterThan(gpgVersion, "2.1")) {
          return "save";
        } else
          return "quit";
      case "supports-sender":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.1.15");
      case "export-result":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.1.10");
      case "decryption-info":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.0.19");
      case "supports-wkd":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.1.19");
      case "export-specific-uid":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.2.9");
      case "supports-show-only":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.1.14");
      case "handles-huge-keys":
        return EnigmailVersioning.greaterThanOrEqual(gpgVersion, "2.2.17");
    }

    return undefined;
  },

  /**
   * get the standard arguments to pass to every GnuPG subprocess
   *
   * @withBatchOpts: Boolean - true: use --batch and some more options
   *                           false: don't use --batch and co.
   *
   * @return: Array of String - the list of arguments
   */
  getStandardArgs: function(withBatchOpts) {
    // return the arguments to pass to every GnuPG subprocess
    let r = ["--charset", "utf-8", "--display-charset", "utf-8", "--no-auto-check-trustdb"]; // mandatory parameters to add in all cases

    try {
      let p = EnigmailPrefs.getPref("agentAdditionalParam").replace(/\\\\/g, "\\");

      let i = 0;
      let last = 0;
      let foundSign = "";
      let startQuote = -1;

      while ((i = p.substr(last).search(/['"]/)) >= 0) {
        if (startQuote == -1) {
          startQuote = i;
          foundSign = p.substr(last).charAt(i);
          last = i + 1;
        } else if (p.substr(last).charAt(i) == foundSign) {
          // found enquoted part
          if (startQuote > 1) pushTrimmedStr(r, p.substr(0, startQuote), true);

          pushTrimmedStr(r, p.substr(startQuote + 1, last + i - startQuote - 1), false);
          p = p.substr(last + i + 1);
          last = 0;
          startQuote = -1;
          foundSign = "";
        } else {
          last = last + i + 1;
        }
      }

      pushTrimmedStr(r, p, true);
    } catch (ex) {}


    if (withBatchOpts) {
      r = r.concat(GPG_BATCH_OPT_LIST);
    }

    return r;
  },

  // returns the output of --with-colons --list-config
  getGnupgConfig: function(exitCodeObj, errorMsgObj) {
    if (!EnigmailGpg.agentPath) {
      exitCodeObj.value = 0;
      return "";
    }

    const args = EnigmailGpg.getStandardArgs(true).
    concat(["--fixed-list-mode", "--with-colons", "--list-config"]);

    const statusMsgObj = {};
    const cmdErrorMsgObj = {};
    const statusFlagsObj = {};

    const listText = EnigmailExecution.execCmd(EnigmailGpg.agentPath, args, "", exitCodeObj, statusFlagsObj, statusMsgObj, cmdErrorMsgObj);

    if (exitCodeObj.value !== 0) {
      errorMsgObj.value = EnigmailLocale.getString("badCommand");
      if (cmdErrorMsgObj.value) {
        errorMsgObj.value += "\n" + EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
        errorMsgObj.value += "\n" + cmdErrorMsgObj.value;
      }

      return "";
    }

    return listText.replace(/(\r\n|\r)/g, "\n");
  },

  /**
   * return an array containing the aliases and the email addresses
   * of groups defined in gpg.conf
   *
   * @return: array of objects with the following properties:
   *  - alias: group name as used by GnuPG
   *  - keylist: list of keys (any form that GnuPG accepts), separated by ";"
   *
   * (see docu for gnupg parameter --group)
   */
  getGpgGroups: function() {
    const exitCodeObj = {};
    const errorMsgObj = {};

    const cfgStr = EnigmailGpg.getGnupgConfig(exitCodeObj, errorMsgObj);

    if (exitCodeObj.value !== 0) {
      getDialog().alert(errorMsgObj.value);
      return null;
    }

    const groups = [];
    const cfg = cfgStr.split(/\n/);

    for (let i = 0; i < cfg.length; i++) {
      if (cfg[i].indexOf("cfg:group") === 0) {
        const groupArr = cfg[i].split(/:/);
        groups.push({
          alias: groupArr[2],
          keylist: groupArr[3]
        });
      }
    }

    return groups;
  },

  /**
   * Force GnuPG to recalculate the trust db. This is sometimes required after importing keys.
   *
   * no return value
   */
  recalcTrustDb: function() {
    EnigmailLog.DEBUG("enigmailCommon.jsm: recalcTrustDb:\n");

    const command = EnigmailGpg.agentPath;
    const args = EnigmailGpg.getStandardArgs(false).
    concat(["--check-trustdb"]);

    try {
      const proc = subprocess.call({
        command: EnigmailGpg.agentPath,
        arguments: args,
        environment: EnigmailCore.getEnvList(),
        charset: null,
        mergeStderr: false
      });
      proc.wait();
    } catch (ex) {
      EnigmailLog.ERROR("enigmailCommon.jsm: recalcTrustDb: subprocess.call failed with '" + ex.toString() + "'\n");
      throw ex;
    }
  },

  signingAlgIdToString: function(id) {
    // RFC 4880 Sec. 9.1, RFC 6637 Sec. 5 and draft-koch-eddsa-for-openpgp-03 Sec. 8
    switch (parseInt(id, 10)) {
      case 1:
      case 2:
      case 3:
        return "RSA";
      case 16:
        return "Elgamal";
      case 17:
        return "DSA";
      case 18:
        return "ECDH";
      case 19:
        return "ECDSA";
      case 20:
        return "ELG";
      case 22:
        return "EDDSA";
      default:
        return EnigmailLocale.getString("unknownSigningAlg", [parseInt(id, 10)]);
    }
  },

  hashAlgIdToString: function(id) {
    // RFC 4880 Sec. 9.4
    switch (parseInt(id, 10)) {
      case 1:
        return "MD5";
      case 2:
        return "SHA-1";
      case 3:
        return "RIPE-MD/160";
      case 8:
        return "SHA256";
      case 9:
        return "SHA384";
      case 10:
        return "SHA512";
      case 11:
        return "SHA224";
      default:
        return EnigmailLocale.getString("unknownHashAlg", [parseInt(id, 10)]);
    }
  },

  /**
   * For versions of GPG 2.1 and higher, checks to see if the dirmngr is configured to use Tor
   *
   * @return    Boolean     - True if dirmngr is configured with Tor. False otherwise
   */
  dirmngrConfiguredWithTor: dirmngrConfiguredWithTor
};