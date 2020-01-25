/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/****
   Private sub-module to GnuPGCryptoAPI.jsm for handling key import/export
 ****/

"use strict";

var EXPORTED_SYMBOLS = ["GnuPG_importKeyFromFile", "GnuPG_extractSecretKey"];

const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailLocale;


async function GnuPG_importKeyFromFile(inputFile) {
  EnigmailLog.DEBUG("gnupg-key.jsm: importKeysFromFile: fileName=" + inputFile.path + "\n");
  var command = EnigmailGpg.agentPath;
  var args = EnigmailGpg.getStandardArgs(false).concat(["--no-tty", "--batch", "--no-verbose", "--status-fd", "2", "--no-auto-check-trustdb", "--import"]);

  var fileName = EnigmailFiles.getEscapedFilename((inputFile.QueryInterface(Ci.nsIFile)).path);

  args.push(fileName);

  let res = await EnigmailExecution.execAsync(command, args, "");
  let statusMsg = res.statusMsg;

  var keyList = [];
  let importedKeys = [];
  let importSum = 0;
  let importUnchanged = 0;

  // IMPORT_RES <count> <no_user_id> <imported> 0 <unchanged>
  //    <n_uids> <n_subk> <n_sigs> <n_revoc> <sec_read> <sec_imported> <sec_dups> <not_imported>
  if (statusMsg) {
    let import_res = statusMsg.match(/^IMPORT_RES ([0-9]+) ([0-9]+) ([0-9]+) 0 ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+) ([0-9]+)/m);

    if (import_res !== null) {
      let secCount = parseInt(import_res[9], 10); // number of secret keys found
      let secImported = parseInt(import_res[10], 10); // number of secret keys imported
      let secDups = parseInt(import_res[11], 10); // number of secret keys already on the keyring

      if (secCount !== secImported + secDups) {
        res.errorMsg = EnigmailLocale.getString("import.secretKeyImportError");
        res.exitCode = 1;
      }
      else {
        importSum = parseInt(import_res[1], 10);
        importUnchanged = parseInt(import_res[4], 10);
        res.exitCode = 0;
        var statusLines = statusMsg.split(/\r?\n/);

        for (let j = 0; j < statusLines.length; j++) {
          var matches = statusLines[j].match(/IMPORT_OK ([0-9]+) (\w+)/);
          if (matches && (matches.length > 2)) {
            if (typeof (keyList[matches[2]]) != "undefined") {
              keyList[matches[2]] |= Number(matches[1]);
            }
            else
              keyList[matches[2]] = Number(matches[1]);

            importedKeys.push(matches[2]);
            EnigmailLog.DEBUG("gnupg-key.jsm: importKeysFromFile: imported " + matches[2] + ":" + matches[1] + "\n");
          }
        }
      }
    }
  }

  return {
    exitCode: res.exitCode,
    errorMsg: res.errorMsg,
    importedKeys: importedKeys,
    importSum: importSum,
    importUnchanged: importUnchanged
  };
}


async function GnuPG_extractSecretKey(userId, minimalKey) {
  let args = EnigmailGpg.getStandardArgs(true);
  let exitCode = -1,
    errorMsg = "";

  if (minimalKey) {
    args.push("--export-options");
    args.push("export-minimal,no-export-attributes");
  }

  args.push("-a");
  args.push("--export-secret-keys");

  if (userId) {
    args = args.concat(userId.split(/[ ,\t]+/));
  }

  let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, "");

  if (res.stdoutData) {
    exitCode = 0;
  }

  if (exitCode !== 0) {
    if (res.errorMsg) {
      errorMsg = EnigmailFiles.formatCmdLine(EnigmailGpg.agentPath, args);
      errorMsg += "\n" + res.errorMsg;
    }
  }

  return {
    keyData: res.stdoutData,
    exitCode: exitCode,
    errorMsg: errorMsg
  };
}
