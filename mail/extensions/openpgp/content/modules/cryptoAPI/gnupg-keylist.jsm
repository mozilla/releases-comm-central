/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/.
 */

/****
   Private sub-module to GnuPGCryptoAPI.jsm for handling key lists from GnuPG
 ****/

"use strict";

var EXPORTED_SYMBOLS = [
  "obtainKeyList",
  "getPhotoFileFromGnuPG",
  "extractSignatures",
  "getGpgKeyData",
];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailData: "chrome://openpgp/content/modules/data.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailTrust: "chrome://openpgp/content/modules/trust.jsm",
  Services: "resource://gre/modules/Services.jsm",
});

XPCOMUtils.defineLazyGetter(this, "l10n", () => {
  return new Localization(["messenger/openpgp/openpgp.ftl"], true);
});

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
  22: "EDDSA",
};

const UNKNOWN_SIGNATURE = "[User ID not found]";

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
  throw new Error("Not implemented");
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
async function appendKeyItems(keyListString, keyList) {
  EnigmailLog.DEBUG("gnupg-keylist.jsm: appendKeyItems()\n");
  let keyObj = {};
  let uatNum = 0; // counter for photos (counts per key)

  const TRUSTLEVELS_SORTED = EnigmailTrust.trustLevelsSorted();

  for (let i = 0; i < keyListString.length; i++) {
    let listRow = keyListString[i].split(/:/);
    if (listRow.length === 0) {
      continue;
    }

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
        if (typeof keyObj.userId !== "string") {
          keyObj.userId = EnigmailData.convertGpgToUnicode(listRow[USERID_ID]);
          if (
            TRUSTLEVELS_SORTED.indexOf(listRow[KEY_TRUST_ID]) <
            TRUSTLEVELS_SORTED.indexOf(keyObj.keyTrust)
          ) {
            // reduce key trust if primary UID is less trusted than public key
            keyObj.keyTrust = listRow[KEY_TRUST_ID];
          }
        }

        keyObj.userIds.push({
          userId: EnigmailData.convertGpgToUnicode(listRow[USERID_ID]),
          keyTrust: listRow[KEY_TRUST_ID],
          uidFpr: listRow[UID_ID],
          type: "uid",
        });

        break;
      case "sub":
        let formatter = new Services.intl.DateTimeFormat();
        keyObj.subKeys.push({
          keyId: listRow[KEY_ID],
          expiry: listRow[EXPIRY_ID]
            ? formatter.format(new Date(listRow[EXPIRY_ID] * 1000))
            : "",
          expiryTime: Number(listRow[EXPIRY_ID]),
          keyTrust: listRow[KEY_TRUST_ID],
          keyUseFor: listRow[KEY_USE_FOR_ID],
          keySize: listRow[KEY_SIZE_ID],
          algoSym: ALGO_SYMBOL[listRow[KEY_ALGO_ID]],
          created: formatter.format(new Date(listRow[CREATED_ID] * 1000)),
          keyCreated: Number(listRow[CREATED_ID]),
          type: "sub",
        });
        break;
      case "uat":
        if (listRow[USERID_ID].indexOf("1 ") === 0) {
          const userId = await l10n.formatValue("user-att-photo");
          keyObj.userIds.push({
            userId,
            keyTrust: listRow[KEY_TRUST_ID],
            uidFpr: listRow[UID_ID],
            type: "uat",
            uatNum,
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
    keyObj.created = new Services.intl.DateTimeFormat().format(
      new Date(lineArr[CREATED_ID] * 1000)
    );
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
  EnigmailLog.DEBUG(
    `gnupg-keylist.jsm: appendUnkownSecretKey: keyId: ${keyId}\n`
  );

  let keyListStr = [];

  for (
    let j = startIndex;
    j < aKeyList.length &&
    (j === startIndex || aKeyList[j].substr(0, 4) !== "sec:");
    j++
  ) {
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
  EnigmailLog.DEBUG(
    `gnupg-keylist.jsm: getPhotoFileFromGnuPG, keyId=${keyId} photoNumber=${photoNumber}\n`
  );
  throw new Error("Not implemented");
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
  EnigmailLog.DEBUG("GnuPGCryptoAPI.jsm: extractSignatures\n");

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
        if (fpr === "") {
          fpr = lineTokens[USERID_ID];
        }
        break;
      case "uid":
      case "uat":
        currUid = lineTokens[UID_ID];
        listObj[currUid] = {
          userId:
            lineTokens[ENTRY_ID] == "uat"
              ? l10n.formatValueSync("keyring-photo")
              : EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
          rawUserId: lineTokens[USERID_ID],
          keyId,
          fpr,
          created: new Services.intl.DateTimeFormat().format(
            new Date(lineTokens[CREATED_ID] * 1000)
          ),
          sigList: [],
        };
        break;
      case "sig":
        if (lineTokens[SIG_TYPE_ID].substr(0, 2).toLowerCase() !== "1f") {
          // ignrore revoked signature

          let sig = {
            userId: EnigmailData.convertGpgToUnicode(lineTokens[USERID_ID]),
            created: new Services.intl.DateTimeFormat().format(
              new Date(lineTokens[CREATED_ID] * 1000)
            ),
            signerKeyId: lineTokens[KEY_ID],
            sigType: lineTokens[SIG_TYPE_ID],
            sigKnown: lineTokens[USERID_ID] != UNKNOWN_SIGNATURE,
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
  EnigmailLog.DEBUG("GnuPGCryptoAPI.jsm: getGpgKeyData()\n");
  throw new Error("Not implemented");
}
