/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

"use strict";

/**
 *  Module for dealing with received Autocrypt headers, level 0
 *  See details at https://github.com/mailencrypt/autocrypt
 */

var EXPORTED_SYMBOLS = ["EnigmailAutocrypt"];

//Cu.importGlobalProperties(["crypto"]);

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailArmor: "chrome://openpgp/content/modules/armor.jsm",
  // EnigmailCryptoAPI: "chrome://openpgp/content/modules/cryptoAPI.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  // EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  // EnigmailStdlib: "chrome://openpgp/content/modules/stdlib.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  EnigmailSqliteDb: "chrome://openpgp/content/modules/sqliteDb.jsm",
  // PromiseUtils: "resource://gre/modules/PromiseUtils.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
});

var gCreatedSetupIds = [];

var EnigmailAutocrypt = {
  getKeyFromHeader(fromAddr, headerDataArr) {
    // critical parameters: {param: mandatory}
    const CRITICAL = {
      addr: true,
      keydata: true,
      type: false, // That's actually oboslete according to the Level 1 spec.
    };

    try {
      fromAddr = EnigmailFuncs.stripEmail(fromAddr).toLowerCase();
    } catch (ex) {
      throw new Error("getKeyFromHeader error " + ex);
    }
    let foundTypes = {};
    let paramArr = [];

    for (let hdrNum = 0; hdrNum < headerDataArr.length; hdrNum++) {
      let hdr = headerDataArr[hdrNum].replace(/[\r\n \t]/g, "");
      let k = hdr.search(/keydata=/);
      if (k > 0) {
        let d = hdr.substr(k);
        if (d.search(/"/) < 0) {
          hdr = hdr.replace(/keydata=/, 'keydata="') + '"';
        }
      }

      paramArr = EnigmailMime.getAllParameters(hdr);

      for (let i in CRITICAL) {
        if (CRITICAL[i]) {
          // found mandatory parameter
          if (!(i in paramArr)) {
            EnigmailLog.DEBUG(
              "autocrypt.jsm: getKeyFromHeader: cannot find param '" + i + "'\n"
            );
            return null; // do nothing if not all mandatory parts are present
          }
        }
      }

      paramArr.addr = paramArr.addr.toLowerCase();

      if (fromAddr !== paramArr.addr) {
        EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: from Addr " +
            fromAddr +
            " != " +
            paramArr.addr.toLowerCase() +
            "\n"
        );

        return null;
      }

      if (!("type" in paramArr)) {
        paramArr.type = "1";
      } else {
        paramArr.type = paramArr.type.toLowerCase();
        if (paramArr.type !== "1") {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: getKeyFromHeader: unknown type " +
              paramArr.type +
              "\n"
          );
          return null; // we currently only support 1 (=OpenPGP)
        }
      }

      try {
        atob(paramArr.keydata); // don't need result
      } catch (ex) {
        EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: key is not base64-encoded\n"
        );
        return null;
      }

      if (paramArr.type in foundTypes) {
        EnigmailLog.DEBUG(
          "autocrypt.jsm: getKeyFromHeader: duplicate header for type=" +
            paramArr.type +
            "\n"
        );
        return null; // do not process anything if more than one Autocrypt header for the same type is found
      }

      foundTypes[paramArr.type] = 1;
    }

    return paramArr.keydata;
  },

  /**
   * Process the "Autocrypt:" header and if successful store the update in the database
   *
   * @param {String} fromAddr:               Address of sender (From: header)
   * @param {Array of String} headerDataArr: all instances of the Autocrypt: header found in the message
   * @param {String or Number} dateSent:     "Date:" field of the message as readable string or in seconds after 1970-01-01
   * @param {Boolean} autoCryptEnabled:      if true, autocrypt is enabled for the context of the message
   *
   * @return {Promise<Number>}: success: 0 = success, 1+ = failure
   */
  async processAutocryptHeader(
    fromAddr,
    headerDataArr,
    dateSent,
    autoCryptEnabled = false,
    isGossip = false
  ) {
    EnigmailLog.DEBUG(
      "autocrypt.jsm: processAutocryptHeader(): from=" + fromAddr + "\n"
    );
    let conn;

    try {
      // critical parameters: {param: mandatory}
      const CRITICAL = {
        addr: true,
        keydata: true,
        type: false, // That's actually oboslete according to the Level 1 spec.
        "prefer-encrypt": false,
      };

      try {
        fromAddr = EnigmailFuncs.stripEmail(fromAddr).toLowerCase();
      } catch (ex) {
        throw new Error("processAutocryptHeader error " + ex);
      }
      let foundTypes = {};
      let paramArr = [];

      for (let hdrNum = 0; hdrNum < headerDataArr.length; hdrNum++) {
        let hdr = headerDataArr[hdrNum].replace(/[\r\n \t]/g, "");
        let k = hdr.search(/keydata=/);
        if (k > 0) {
          let d = hdr.substr(k);
          if (d.search(/"/) < 0) {
            hdr = hdr.replace(/keydata=/, 'keydata="') + '"';
          }
        }

        paramArr = EnigmailMime.getAllParameters(hdr);

        for (let i in CRITICAL) {
          if (CRITICAL[i]) {
            // found mandatory parameter
            if (!(i in paramArr)) {
              EnigmailLog.DEBUG(
                "autocrypt.jsm: processAutocryptHeader: cannot find param '" +
                  i +
                  "'\n"
              );
              return 1; // do nothing if not all mandatory parts are present
            }
          }
        }

        for (let i in paramArr) {
          if (i.substr(0, 1) !== "_") {
            if (!(i in CRITICAL)) {
              EnigmailLog.DEBUG(
                "autocrypt.jsm: processAutocryptHeader: unknown critical param " +
                  i +
                  "\n"
              );
              return 2; // do nothing if an unknown critical parameter is found
            }
          }
        }

        paramArr.addr = paramArr.addr.toLowerCase();

        if (fromAddr !== paramArr.addr) {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: processAutocryptHeader: from Addr " +
              fromAddr +
              " != " +
              paramArr.addr.toLowerCase() +
              "\n"
          );

          return 3;
        }

        if (!("type" in paramArr)) {
          paramArr.type = isGossip ? "1g" : "1";
        } else {
          paramArr.type = paramArr.type.toLowerCase();
          if (paramArr.type !== "1") {
            EnigmailLog.DEBUG(
              "autocrypt.jsm: processAutocryptHeader: unknown type " +
                paramArr.type +
                "\n"
            );
            return 4; // we currently only support 1 (=OpenPGP)
          }
        }

        try {
          atob(paramArr.keydata); // don't need result
        } catch (ex) {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: processAutocryptHeader: key is not base64-encoded\n"
          );
          return 5;
        }

        if (paramArr.type in foundTypes) {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: processAutocryptHeader: duplicate header for type=" +
              paramArr.type +
              "\n"
          );
          return 6; // do not process anything if more than one Autocrypt header for the same type is found
        }

        foundTypes[paramArr.type] = 1;
      }

      if (isGossip) {
        paramArr["prefer-encrypt"] = "nopreference";
      }

      if (!("prefer-encrypt" in paramArr)) {
        paramArr["prefer-encrypt"] = "nopreference";
      }

      let lastDate;
      if (typeof dateSent === "string") {
        lastDate = jsmime.headerparser.parseDateHeader(dateSent);
      } else {
        lastDate = new Date(dateSent * 1000);
      }
      let now = new Date();
      if (lastDate > now) {
        lastDate = now;
      }
      paramArr.dateSent = lastDate;

      if (
        "_enigmail_artificial" in paramArr &&
        paramArr._enigmail_artificial === "yes"
      ) {
        if ("_enigmail_fpr" in paramArr) {
          paramArr.fpr = paramArr._enigmail_fpr;
        }

        paramArr.keydata = "";
        paramArr.autocryptDate = 0;
      } else {
        paramArr.autocryptDate = lastDate;
      }

      try {
        conn = await EnigmailSqliteDb.openDatabase();
      } catch (ex) {
        EnigmailLog.DEBUG(
          "autocrypt.jsm: processAutocryptHeader: could not open database\n"
        );
        return 7;
      }

      let resultObj = await findUserRecord(conn, [fromAddr], paramArr.type);
      EnigmailLog.DEBUG("autocrypt.jsm: got " + resultObj.numRows + " rows\n");
      if (resultObj.data.length === 0) {
        await appendUser(conn, paramArr);
      } else {
        await updateUser(conn, paramArr, resultObj.data, autoCryptEnabled);
      }

      EnigmailLog.DEBUG("autocrypt.jsm: OK - closing connection\n");
      conn.close();
      return 0;
    } catch (err) {
      EnigmailLog.DEBUG(
        "autocrypt.jsm: error - closing connection: " + err + "\n"
      );
      conn.close();
      return 8;
    }
  },

  /**
   * Import autocrypt OpenPGP keys into regular keyring for a given list of email addresses
   * @param {Array of String} emailAddr: email addresses
   * @param {Boolean} acceptGossipKeys: import keys received via gossip
   *
   * @return {Promise<Array of keyObj>}
   */
  async importAutocryptKeys(emailAddr, acceptGossipKeys = false) {
    EnigmailLog.DEBUG("autocrypt.jsm: importAutocryptKeys()\n");

    let keyArr = await this.getOpenPGPKeyForEmail(emailAddr);
    if (!keyArr) {
      return [];
    }

    let importedKeys = [];
    let now = new Date();
    let prev = null;

    for (let i = 0; i < keyArr.length; i++) {
      if (
        prev &&
        prev.email === keyArr[i].email &&
        prev.type === "1" &&
        keyArr[i].type === "1g"
      ) {
        // skip if we have "gossip" key preceeded by a "regular" key
        continue;
      }
      if (!acceptGossipKeys && keyArr[i].type === "1g") {
        EnigmailLog.DEBUG(
          `autocrypt.jsm: importAutocryptKeys: skipping gossip key for ${keyArr[i].email}\n`
        );
        continue;
      }

      prev = keyArr[i];
      if ((now - keyArr[i].lastAutocrypt) / (1000 * 60 * 60 * 24) < 366) {
        // only import keys received less than 12 months ago
        try {
          let keyData = atob(keyArr[i].keyData);
          if (keyData.length > 1) {
            importedKeys = await this.applyKeyFromKeydata(
              keyData,
              keyArr[i].email,
              keyArr[i].state,
              keyArr[i].type
            );
          }
        } catch (ex) {
          EnigmailLog.DEBUG(
            "autocrypt.jsm importAutocryptKeys: exception " +
              ex.toString() +
              "\n"
          );
        }
      }
    }

    return importedKeys;
  },

  /**
   * Import given key data and set the per-recipient rule accordingly
   *
   * @param {String} keyData - String key data (BLOB, binary form)
   * @param {String} email - email address associated with key
   * @param {String} autocryptState - mutual or nopreference
   * @param {String} type - autocrypt header type (1 / 1g)
   *
   * @return {Promise<Array of keys>} list of imported keys
   */
  async applyKeyFromKeydata(keyData, email, autocryptState, type) {
    throw new Error("Not implemented");

    /*
    let keysObj = {};
    let importedKeys = [];

    // TODO: need a MPL version of bytesToArmor
    let pubkey = EnigmailOpenPGP.enigmailFuncs.bytesToArmor(
      EnigmailOpenPGP.armor.public_key,
      keyData
    );
    // TODO: respect pubkey size limitation
    await EnigmailKeyRing.importKeyAsync(null, false, pubkey, false, "", {}, keysObj);

    if (keysObj.value) {
      importedKeys = importedKeys.concat(keysObj.value);

      if (keysObj.value.length > 0) {
        let key = EnigmailKeyRing.getKeyById(keysObj.value[0]);

        // enable encryption if state (prefer-encrypt) is "mutual";
        // otherwise, disable it explicitely
        let signEncrypt = autocryptState === "mutual" ? 1 : 0;

        if (key && key.fpr) {
          let ruleObj = {
            email: `{${EnigmailConstants.AC_RULE_PREFIX}${email}}`,
            keyList: `0x${key.fpr}`,
            sign: signEncrypt,
            encrypt: signEncrypt,
            pgpMime: 2,
            flags: 0,
          };

          EnigmailRules.insertOrUpdateRule(ruleObj);
          await this.setKeyImported(null, email);
        }
      }
    }

    return importedKeys;
    */
  },

  /**
   * Update key in the Autocrypt database to mark it "imported in keyring"
   */
  async setKeyImported(connection, email) {
    EnigmailLog.DEBUG(`autocrypt.jsm: setKeyImported(${email})\n`);
    try {
      let conn = connection;
      if (!conn) {
        conn = await EnigmailSqliteDb.openDatabase();
      }
      let updateStr =
        "update autocrypt_keydata set keyring_inserted = '1' where email = :email;";

      let updateObj = {
        email: email.toLowerCase(),
      };

      await new Promise((resolve, reject) =>
        conn.executeTransaction(function() {
          conn
            .execute(updateStr, updateObj)
            .then(r => {
              resolve(r);
            })
            .catch(err => {
              EnigmailLog.DEBUG(
                `autocrypt.jsm: setKeyImported: error ${err}\n`
              );
              reject(err);
            });
        })
      );

      if (!connection) {
        conn.close();
      }
    } catch (err) {
      EnigmailLog.DEBUG(`autocrypt.jsm: setKeyImported: error ${err}\n`);
      throw err;
    }
  },

  /**
   * Go through all emails in the autocrypt store and determine which keys already
   * have a per-recipient rule
   */
  async updateAllImportedKeys() {
    EnigmailLog.DEBUG(`autocrypt.jsm: updateAllImportedKeys()\n`);
    try {
      let conn = await EnigmailSqliteDb.openDatabase();

      let rows = [];
      await conn.execute(
        "select email, type from autocrypt_keydata where type = '1';",
        {},
        function(record) {
          rows.push(record.getResultByName("email"));
        }
      );
      EnigmailLog.DEBUG(`autocrypt.jsm: updateAllImportedKeys done\n`);

      conn.close();
    } catch (err) {
      EnigmailLog.DEBUG(`autocrypt.jsm: updateAllImportedKeys: error ${err}\n`);
      throw err;
    }
  },

  /**
   * Find an autocrypt OpenPGP key for a given list of email addresses
   * @param emailAddr: Array of String - email addresses
   *
   * @return Promise(<Array of Object>)
   *      Object: {fpr, keyData, lastAutocrypt}
   */
  getOpenPGPKeyForEmail(emailAddr) {
    EnigmailLog.DEBUG(
      "autocrypt.jsm: getOpenPGPKeyForEmail(" + emailAddr.join(",") + ")\n"
    );

    let conn;

    return new Promise((resolve, reject) => {
      EnigmailSqliteDb.openDatabase()
        .then(
          function(connection) {
            conn = connection;
            return findUserRecord(conn, emailAddr, "1,1g");
          },
          function(error) {
            EnigmailLog.DEBUG(
              "autocrypt.jsm: getOpenPGPKeyForEmail: could not open database\n"
            );
            reject("getOpenPGPKeyForEmail1 error " + error);
          }
        )
        .then(function(resultObj) {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: getOpenPGPKeyForEmail got " +
              resultObj.numRows +
              " rows\n"
          );
          conn.close();

          if (resultObj.data.length === 0) {
            resolve(null);
          } else {
            let retArr = [];
            for (let i in resultObj.data) {
              let record = resultObj.data[i];
              retArr.push({
                email: record.getResultByName("email"),
                fpr: record.getResultByName("fpr"),
                keyData: record.getResultByName("keydata"),
                state: record.getResultByName("state"),
                type: record.getResultByName("type"),
                lastAutocrypt: new Date(
                  record.getResultByName("last_seen_autocrypt")
                ),
              });
            }

            resolve(retArr);
          }
        })
        .catch(err => {
          conn.close();
          reject("getOpenPGPKeyForEmail: error " + err);
        });
    });
  },

  /**
   * Create Autocrypt Setup Message
   *
   * @param identity: Object - nsIMsgIdentity
   *
   * @return Promise({str, passwd}):
   *             msg:    String - complete setup message
   *             passwd: String - backup password
   */
  // needs rewrite, OpenPGP.js not available
  /*
  createSetupMessage: function(identity) {
    EnigmailLog.DEBUG("autocrypt.jsm: createSetupMessage()\n");

    return new Promise((resolve, reject) => {
      let keyId = "";
      let key;
      try {

        if (!EnigmailCore.getService(null, false)) {
          reject(0);
          return;
        }

        if (identity.getIntAttribute("pgpKeyMode") === 1) {
          keyId = identity.getCharAttribute("pgpkeyId");
        }

        if (keyId.length > 0) {
          key = EnigmailKeyRing.getKeyById(keyId);
        }
        else {
          key = EnigmailKeyRing.getSecretKeyByUserId(identity.email);
        }

        if (!key) {
          EnigmailLog.DEBUG("autocrypt.jsm: createSetupMessage: no key found for " + identity.email + "\n");
          reject(1);
          return;
        }

        let keyData = key.getSecretKey(true).keyData;

        if (!keyData || keyData.length === 0) {
          EnigmailLog.DEBUG("autocrypt.jsm: createSetupMessage: no key found for " + identity.email + "\n");
          reject(1);
          return;
        }

        let ac = EnigmailFuncs.getAccountForIdentity(identity);
        let preferEncrypt = ac.incomingServer.getIntValue("acPreferEncrypt") > 0 ? "mutual" : "nopreference";

        let innerMsg = EnigmailArmor.replaceArmorHeaders(keyData, {
          'Autocrypt-Prefer-Encrypt': preferEncrypt
        }) + '\r\n';

        let bkpCode = createBackupCode();
        let enc = {
          // TODO: message: EnigmailOpenPGP.openpgp.message.fromText(innerMsg),
          passwords: bkpCode,
          armor: true
        };

        // create symmetrically encrypted message
        // TODO: EnigmailOpenPGP.openpgp.encrypt(enc).then(msg => {
          let msgData = EnigmailArmor.replaceArmorHeaders(msg.data, {
            'Passphrase-Format': 'numeric9x4',
            'Passphrase-Begin': bkpCode.substr(0, 2)
          }).replace(/\n/g, "\r\n");

          let m = createBackupOuterMsg(identity.email, msgData);
          resolve({
            msg: m,
            passwd: bkpCode
          });
        }).catch(e => {
          EnigmailLog.DEBUG("autocrypt.jsm: createSetupMessage: error " + e + "\n");
          reject(2);
        });
      }
      catch (ex) {
        EnigmailLog.DEBUG("autocrypt.jsm: createSetupMessage: error " + ex.toString() + "\n");
        reject(4);
      }
    });
  },
  */

  /**
   * Create and send the Autocrypt Setup Message to yourself
   * The message is sent asynchronously.
   *
   * @param identity: Object - nsIMsgIdentity
   *
   * @return Promise(passwd):
   *   passwd: String - backup password
   *
   */
  /*
  sendSetupMessage: function(identity) {
    EnigmailLog.DEBUG("autocrypt.jsm: sendSetupMessage()\n");

    let self = this;
    return new Promise((resolve, reject) => {
      self.createSetupMessage(identity).then(res => {
        let composeFields = Cc["@mozilla.org/messengercompose/composefields;1"].createInstance(Ci.nsIMsgCompFields);
        composeFields.messageId = EnigmailRNG.generateRandomString(27) + "-enigmail";
        composeFields.from = identity.email;
        composeFields.to = identity.email;
        gCreatedSetupIds.push(composeFields.messageId);

        let now = new Date();
        let mimeStr = "Message-Id: " + composeFields.messageId + "\r\n" +
          "Date: " + now.toUTCString() + "\r\n" + res.msg;

        if (EnigmailSend.sendMessage(mimeStr, composeFields, null)) {
          resolve(res.passwd);
        }
        else {
          reject(99);
        }
      });
    });
  },
  */

  /**
   * get the data of the attachment of a setup message
   *
   * @param attachmentUrl: String - URL of the attachment
   *
   * @return Promise(Object):
   *            attachmentData:   String - complete attachment data
   *            passphraseFormat: String - extracted format from the header (e.g. numeric9x4) [optional]
   *            passphraseHint:   String - 1st two digits of the password [optional]
   */
  getSetupMessageData(attachmentUrl) {
    EnigmailLog.DEBUG("autocrypt.jsm: getSetupMessageData()\n");

    return new Promise((resolve, reject) => {
      let s = EnigmailStreams.newStringStreamListener(data => {
        let start = {},
          end = {};
        let msgType = EnigmailArmor.locateArmoredBlock(
          data,
          0,
          "",
          start,
          end,
          {}
        );

        if (msgType === "MESSAGE") {
          EnigmailLog.DEBUG(
            "autocrypt.jsm: getSetupMessageData: got backup key\n"
          );
          let armorHdr = EnigmailArmor.getArmorHeaders(data);

          let passphraseFormat = "generic";
          if ("passphrase-format" in armorHdr) {
            passphraseFormat = armorHdr["passphrase-format"];
          }
          let passphraseHint = "";
          if ("passphrase-begin" in armorHdr) {
            passphraseHint = armorHdr["passphrase-begin"];
          }

          resolve({
            attachmentData: data,
            passphraseFormat,
            passphraseHint,
          });
        } else {
          reject("getSetupMessageData");
        }
      });

      let channel = EnigmailStreams.createChannel(attachmentUrl);
      channel.asyncOpen(s, null);
    });
  },

  /**
   * @return Promise(Object):
   *          fpr:           String - FPR of the imported key
   *          preferEncrypt: String - Autocrypt preferEncrypt value (e.g. mutual)
   */
  // needs rewrite, OpenPGP.js not available
  /*
  handleBackupMessage: function(passwd, attachmentData, fromAddr) {
    EnigmailLog.DEBUG("autocrypt.jsm: handleBackupMessage()\n");

    return new Promise((resolve, reject) => {
      let start = {},
        end = {};
      let msgType = EnigmailArmor.locateArmoredBlock(attachmentData, 0, "", start, end, {});

      // TODO: EnigmailOpenPGP.openpgp.message.readArmored(attachmentData.substring(start.value, end.value)).then(encMessage => {
          let enc = {
            message: encMessage,
            passwords: [passwd],
            format: 'utf8'
          };

          // TODO: return EnigmailOpenPGP.openpgp.decrypt(enc);
        })
        .then(msg => {
          EnigmailLog.DEBUG("autocrypt.jsm: handleBackupMessage: data: " + msg.data.length + "\n");

          let setupData = importSetupKey(msg.data);
          if (setupData) {
            EnigmailKeyEditor.setKeyTrust(null, "0x" + setupData.fpr, "5", function(returnCode) {
              if (returnCode === 0) {
                let id = EnigmailStdlib.getIdentityForEmail(EnigmailFuncs.stripEmail(fromAddr).toLowerCase());
                let ac = EnigmailFuncs.getAccountForIdentity(id.identity);
                ac.incomingServer.setBoolValue("enableAutocrypt", true);
                ac.incomingServer.setIntValue("acPreferEncrypt", (setupData.preferEncrypt === "mutual" ? 1 : 0));
                id.identity.setCharAttribute("pgpkeyId", "0x" + setupData.fpr);
                id.identity.setBoolAttribute("enablePgp", true);
                id.identity.setBoolAttribute("pgpMimeMode", true);
                id.identity.setIntAttribute("pgpKeyMode", 1);
                resolve(setupData);
              }
              else {
                reject("keyImportFailed");
              }
            });
          }
          else {
            reject("keyImportFailed");
          }
        }).
      catch(err => {
        reject("wrongPasswd");
      });
    });
  },
  */

  /**
   * Determine if a message id was self-created (only during same TB session)
   */
  isSelfCreatedSetupMessage(messageId) {
    return gCreatedSetupIds.includes(messageId);
  },

  /**
   * Delete the record for a user from the autocrypt keystore
   * The record with the highest precedence is deleted (i.e. type=1 before type=1g)
   */
  async deleteUser(email, type) {
    EnigmailLog.DEBUG(`autocrypt.jsm: deleteUser(${email})\n`);
    let conn = await EnigmailSqliteDb.openDatabase();

    let updateStr =
      "delete from autocrypt_keydata where email = :email and type = :type";
    let updateObj = {
      email,
      type,
    };

    await new Promise((resolve, reject) => {
      conn.executeTransaction(function() {
        conn
          .execute(updateStr, updateObj)
          .then(function() {
            resolve();
          })
          .catch(function() {
            reject("update failed");
          });
      });
    });
    EnigmailLog.DEBUG(" deletion complete\n");

    conn.close();
  },
};

/**
 * Find the database record for a given email address and type
 *
 * @param connection: Object - SQLite connection
 * @param emails      Array of String - Email addresses to search
 * @param type:       String - types to search (in lowercase), separated by comma
 *
 * @return {Promise<Object>}:
 *   numRows: number of results
 *   data:    array of RowObject. Query columns using data[i].getResultByName(columnName);
 */
async function findUserRecord(connection, emails, type) {
  EnigmailLog.DEBUG("autocrypt.jsm: findUserRecord\n");

  let data = [];
  let t = type.split(/[ ,]+/);

  let queryParam = {
    e0: emails[0],
    t0: t[0],
  };

  let numRows = 0;

  let search = ":e0";
  for (let i = 1; i < emails.length; i++) {
    search += ", :e" + i;
    queryParam["e" + i] = emails[i].toLowerCase();
  }

  let typeParam = ":t0";
  for (let i = 1; i < t.length; i++) {
    typeParam += ", :t" + i;
    queryParam["t" + i] = t[i];
  }

  try {
    await connection.execute(
      "select * from autocrypt_keydata where email in (" +
        search +
        ") and type in (" +
        typeParam +
        ") order by email, type",
      queryParam,
      function(row) {
        EnigmailLog.DEBUG("autocrypt.jsm: findUserRecord - got row\n");
        data.push(row);
        ++numRows;
      }
    );
  } catch (x) {
    EnigmailLog.DEBUG(`autocrypt.jsm: findUserRecord: error ${x}\n`);
    throw x;
  }

  return {
    data,
    numRows,
  };
}

/**
 * Create new database record for an Autorypt header
 *
 * @param connection: Object - SQLite connection
 * @param paramsArr:  Object - the Autocrypt header parameters
 *
 * @return Promise
 */
async function appendUser(connection, paramsArr) {
  /*
  EnigmailLog.DEBUG("autocrypt.jsm: appendUser(" + paramsArr.addr + ")\n");

  if (!("fpr" in paramsArr)) {
    await getFprForKey(paramsArr);
  }

  return new Promise((resolve, reject) => {
    if (paramsArr.autocryptDate == 0) {
      // do not insert record for non-autocrypt mail
      resolve();
      return;
    }

    connection.executeTransaction(function() {
      connection
        .execute(
          "insert into autocrypt_keydata (email, keydata, fpr, type, last_seen_autocrypt, last_seen, state) values " +
            "(:email, :keyData, :fpr, :type, :lastAutocrypt, :lastSeen, :state)",
          {
            email: paramsArr.addr.toLowerCase(),
            keyData: paramsArr.keydata,
            fpr: "fpr" in paramsArr ? paramsArr.fpr : "",
            type: paramsArr.type,
            lastAutocrypt: paramsArr.dateSent.toJSON(),
            lastSeen: paramsArr.dateSent.toJSON(),
            state: paramsArr["prefer-encrypt"],
          }
        )
        .then(function() {
          EnigmailLog.DEBUG("autocrypt.jsm: appendUser - OK\n");
          resolve();
        })
        .catch(function() {
          reject("appendUser");
        });
    });
  });
  */
}

/**
 * Update the record for an email address and type, if the email we got is newer
 * than the latest record we already stored
 *
 * @param connection: Object - SQLite connection
 * @param paramsArr:  Object - the Autocrypt header parameters
 * @param resultRows: Array of mozIStorageRow - records stored in the database
 * @param autoCryptEnabled: Boolean: is autocrypt enabled for this transaction
 *
 * @return Promise
 */
async function updateUser(connection, paramsArr, resultRows, autoCryptEnabled) {
  /*
  EnigmailLog.DEBUG("autocrypt.jsm: updateUser\n");

  let currData = resultRows[0];
  PromiseUtils.defer();

  let lastSeen = new Date(currData.getResultByName("last_seen"));
  let lastAutocrypt = new Date(currData.getResultByName("last_seen_autocrypt"));
  let notGossip = currData.getResultByName("state") !== "gossip";
  let currentKeyData = currData.getResultByName("keydata");
  let isKeyInKeyring = currData.getResultByName("keyring_inserted") === "1";

  if (
    lastSeen >= paramsArr.dateSent ||
    (paramsArr["prefer-encrypt"] === "gossip" && notGossip)
  ) {
    EnigmailLog.DEBUG(
      "autocrypt.jsm: updateUser: not a relevant new latest message\n"
    );

    return;
  }

  EnigmailLog.DEBUG("autocrypt.jsm: updateUser: updating latest message\n");

  let updateStr;
  let updateObj;

  if (paramsArr.autocryptDate > 0) {
    lastAutocrypt = paramsArr.autocryptDate;
    if (!("fpr" in paramsArr)) {
      await getFprForKey(paramsArr);
    }

    updateStr =
      "update autocrypt_keydata set state = :state, keydata = :keyData, last_seen_autocrypt = :lastAutocrypt, " +
      "fpr = :fpr, last_seen = :lastSeen where email = :email and type = :type";
    updateObj = {
      email: paramsArr.addr.toLowerCase(),
      state: paramsArr["prefer-encrypt"],
      keyData: paramsArr.keydata,
      fpr: "fpr" in paramsArr ? paramsArr.fpr : "",
      type: paramsArr.type,
      lastAutocrypt: lastAutocrypt.toJSON(),
      lastSeen: paramsArr.dateSent.toJSON(),
    };
  } else {
    updateStr =
      "update autocrypt_keydata set state = :state, last_seen = :lastSeen where email = :email and type = :type";
    updateObj = {
      email: paramsArr.addr.toLowerCase(),
      state: paramsArr["prefer-encrypt"],
      type: paramsArr.type,
      lastSeen: paramsArr.dateSent.toJSON(),
    };
  }

  if (!("fpr" in paramsArr)) {
    await getFprForKey(paramsArr);
  }

  await new Promise((resolve, reject) => {
    connection.executeTransaction(function() {
      connection
        .execute(updateStr, updateObj)
        .then(function() {
          resolve();
        })
        .catch(function() {
          reject("update failed");
        });
    });
  });

  if (
    autoCryptEnabled &&
    isKeyInKeyring &&
    currentKeyData !== paramsArr.keydata
  ) {
    await updateKeyIfNeeded(
      paramsArr.addr.toLowerCase(),
      paramsArr.keydata,
      paramsArr.fpr,
      paramsArr.type,
      paramsArr["prefer-encrypt"]
    );
  }
  */
}

/**
 * Determine if a key in the keyring should be replaced by a new (or updated) key
 * @param {String} email - Email address
 * @param {String} keydata - new keydata to import
 * @param {String} fpr - fingerprint of new key
 * @param {String} keyType - key type (1 / 1g)
 * @param {String} autocryptState - mutual or nopreference
 *
 * @return {Promise<Boolean>} - key updated
 */
/*
async function updateKeyIfNeeded(email, keydata, fpr, keyType, autocryptState) {
  await EnigmailAutocrypt.applyKeyFromKeydata(
    atob(keydata),
    email,
    autocryptState,
    keyType
  );

  return true;
}
*/

/**
 * Set the fpr attribute for a given key parameter object
 */
/*
async function getFprForKey(paramsArr) {
  let keyData = atob(paramsArr.keydata);

  const cApi = EnigmailCryptoAPI();

  try {
    let keyArr = await cApi.getKeyListFromKeyBlockAPI(keyData, ... ?);
    if (!keyArr) {
      // callers can handle empty string for paramsArr.fpr
      return;
    }

    if (keyArr.length === 1) {
      paramsArr.fpr = keyArr[0].fpr;
    }
  } catch (x) {}
}
*/

/**
 * Create the 9x4 digits backup code as defined in the Autocrypt spec
 *
 * @return String: xxxx-xxxx-...
 */
/*
function createBackupCode() {
  let bkpCode = "";

  for (let i = 0; i < 9; i++) {
    if (i > 0) {
      bkpCode += "-";
    }

    let a = new Uint8Array(4);
    crypto.getRandomValues(a);
    for (let j = 0; j < 4; j++) {
      bkpCode += String(a[j] % 10);
    }
  }
  return bkpCode;
}

function createBackupOuterMsg(toEmail, encryptedMsg) {
  let boundary = EnigmailMime.createBoundary();

  let msgStr =
    "To: " +
    toEmail +
    "\r\n" +
    "From: " +
    toEmail +
    "\r\n" +
    "Autocrypt-Setup-Message: v1\r\n" +
    "Subject: " +
    "Autocrypt Setup Message" +
    "\r\n" +
    'Content-type: multipart/mixed; boundary="' +
    boundary +
    '"\r\n\r\n' +
    "--" +
    boundary +
    "\r\n" +
    "Content-Type: text/plain\r\n\r\n" +
    "This message contains all information to transfer your Autocrypt settings along with your secret key securely from your original device." +
    "\r\n\r\n" +
    "To set up your new device for Autocrypt, please follow the instuctions that should be presented by your new device." +
    "\r\n\r\n" +
    "You can keep this message and use it as a backup for your secret key. If you want to do this, you should write down the password and store it securely." +
    "\r\n" +
    "--" +
    boundary +
    "\r\n" +
    "Content-Type: application/autocrypt-setup\r\n" +
    'Content-Disposition: attachment; filename="autocrypt-setup-message.html"\r\n\r\n' +
    "<html><body>\r\n" +
    "<p>" +
    "This is the Autocrypt setup file used to transfer settings and keys between clients. You can decrypt it using the setup code displayed on your old device, then import the key to your keyring." +
    "</p>\r\n" +
    "<pre>\r\n" +
    encryptedMsg +
    "</pre></body></html>\r\n" +
    "--" +
    boundary +
    "--\r\n";

  return msgStr;
}
*/

/**
 * @return Object:
 *          fpr:           String - FPR of the imported key
 *          preferEncrypt: String - Autocrypt preferEncrypt value (e.g. mutual)
 */
/*
function importSetupKey(keyData) {
  EnigmailLog.DEBUG("autocrypt.jsm: importSetupKey()\n");

  let preferEncrypt = "nopreference"; // Autocrypt default according spec
  let start = {},
    end = {},
    keyObj = {};

  let msgType = EnigmailArmor.locateArmoredBlock(
    keyData,
    0,
    "",
    start,
    end,
    {}
  );
  if (msgType === "PRIVATE KEY BLOCK") {
    let headers = EnigmailArmor.getArmorHeaders(keyData);
    if ("autocrypt-prefer-encrypt" in headers) {
      preferEncrypt = headers["autocrypt-prefer-encrypt"];
    }

    let r = EnigmailKeyRing.importKey(null, false, keyData, false, "", {}, keyObj);

    if (r === 0 && keyObj.value && keyObj.value.length > 0) {
      return {
        fpr: keyObj.value[0],
        preferEncrypt,
      };
    }
  }

  return null;
}

function updateRuleForEmail(email, preferEncrypt, fpr = null) {
  let node = EnigmailRules.getRuleByEmail(
    EnigmailConstants.AC_RULE_PREFIX + email
  );

  if (node) {
    let signEncrypt = preferEncrypt === "mutual" ? "1" : "0";

    if (
      node.getAttribute("sign") !== signEncrypt ||
      node.getAttribute("encrypt") !== signEncrypt
    ) {
      node.setAttribute("sign", signEncrypt);
      node.setAttribute("encrypt", signEncrypt);
      if (fpr) {
        node.setAttribute("keyList", `0x${fpr}`);
      }
      EnigmailRules.saveRulesFile();
    }
  }
}
*/
