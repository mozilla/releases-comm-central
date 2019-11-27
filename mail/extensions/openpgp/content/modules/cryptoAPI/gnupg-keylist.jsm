/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/****
   Private sub-module to gnupg.js for handling key lists from GnuPG
 ****/

"use strict";

var EXPORTED_SYMBOLS = ["obtainKeyList", "createKeyObj",
  "getPhotoFileFromGnuPG", "extractSignatures", "getGpgKeyData"
];

const EnigmailTime = ChromeUtils.import("chrome://openpgp/content/modules/time.jsm").EnigmailTime;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailTrust = ChromeUtils.import("chrome://openpgp/content/modules/trust.jsm").EnigmailTrust;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;

// field ID's of key list (as described in the doc/DETAILS file in the GnuPG distribution)
const ENTRY_ID = 0;
const KEY_TRUST_ID = 1;
const KEY_SIZE_ID = 2;
const KEY_ALGO_ID = 3;
const KEY_ID = 4;
const CREATED_ID = 5;
const EXPIRY_ID = 6;
const UID_ID = 7;
const OWNERTRUST_ID = 8;
const USERID_ID = 9;
const SIG_TYPE_ID = 10;
const KEY_USE_FOR_ID = 11;

const ALGO_SYMBOL = {
  1: "RSA",
  2: "RSA",
  3: "RSA",
  16: "ELG",
  17: "DSA",
  18: "ECDH",
  19: "ECDSA",
  20: "ELG",
  22: "EDDSA"
};

const UNKNOWN_SIGNATURE = "[User ID not found]";

const NS_RDONLY = 0x01;
const NS_WRONLY = 0x02;
const NS_CREATE_FILE = 0x08;
const NS_TRUNCATE = 0x20;
const STANDARD_FILE_PERMS = 0o600;

const NS_LOCALFILEOUTPUTSTREAM_CONTRACTID = "@mozilla.org/network/file-output-stream;1";

/**
 * Get key list from GnuPG.
 *
 * @param {Array of String} onlyKeys: only load data for specified key IDs
 *
 * @return {Promise<Array Object>}:
 * key objects as specified in EnigmailKeyObj.constructor
 */
async function obtainKeyList(onlyKeys = null) {
  EnigmailLog.DEBUG("gnupg-keylist.jsm: obtainKeyList()\n");

  let secKeyList = [],
    pubKeyList = [];
  let commonArgs = EnigmailGpg.getStandardArgs(true);
  commonArgs = commonArgs.concat(["--with-fingerprint", "--fixed-list-mode", "--with-colons"]);

  let args = commonArgs.concat(["--list-keys"]);
  if (onlyKeys) {
    args = args.concat(onlyKeys);
  }

  let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, "");
  pubKeyList = res.stdoutData.split(/\n/);

  let keyList = {
    keys: [],
    index: []
  };

  EnigmailLog.DEBUG(`gnupg-keylist.jsm: obtainKeyList: #lines: ${pubKeyList.length}\n`);
  if (pubKeyList.length > 0) {
    appendKeyItems(pubKeyList, keyList);

    args = commonArgs.concat(["--list-secret-keys"]);
    if (onlyKeys) {
      args = args.concat(onlyKeys);
    }

    res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, "");
    secKeyList = res.stdoutData.split(/\n/);
    appendKeyItems(secKeyList, keyList);
  }

  return keyList;
}


/**
 * Append key objects to a given key cache
 *
 * @param keyListString: array of |string| formatted output from GnuPG for key listing
 * @param keyList:    |object| holding the resulting key list
 *                         obj.keyList:     Array holding key objects
 *                         obj.keySortList: Array holding values to make sorting easier
 *
 * no return value
 */
function appendKeyItems(keyListString, keyList) {
  EnigmailLog.DEBUG("gnupg-keylist.jsm: appendKeyItems()\n");
  let keyObj = {};
  let uatNum = 0; // counter for photos (counts per key)

  const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

  for (let i = 0; i < keyListString.length; i++) {
    let listRow = keyListString[i].split(/:/);
    if (listRow.length === 0) continue;

    switch (listRow[ENTRY_ID]) {
      case "pub":
        keyObj = createKeyObj(listRow);
        uatNum = 0;
        keyList.keys.push(keyObj);
        keyList.index[keyObj.keyId] = keyObj;
        break;
      case "sec":
        keyObj = keyList.index[listRow[KEY_ID]];
        if (keyObj) {
          keyObj.secretAvailable = true;
          // create a dummy object that is not added to the list since we already have the key
          keyObj = createKeyObj(listRow);
        } else {
          appendUnkownSecretKey(listRow[KEY_ID], keyListString, i, keyList);
          keyObj = keyList.index[listRow[KEY_ID]];
          keyObj.secretAvailable = true;
        }
        break;
      case "fpr":
        // only take first fpr line, this is the fingerprint of the primary key and what we want
        if (keyObj.fpr === "") {
          keyObj.fpr = listRow[USERID_ID];
        }
        break;
      case "uid":
        if (listRow[USERID_ID].length === 0) {
          listRow[USERID_ID] = "-";
        }
        if (typeof(keyObj.userId) !== "string") {
          keyObj.userId = EnigmailData.convertGpgToUnicode(listRow[USERID_ID]);
          if (TRUSTLEVELS_SORTED.indexOf(listRow[KEY_TRUST_ID]) < TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust)) {
            // reduce key trust if primary UID is less trusted than public key
            keyObj.keyTrust = listRow[KEY_TRUST_ID];
          }
        }

        keyObj.userIds.push({
          userId: EnigmailData.convertGpgToUnicode(listRow[USERID_ID]),
          keyTrust: listRow[KEY_TRUST_ID],
          uidFpr: listRow[UID_ID],
          type: "uid"
        });

        break;
      case "sub":
        keyObj.subKeys.push({
          keyId: listRow[KEY_ID],
          expiry: EnigmailTime.getDateTime(listRow[EXPIRY_ID], true, false),
          expiryTime: Number(listRow[EXPIRY_ID]),
          keyTrust: listRow[KEY_TRUST_ID],
          keyUseFor: listRow[KEY_USE_FOR_ID],
          keySize: listRow[KEY_SIZE_ID],
          algoSym: ALGO_SYMBOL[listRow[KEY_ALGO_ID]],
          created: EnigmailTime.getDateTime(listRow[CREATED_ID], true, false),
          keyCreated: Number(listRow[CREATED_ID]),
          type: "sub"
        });
        break;
      case "uat":
        if (listRow[USERID_ID].indexOf("1 ") === 0) {
          const userId = EnigmailLocale.getString("userAtt.photo");
          keyObj.userIds.push({
            userId: userId,
            keyTrust: listRow[KEY_TRUST_ID],
            uidFpr: listRow[UID_ID],
            type: "uat",
            uatNum: uatNum
          });
          keyObj.photoAvailable = true;
          ++uatNum;
        }
        break;
    }
  }
}

function createKeyObj(lineArr) {
  let keyObj = {};
  if (lineArr[ENTRY_ID] === "pub" || lineArr[ENTRY_ID] === "sec") {
    keyObj.keyId = lineArr[KEY_ID];
    keyObj.expiryTime = Number(lineArr[EXPIRY_ID]);
    keyObj.created = EnigmailTime.getDateTime(lineArr[CREATED_ID], true, false);
    keyObj.keyCreated = Number(lineArr[CREATED_ID]);
    keyObj.keyTrust = lineArr[KEY_TRUST_ID];
    keyObj.keyUseFor = lineArr[KEY_USE_FOR_ID];
    keyObj.ownerTrust = lineArr[OWNERTRUST_ID];
    keyObj.algoSym = ALGO_SYMBOL[lineArr[KEY_ALGO_ID]];
    keyObj.keySize = lineArr[KEY_SIZE_ID];
    keyObj.userIds = [];
    keyObj.subKeys = [];
    keyObj.fpr = "";
    keyObj.userId = null;
    keyObj.photoAvailable = false;
  } else if (lineArr[ENTRY_ID] === "grp") {
    keyObj.keyUseFor = "G";
    keyObj.userIds = [];
    keyObj.subKeys = [];
  }
  keyObj.type = lineArr[ENTRY_ID];

  return keyObj;
}


/**
 * Handle secret keys for which gpg 2.0 does not create a public key record
 */
function appendUnkownSecretKey(keyId, aKeyList, startIndex, keyList) {
  EnigmailLog.DEBUG(`gnupg-keylist.jsm: appendUnkownSecretKey: keyId: ${keyId}\n`);

  let keyListStr = [];

  for (let j = startIndex; j < aKeyList.length && (j === startIndex || aKeyList[j].substr(0, 4) !== "sec:"); j++) {
    keyListStr.push(aKeyList[j]);
  }

  // make the listing a "public" key
  keyListStr[0] = keyListStr[0].replace(/^sec:/, "pub:");

  appendKeyItems(keyListStr, keyList);
}


/**
 * Extract a photo ID from a key, store it as file and return the file object.
 
 * @param {String} keyId:       Key ID / fingerprint
 * @param {Number} photoNumber: number of the photo on the key, starting with 0
 *
 * @return {Promise<nsIFile>} object or null in case no data / error.
 */
async function getPhotoFileFromGnuPG(keyId, photoNumber) {
  EnigmailLog.DEBUG(`gnupg-keylist.jsm: getPhotoFileFromGnuPG, keyId=${keyId} photoNumber=${photoNumber}\n`);

  const GPG_ADDITIONAL_OPTIONS = ["--no-secmem-warning", "--no-verbose", "--no-auto-check-trustdb",
    "--batch", "--no-tty", "--no-verbose", "--status-fd", "1", "--attribute-fd", "2",
    "--fixed-list-mode", "--list-keys", keyId
  ];
  const args = EnigmailGpg.getStandardArgs(false).concat(GPG_ADDITIONAL_OPTIONS);

  let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args);
  let photoData = res.stderrData;
  let outputTxt = res.stdoutData;

  if (!outputTxt || !photoData) {
    return null;
  }

  if (EnigmailOS.isDosLike && EnigmailGpg.getGpgFeature("windows-photoid-bug")) {
    // workaround for error in gpg
    photoData = photoData.replace(/\r\n/g, "\n");
  }

  // [GNUPG:] ATTRIBUTE A053069284158FC1E6770BDB57C9EB602B0717E2 2985
  let foundPicture = -1;
  let skipData = 0;
  let imgSize = -1;
  const statusLines = outputTxt.split(/[\n\r+]/);

  for (let i = 0; i < statusLines.length; i++) {
    const matches = statusLines[i].match(/\[GNUPG:\] ATTRIBUTE ([A-F\d]+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+) (\d+)/);
    if (matches && matches[3] == "1") {
      // attribute is an image
      foundPicture++;
      if (foundPicture === photoNumber) {
        imgSize = Number(matches[2]);
        break;
      } else {
        skipData += Number(matches[2]);
      }
    }
  }

  if (foundPicture >= 0 && foundPicture === photoNumber) {
    if (photoData.search(/^gpg: /) === 0) {
      // skip disturbing gpg output
      let i = photoData.search(/\n/) + 1;
      skipData += i;
    }

    const pictureData = photoData.substr(16 + skipData, imgSize);
    if (!pictureData.length) {
      return null;
    }

    try {
      const flags = NS_WRONLY | NS_CREATE_FILE | NS_TRUNCATE;
      const picFile = EnigmailFiles.getTempDirObj();

      picFile.append(keyId + ".jpg");
      picFile.createUnique(picFile.NORMAL_FILE_TYPE, STANDARD_FILE_PERMS);

      const fileStream = Cc[NS_LOCALFILEOUTPUTSTREAM_CONTRACTID].createInstance(Ci.nsIFileOutputStream);
      fileStream.init(picFile, flags, STANDARD_FILE_PERMS, 0);
      if (fileStream.write(pictureData, pictureData.length) !== pictureData.length) {
        fileStream.close();
        throw Components.results.NS_ERROR_FAILURE;
      }

      fileStream.flush();
      fileStream.close();

      // delete picFile upon exit
      let extAppLauncher = Cc["@mozilla.org/mime;1"].getService(Ci.nsPIExternalAppLauncher);
      extAppLauncher.deleteTemporaryFileOnExit(picFile);
      return picFile;
    } catch (ex) {}
  }
  return null;
}


/**
 * Return signatures for a given key list
 *
 * @param {String} gpgKeyList         Output from gpg such as produced by getKeySig()
 *                                    Only the first public key is processed!
 * @param {Boolean} ignoreUnknownUid  true if unknown signer's UIDs should be filtered out
 *
 * @return {Array of Object}:
 *     - uid
 *     - uidLabel
 *     - creationDate
 *     - sigList: [uid, creationDate, signerKeyId, sigType ]
 */

function extractSignatures(gpgKeyList, ignoreUnknownUid) {
  EnigmailLog.DEBUG("gnupg.js: extractSignatures\n");

  var listObj = {};

  let havePub = false;
  let currUid = "",
    keyId = "",
    fpr = "";

  const lineArr = gpgKeyList.split(/\n/);
  for (let i = 0; i < lineArr.length; i++) {
    // process lines such as:
    //  tru::1:1395895453:1442881280:3:1:5
    //  pub:f:4096:1:C1B875ED336XX959:2299509307:1546189300::f:::scaESCA:
    //  fpr:::::::::102A1C8CC524A966849C33D7C8B157EA336XX959:
    //  uid:f::::1388511201::67D5B96DC564598D4D4D9E0E89F5B83C9931A154::Joe Fox <joe@fox.com>:
    //  sig:::1:C8B157EA336XX959:2299509307::::Joe Fox <joe@fox.com>:13x:::::2:
    //  sub:e:2048:1:B214734F0F5C7041:1316219469:1199912694:::::e:
    //  sub:f:2048:1:70E7A471DABE08B0:1316221524:1546189300:::::s:
    const lineTokens = lineArr[i].split(/:/);
    switch (lineTokens[ENTRY_ID]) {
      case "pub":
        if (havePub) {
          return listObj;
        }
        havePub = true;
        keyId = lineTokens[KEY_ID];
        break;
      case "fpr":
        if (fpr === "")
          fpr = lineTokens[USERID_ID];
        break;
      case "uid":
      case "uat":
        currUid = lineTokens[UID_ID];
        listObj[currUid] = {
          userId: lineTokens[ENTRY_ID] == "uat" ? EnigmailLocale.getString("keyring.photo") : EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
          rawUserId: lineTokens[USERID_ID],
          keyId: keyId,
          fpr: fpr,
          created: EnigmailTime.getDateTime(lineTokens[CREATED_ID], true, false),
          sigList: []
        };
        break;
      case "sig":
        if (lineTokens[SIG_TYPE_ID].substr(0, 2).toLowerCase() !== "1f") {
          // ignrore revoked signature

          let sig = {
            userId: EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
            created: EnigmailTime.getDateTime(lineTokens[CREATED_ID], true, false),
            signerKeyId: lineTokens[KEY_ID],
            sigType: lineTokens[SIG_TYPE_ID],
            sigKnown: lineTokens[USERID_ID] != UNKNOWN_SIGNATURE
          };

          if (!ignoreUnknownUid || sig.userId != UNKNOWN_SIGNATURE) {
            listObj[currUid].sigList.push(sig);
          }
        }
        break;
    }
  }

  return listObj;
}


async function getGpgKeyData(armorKeyString) {
  EnigmailLog.DEBUG("gnupg.js: getGpgKeyData()\n");

  if (!EnigmailGpg.getGpgFeature("supports-show-only")) {
    throw "unsupported";
  }

  let args = EnigmailGpg.getStandardArgs(false).concat(["--no-tty", "--batch", "--no-verbose", "--with-fingerprint", "--with-colons", "--import-options", "import-show", "--dry-run", "--import"]);

  let res = await EnigmailExecution.execAsync(EnigmailGpg.agentPath, args, armorKeyString);
  let lines = res.stdoutData.split(/\n/);

  let key = {};
  let keyId = "";
  let keyList = [];
  /*
  pub:u:256:22:84F83BE88C892606:1525969855:1683649855::u:::scESC:::::ed25519:::0:
  fpr:::::::::AFE1B65C5F39ACA7960B22CD84F83BE88C892606:
  uid:u::::1525969914::22DB32406212400B52CDC74DA2B33418637430F1::Patrick (ECC) <patrick@enigmail.net>::::::::::0:
  uid:u::::1525969855::F70B7A77F085AA7BA003D6AFAB6FF0DB1FC901B0::enigmail <patrick@enigmail.net>::::::::::0:
  sub:u:256:18:329DAB3350400C40:1525969855:1683649855:::::e:::::cv25519::
  fpr:::::::::3B154538D4DFAA19BDADAAD0329DAB3350400C40:
  */

  for (let i = 0; i < lines.length; i++) {
    const lineTokens = lines[i].split(/:/);

    switch (lineTokens[ENTRY_ID]) {
      case "pub":
      case "sec":
        key = {
          id: lineTokens[KEY_ID],
          fpr: null,
          name: null,
          isSecret: false,
          created: EnigmailTime.getDateTime(lineTokens[CREATED_ID], true, false),
          uids: []
        };

        if (!(key.id in keyList)) {
          keyList[key.id] = key;
        }

        if (lineTokens[ENTRY_ID] === "sec") {
          keyList[key.id].isSecret = true;
        }
        break;
      case "fpr":
        if (!key.fpr) {
          key.fpr = lineTokens[USERID_ID];
        }
        break;
      case "uid":
        if (!key.name) {
          key.name = lineTokens[USERID_ID];
        }
        else {
          key.uids.push(lineTokens[USERID_ID]);
        }
        break;
      case "rvs":
      case "rvk":
        keyId = lineTokens[KEY_ID];
        if (keyId in keyList) {
          keyList[keyId].revoke = true;
        } else {
          keyList[keyId] = {
            revoke: true,
            id: keyId
          };
        }
        break;
    }
  }

  return keyList;
}
