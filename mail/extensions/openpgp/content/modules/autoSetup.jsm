/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

/*eslint no-loop-func: 0 no-async-promise-executor: 0*/

/**
 *  Module to determine the type of setup of the user, based on existing emails
 *  found in the inbox
 */

var EXPORTED_SYMBOLS = ["EnigmailAutoSetup"];

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  EnigmailAutocrypt: "chrome://openpgp/content/modules/autocrypt.jsm",
  EnigmailDialog: "chrome://openpgp/content/modules/dialog.jsm",
  EnigmailFuncs: "chrome://openpgp/content/modules/funcs.jsm",
  EnigmailGpg: "chrome://openpgp/content/modules/gpg.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailLog: "chrome://openpgp/content/modules/log.jsm",
  EnigmailMime: "chrome://openpgp/content/modules/mime.jsm",
  EnigmailStreams: "chrome://openpgp/content/modules/streams.jsm",
  EnigmailWks: "chrome://openpgp/content/modules/webKey.jsm",
  jsmime: "resource:///modules/jsmime.jsm",
  MailServices: "resource:///modules/MailServices.jsm",
  setTimeout: "resource://gre/modules/Timer.jsm",
});

const { EnigmailConstants } = ChromeUtils.import(
  "chrome://openpgp/content/modules/constants.jsm"
);

// Interfaces
const nsIMessenger = Ci.nsIMessenger;
const nsIMsgMessageService = Ci.nsIMsgMessageService;

/**
 * the determined setup type
 */
var gDeterminedSetupType = {
  value: EnigmailConstants.AUTOSETUP_NOT_INITIALIZED,
};

var EnigmailAutoSetup = {
  async getDeterminedSetupType() {
    if (
      gDeterminedSetupType.value === EnigmailConstants.AUTOSETUP_NOT_INITIALIZED
    ) {
      return this.determinePreviousInstallType();
    }
    return gDeterminedSetupType;
  },

  /**
   * Identify which type of setup the user had before Enigmail was (re-)installed
   *
   * @return Promise<Object> with:
   *   - value : For each case assigned value, see EnigmailConstants.AUTOSETUP_xxx values
   *   - acSetupMessage {nsIMsgDBHdr}  in case value === 1
   *   - msgHeaders {Object}           in case value === 2
   */
  determinePreviousInstallType() {
    gDeterminedSetupType = {
      value: EnigmailConstants.AUTOSETUP_NOT_INITIALIZED,
    };

    return new Promise(async (resolve, reject) => {
      EnigmailLog.DEBUG("autoSetup.jsm: determinePreviousInstallType()\n");

      try {
        let returnMsgValue = {
          value: EnigmailConstants.AUTOSETUP_NO_HEADER,
        };

        let accounts = MailServices.accounts.accounts;

        let msgHeaders = [];

        // If no account, except Local Folders is configured
        if (accounts.length <= 1) {
          gDeterminedSetupType.value = EnigmailConstants.AUTOSETUP_NO_ACCOUNT;
          resolve(gDeterminedSetupType);
          return;
        }

        // Iterate through each account

        for (let account of accounts) {
          let accountMsgServer = account.incomingServer;
          EnigmailLog.DEBUG(
            `autoSetup.jsm: determinePreviousInstallType: scanning account "${accountMsgServer.prettyName}"\n`
          );

          let msgFolderArr = [];

          try {
            getMsgFolders(account.incomingServer.rootFolder, msgFolderArr);
          } catch (e) {
            EnigmailLog.DEBUG(
              "autoSetup.jsm: determinePreviousInstallType: Error: " + e + "\n"
            );
          }

          if (account.incomingServer.type.search(/^(none|nntp)$/) === 0) {
            // ignore NNTP accounts and "Local Folders" accounts
            continue;
          }

          // Iterating through each non empty Folder Database in the Account

          for (var k = 0; k < msgFolderArr.length; k++) {
            let msgFolder = msgFolderArr[k];
            let msgDatabase = msgFolderArr[k].msgDatabase;

            if (
              msgFolder.flags & Ci.nsMsgFolderFlags.Junk ||
              msgFolder.flags & Ci.nsMsgFolderFlags.Trash ||
              !account.defaultIdentity
            ) {
              continue;
            }

            EnigmailLog.DEBUG(
              `autoSetup.jsm: determinePreviousInstallType: scanning folder "${msgFolder.name}"\n`
            );

            // Iterating through each message in the Folder
            for (let msgHeader of msgDatabase.ReverseEnumerateMessages()) {
              let msgURI = msgFolder.getUriForMsg(msgHeader);

              let msgAuthor = "";
              try {
                msgAuthor = EnigmailFuncs.stripEmail(msgHeader.author);
              } catch (x) {}

              // Listing all the headers in the message

              let messenger = Cc["@mozilla.org/messenger;1"].createInstance(
                nsIMessenger
              );
              let mms = messenger
                .messageServiceFromURI(msgURI)
                .QueryInterface(nsIMsgMessageService);

              let headerObj = await getStreamedHeaders(msgURI, mms);
              let checkHeaderValues = await checkHeaders(
                headerObj,
                msgHeader,
                msgAuthor,
                account.defaultIdentity.email,
                msgFolder,
                returnMsgValue,
                msgHeaders
              );

              msgHeaders = checkHeaderValues.msgHeaders;
              returnMsgValue = checkHeaderValues.returnMsgValue;

              const currDateInSeconds = getCurrentTime();
              const diffSecond = currDateInSeconds - msgHeader.dateInSeconds;

              /**
                  2592000 = No. of Seconds in a Month.
                  This is to ignore 1 month old messages.
              */
              if (diffSecond > 2592000.0) {
                break;
              }
            }
          }
        }
        if (returnMsgValue.acSetupMessage) {
          EnigmailLog.DEBUG(
            `autoSetup.jsm: determinePreviousInstallType: found AC-Setup message\n`
          );
          gDeterminedSetupType = returnMsgValue;
          resolve(gDeterminedSetupType);
        } else {
          EnigmailLog.DEBUG(`msgHeaders.length: ${msgHeaders.length}\n`);

          // find newest message to know the protocol
          let latestMsg = null;
          for (let i = 0; i < msgHeaders.length; i++) {
            if (!latestMsg) {
              latestMsg = msgHeaders[i];
            }

            if (msgHeaders[i].dateTime > latestMsg.dateTime) {
              latestMsg = msgHeaders[i];
            }
          }

          if (latestMsg) {
            if (latestMsg.msgType === "Autocrypt") {
              returnMsgValue.value = EnigmailConstants.AUTOSETUP_AC_HEADER;
              returnMsgValue.msgHeaders = msgHeaders;
            } else {
              returnMsgValue.value = EnigmailConstants.AUTOSETUP_ENCRYPTED_MSG;
              returnMsgValue.msgHeaders = msgHeaders;
            }
          }

          let defId = EnigmailFuncs.getDefaultIdentity();
          if (defId) {
            returnMsgValue.userName = defId.fullName;
            returnMsgValue.userEmail = defId.email;
          } else {
            returnMsgValue.userName = undefined;
            returnMsgValue.userEmail = undefined;
          }

          gDeterminedSetupType = returnMsgValue;
          EnigmailLog.DEBUG(
            `autoSetup.jsm: determinePreviousInstallType: found type: ${returnMsgValue.value}\n`
          );
          resolve(returnMsgValue);
        }
      } catch (x) {
        reject(x);
      }
    });
  },

  /**
   * Process the Autocrypt Setup Message
   *
   * @param {Object} headerValue: contains header and attachment of an Autocrypt Setup Message
   * @param {nsIWindow} passwordWindow: parent window for password dialog
   * @param {nsIWindow} confirmWindow:  parent window for confirmation dialog
   *        (note: split into 2 parent windows for unit tests)
   *
   * @return {Promise<Number>}: Import result.
   *                  1: imported OK
   *                  0: no Autocrypt setup message
   *                 -1: import not OK (wrong password, canceled etc.)
   */

  async performAutocryptSetup(
    headerValue,
    passwordWindow = null,
    confirmWindow = null
  ) {
    EnigmailLog.DEBUG("autoSetup.jsm: performAutocryptSetup()\n");

    EnigmailDialog.alert(
      confirmWindow,
      "EnigmailAutocrypt.handleBackupMessage not implemented"
    );

    return 0;
  },

  /**
   * Process accounts with Autocrypt headers
   *
   * @param {Object} setupType: containing Autocrypt headers from accounts
   *
   * @return {Promise<Number>}: Result: 0: OK / 1: failure
   */

  processAutocryptHeader(setupType) {
    EnigmailLog.DEBUG("autoSetup.jsm: processAutocryptHeader()\n");

    return new Promise(async (resolve, reject) => {
      // find newest message to know the protocol
      let latestMsg = null;
      for (let i = 0; i < setupType.msgHeaders.length; i++) {
        if (!latestMsg) {
          latestMsg = setupType.msgHeaders[i];
        }

        if (setupType.msgHeaders[i].dateTime > latestMsg) {
          latestMsg = setupType.msgHeaders[i];
        }
      }

      let sysType = latestMsg.msgType;
      EnigmailLog.DEBUG(
        `autoSetup.jsm: processAutocryptHeader: got type: ${sysType}\n`
      );

      for (let i = 0; i < setupType.msgHeaders.length; i++) {
        if (setupType.msgHeaders[i].msgType === "Autocrypt") {
          // FIXME
          let success = await EnigmailAutocrypt.processAutocryptHeader(
            setupType.msgHeaders[i].fromAddr,
            [setupType.msgHeaders[i].msgData],
            setupType.msgHeaders[i].date
          );
          if (success !== 0) {
            resolve(1);
          }
        }
      }
      resolve(0);
    });
  },

  /**
   * Create a new autocrypt key for every configured account and configure the account
   * to use that key. The keys are not protected by a password.
   *
   * The creation is done in the background after waiting timeoutValue ms
   * @param {Number} timeoutValue: number of miliseconds to wait before starting
   *                               the process
   */
  createKeyForAllAccounts(timeoutValue = 1000) {
    EnigmailLog.DEBUG("autoSetup.jsm: createKeyForAllAccounts()\n");
    let self = this;

    setTimeout(async function() {
      let createdKeys = [];

      for (let account of MailServices.accounts.accounts) {
        let id = account.defaultIdentity;

        if (id && id.email) {
          let keyId = await self.createAutocryptKey(id.fullName, id.email);
          EnigmailLog.DEBUG(
            `autoSetup.jsm: createKeyForAllAccounts: created key ${keyId}\n`
          );
          if (keyId) {
            let keyObj = EnigmailKeyRing.getKeyById(keyId);
            if (keyObj) {
              createdKeys.push(keyObj);
            }
            id.setBoolAttribute("enablePgp", true);
            id.setCharAttribute("pgpkeyId", keyId);
            id.setIntAttribute("pgpKeyMode", 1);
            id.setBoolAttribute("pgpMimeMode", true);
          }
        }
      }

      // upload created keys to WKD (if possible)
      EnigmailWks.wksUpload(createdKeys, null);
    }, timeoutValue);
  },

  /**
   * Create a new autocrypt-complinant key
   * The keys will not be protected by passwords.
   *
   * @param {String} userName:  Display name
   * @param {String} userEmail: Email address
   *
   * @return {Promise<Boolean>}: Success (true = successful)
   */
  createAutocryptKey(userName, userEmail) {
    return new Promise((resolve, reject) => {
      EnigmailLog.DEBUG("autoSetup.jsm: createAutocryptKey()\n");

      let keyType = "ECC",
        keyLength = 0;

      if (!EnigmailGpg.getGpgFeature("supports-ecc-keys")) {
        // fallback for gpg < 2.1
        keyLength = 4096;
        keyType = "RSA";
      }

      let expiry = 1825, // 5 years
        passphrase = "",
        generateObserver = {
          keyId: null,
          backupLocation: null,
          _state: 0,

          onDataAvailable(data) {},
          onStopRequest(exitCode) {
            EnigmailLog.DEBUG(
              "autoSetup.jsm: createAutocryptKey(): key generation complete\n"
            );
            resolve(generateObserver.keyId);
          },
        };

      try {
        EnigmailKeyRing.generateKey(
          userName,
          "",
          userEmail,
          expiry,
          keyLength,
          keyType,
          passphrase,
          generateObserver
        );
      } catch (ex) {
        EnigmailLog.DEBUG(
          "autoSetup.jsm: createAutocryptKey: error: " + ex.message
        );
        resolve(null);
      }
    });
  },
};

/**
 * Recusrively go through all folders to get a flat array of all sub-folders
 * starting with a parent folder.
 *
 * @param {nsIMsgFolder} folder:       the folder to scan
 * @param {nsIMsgFolder} msgFolderArr: An array to be filled with all folders that contain messages
 */

function getMsgFolders(folder, msgFolderArr) {
  if (folder.getTotalMessages(false) > 0) {
    msgFolderArr.push(folder);
  }

  // add all subfolders
  if (folder.hasSubFolders) {
    for (let folder of folder.subFolders) {
      getMsgFolders(folder, msgFolderArr);
    }
  }
}

// Util Function for Extracting manually added Headers
function streamListener(callback) {
  let streamListener = {
    mAttachments: [],
    mHeaders: [],
    mBusy: true,

    onStartRequest(aRequest) {
      this.mAttachments = [];
      this.mHeaders = [];
      this.mBusy = true;

      var channel = aRequest.QueryInterface(Ci.nsIChannel);
      channel.URI.QueryInterface(Ci.nsIMsgMailNewsUrl);
      channel.URI.msgHeaderSink = this; // adds this header sink interface to the channel
    },
    onStopRequest(aRequest, aStatusCode) {
      callback();
      this.mBusy = false; // if needed, you can poll this var to see if we are done collecting attachment details
    },
    onDataAvailable(aRequest, aInputStream, aOffset, aCount) {},
    onStartHeaders() {},
    onEndHeaders() {},
    processHeaders(
      aHeaderNameEnumerator,
      aHeaderValueEnumerator,
      aDontCollectAddress
    ) {
      for (let headerName of aHeaderNameEnumerator) {
        this.mHeaders.push({
          name: headerName.toLowerCase(),
          value: aHeaderValueEnumerator.getNext(),
        });
      }
    },
    handleAttachment(
      aContentType,
      aUrl,
      aDisplayName,
      aUri,
      aIsExternalAttachment
    ) {
      if (aContentType == "text/html") {
        return;
      }
      this.mAttachments.push({
        contentType: aContentType,
        url: aUrl,
        displayName: aDisplayName,
        uri: aUri,
        isExternal: aIsExternalAttachment,
      });
    },
    onEndAllAttachments() {},
    onEndMsgDownload(aUrl) {},
    onEndMsgHeaders(aUrl) {},
    onMsgHasRemoteContent(aMsgHdr) {},
    getSecurityInfo() {},
    setSecurityInfo(aSecurityInfo) {},
    getDummyMsgHeader() {},

    QueryInterface: ChromeUtils.generateQI([
      "nsIStreamListener",
      "nsIMsgHeaderSink",
    ]),
  };

  return streamListener;
}

function getStreamedMessage(msgFolder, msgHeader) {
  return new Promise((resolve, reject) => {
    let msgURI = msgFolder.getUriForMsg(msgHeader);
    var listener = streamListener(() => {
      resolve(listener.mAttachments[0]);
    });
    let messenger = Cc["@mozilla.org/messenger;1"].createInstance(nsIMessenger);
    let mms = messenger
      .messageServiceFromURI(msgURI)
      .QueryInterface(nsIMsgMessageService);
    mms.streamMessage(msgURI, listener, null, null, true, "filter");
  });
}

function checkHeaders(
  headerObj,
  msgHeader,
  msgAuthor,
  accountEmail,
  msgFolder,
  returnMsgValue,
  msgHeaders
) {
  return new Promise(async (resolve, reject) => {
    if (
      headerObj["autocrypt-setup-message"] &&
      msgHeader.author == msgHeader.recipients
    ) {
      // To extract Attachement for Autocrypt Setup Message

      returnMsgValue.attachment = await getStreamedMessage(
        msgFolder,
        msgHeader
      );

      if (!returnMsgValue.acSetupMessage) {
        returnMsgValue.value = 1;
        returnMsgValue.acSetupMessage = msgHeader;
      } else if (returnMsgValue.acSetupMessage.date < msgHeader.date) {
        returnMsgValue.acSetupMessage = msgHeader;
      }
    } else if (msgAuthor == accountEmail && "autocrypt" in headerObj) {
      let msgType = "Autocrypt";

      let fromHeaderExist = null;
      for (let j = 0; j < msgHeaders.length; j++) {
        if (msgHeaders[j].fromAddr == msgAuthor) {
          fromHeaderExist = msgHeaders[j];
          break;
        }
      }

      if (fromHeaderExist === null) {
        let dateTime = new Date(0);
        try {
          dateTime = jsmime.headerparser.parseDateHeader(headerObj.date);
        } catch (x) {}

        let addHeader = {
          fromAddr: msgAuthor,
          msgType,
          msgData: headerObj.autocrypt,
          date: headerObj.date,
          dateTime,
        };
        msgHeaders.push(addHeader);
      } else {
        let dateTime = new Date(0);
        try {
          dateTime = jsmime.headerparser.parseDateHeader(headerObj.date);
        } catch (x) {}
        if (dateTime > fromHeaderExist.dateTime) {
          fromHeaderExist.msgData = headerObj.autocrypt;
          fromHeaderExist.date = headerObj.date;
          fromHeaderExist.msgType = msgType;
          fromHeaderExist.dateTime = dateTime;
        }
      }
    }

    resolve({
      returnMsgValue,
      msgHeaders,
    });
  });
}

function getStreamedHeaders(msgURI, mms) {
  return new Promise((resolve, reject) => {
    let headers = Cc["@mozilla.org/messenger/mimeheaders;1"].createInstance(
      Ci.nsIMimeHeaders
    );
    let headerObj = {};
    try {
      mms.streamHeaders(
        msgURI,
        EnigmailStreams.newStringStreamListener(aRawString => {
          try {
            //EnigmailLog.DEBUG(`getStreamedHeaders: ${aRawString}\n`);
            headers.initialize(aRawString);

            let i = headers.headerNames;
            for (let hdr of headers.headerNames) {
              let hdrName = hdr.toLowerCase();

              let hdrValue = headers.extractHeader(hdrName, true);
              headerObj[hdrName] = hdrValue;
            }

            if ("autocrypt" in headerObj) {
              let acHeader = headers.extractHeader("autocrypt", false);
              acHeader = acHeader.replace(/keydata=/i, 'keydata="') + '"';

              let paramArr = EnigmailMime.getAllParameters(acHeader);
              paramArr.keydata = paramArr.keydata.replace(/[\r\n\t ]/g, "");

              headerObj.autocrypt = "";
              for (i in paramArr) {
                if (headerObj.autocrypt.length > 0) {
                  headerObj.autocrypt += "; ";
                }
                headerObj.autocrypt += `${i}="${paramArr[i]}"`;
              }
            }
          } catch (e) {
            reject({});
            EnigmailLog.DEBUG(
              "autoSetup.jsm: getStreamedHeaders: Error: " + e + "\n"
            );
          }
          resolve(headerObj);
        }),
        null,
        false
      );
    } catch (e) {
      reject({});
      EnigmailLog.DEBUG(
        "autoSetup.jsm: getStreamedHeaders: Error: " + e + "\n"
      );
    }
  });
}

function getCurrentTime() {
  return new Date().getTime() / 1000;
}
