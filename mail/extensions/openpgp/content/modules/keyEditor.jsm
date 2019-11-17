
/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var EXPORTED_SYMBOLS = ["EnigmailKeyEditor"];





const EnigmailCore = ChromeUtils.import("chrome://openpgp/content/modules/core.jsm").EnigmailCore;
const EnigmailKey = ChromeUtils.import("chrome://openpgp/content/modules/key.jsm").EnigmailKey;
const EnigmailLog = ChromeUtils.import("chrome://openpgp/content/modules/log.jsm").EnigmailLog;
const EnigmailOS = ChromeUtils.import("chrome://openpgp/content/modules/os.jsm").EnigmailOS;
const EnigmailFiles = ChromeUtils.import("chrome://openpgp/content/modules/files.jsm").EnigmailFiles;
const EnigmailLocale = ChromeUtils.import("chrome://openpgp/content/modules/locale.jsm").EnigmailLocale;
const EnigmailData = ChromeUtils.import("chrome://openpgp/content/modules/data.jsm").EnigmailData;
const EnigmailExecution = ChromeUtils.import("chrome://openpgp/content/modules/execution.jsm").EnigmailExecution;
const EnigmailGpgAgent = ChromeUtils.import("chrome://openpgp/content/modules/gpgAgent.jsm").EnigmailGpgAgent;
const EnigmailGpg = ChromeUtils.import("chrome://openpgp/content/modules/gpg.jsm").EnigmailGpg;
const EnigmailKeyRing = ChromeUtils.import("chrome://openpgp/content/modules/keyRing.jsm").EnigmailKeyRing;
const EnigmailErrorHandling = ChromeUtils.import("chrome://openpgp/content/modules/errorHandling.jsm").EnigmailErrorHandling;
const EnigmailConstants = ChromeUtils.import("chrome://openpgp/content/modules/constants.jsm").EnigmailConstants;

const GET_BOOL = "GET_BOOL";
const GET_LINE = "GET_LINE";
const GET_HIDDEN = "GET_HIDDEN";

const NS_PROMPTSERVICE_CONTRACTID = "@mozilla.org/embedcomp/prompt-service;1";

function GpgEditorInterface(reqObserver, callbackFunc, inputData) {
  this._reqObserver = reqObserver;
  this._callbackFunc = callbackFunc;
  this._inputData = inputData;

  if (this._inputData && this._inputData.cardAdmin) {
    this._saveCmd = "quit";
  }
  else
    this._saveCmd = "save";
}


GpgEditorInterface.prototype = {
  _stdin: null,
  _data: "",
  _txt: "",
  _exitCode: 0,
  errorMsg: "",

  setStdin: function(pipe) {
    this._stdin = pipe;
    if (this._data.length > 0) this.processData();
  },

  gotData: function(data) {
    //EnigmailLog.DEBUG("keyEditor.jsm: GpgEditorInterface.gotData: '"+data+"'\n");
    this._data += data.replace(/\r\n/g, "\n");
    this.processData();
  },

  processData: function() {
    //EnigmailLog.DEBUG("keyEditor.jsm: GpgEditorInterface.processData\n");
    var txt = "";
    while (this._data.length > 0 && this._stdin) {
      var index = this._data.indexOf("\n");
      if (index < 0) {
        txt = this._data;
        this._data = "";
      }
      else {
        txt = this._data.substr(0, index);
        this._data = this._data.substr(index + 1);
      }
      this.nextLine(txt);
    }
  },

  closeStdin: function() {
    EnigmailLog.DEBUG("keyEditor.jsm: GpgEditorInterface.closeStdin:\n");
    if (this._stdin) {
      this._stdin.close();
      this._stdin = null;
    }
  },

  onComplete: function(parentCallback, exitCode) {
    EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.onComplete: exitCode=" + exitCode + "\n");

    if (exitCode === 0) exitCode = this._exitCode;

    EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.onComplete: returning exitCode " + exitCode + "\n");

    parentCallback(exitCode, this.errorMsg);
  },

  writeLine: function(inputData) {
    EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.writeLine: '" + inputData + "'\n");
    this._stdin.write(inputData + "\n");
  },

  nextLine: function(txt) {
    if (txt.indexOf("[GNUPG:]") >= 0) {
      if (this._reqObserver) {
        var newTxt = this._reqObserver.onDataAvailable(txt);
        if (newTxt.length > 0) {

          txt = newTxt;
        }
      }
      this._txt = txt;
      this.processLine(txt);
    }
  },

  doCheck: function(inputType, promptVal) {
    var a = this._txt.split(/ /);
    return ((a[1] == inputType) && (a[2] == promptVal));
  },

  getText: function() {
    return this._txt;
  },

  handleGpgError: function(lineTxt) {
    let retStatusObj = {};

    EnigmailErrorHandling.parseErrorOutput(lineTxt, retStatusObj);
    return retStatusObj;
  },

  processLine: function(txt) {
    EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: '" + txt + "'\n");
    var r = {
      quitNow: false,
      exitCode: -1
    };

    try {
      if (txt.indexOf("[GNUPG:] BAD_PASSPHRASE") >= 0 ||
        txt.indexOf("[GNUPG:] SC_OP_FAILURE 2") >= 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected bad passphrase\n");
        r.exitCode = -2;
        r.quitNow = true;
        this.errorMsg = EnigmailLocale.getString("badPhrase");
      }
      else if (txt.indexOf("[GNUPG:] ERROR ") >= 0 || txt.indexOf("[GNUPG:] FAILURE ") >= 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected GnuPG ERROR message\n");
        let statusObj = this.handleGpgError(txt);
        if (statusObj.statusFlags & EnigmailConstants.DISPLAY_MESSAGE) {
          this.errorMsg = statusObj.statusMsg;
          r.exitCode = -3;
          r.quitNow = true;
        }
      }
      else if (txt.indexOf("[GNUPG:] NO_CARD_AVAILABLE") >= 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected missing card\n");
        this.errorMsg = EnigmailLocale.getString("sc.noCardAvailable");
        r.exitCode = -3;
        r.quitNow = true;
      }
      else if (txt.indexOf("[GNUPG:] ENIGMAIL_FAILURE") === 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected general failure\n");
        r.exitCode = -3;
        r.quitNow = true;
        this.errorMsg = txt.substr(26);
      }
      else if (txt.indexOf("[GNUPG:] ALREADY_SIGNED") >= 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected key already signed\n");
        this.errorMsg = EnigmailLocale.getString("keyAlreadySigned");
        r.exitCode = -1;
        r.quitNow = true;
      }
      else if (txt.indexOf("[GNUPG:] MISSING_PASSPHRASE") >= 0) {
        EnigmailLog.DEBUG("keyEdit.jsm: GpgEditorInterface.processLine: detected missing passphrase\n");
        this.errorMsg = EnigmailLocale.getString("noPassphrase");
        r.exitCode = -2;
        this._exitCode = -2;
        r.quitNow = true;
      }
      else if (txt.indexOf("[GNUPG:] GET_") < 0) {
        // return if no "GET" statement
        return;
      }
    }
    catch (ex) {
      txt = "";
      r.quitNow = true;
    }

    if (!r.quitNow) {
      if (txt.indexOf("[GNUPG:] GOT_IT") < 0) {
        if (this._callbackFunc) {
          this._callbackFunc(this._inputData, this, r);
          if (r.exitCode === 0) {
            this.writeLine(r.writeTxt);
          }
          else {
            if (r.errorMsg && r.errorMsg.length > 0)
              this.errorMsg = r.errorMsg;
          }
        }
        else {
          r.quitNow = true;
          r.exitCode = 0;
        }
      }
      else {
        r.exitCode = 0;
      }
    }

    if (r.quitNow) {
      try {
        this.writeLine(this._saveCmd);
        this.closeStdin();
      }
      catch (ex) {
        EnigmailLog.DEBUG("no more data\n");
      }
    }

    if (r.exitCode !== null)
      this._exitCode = r.exitCode;
  },

  QueryInterface: function(iid) {
    if (!iid.equals(Ci.nsISupports))
      throw Components.results.NS_ERROR_NO_INTERFACE;
    return this;
  }
};

function editKey(parent, needPassphrase, userId, keyId, editCmd, inputData, callbackFunc, requestObserver, parentCallback) {
  EnigmailLog.DEBUG("keyEdit.jsm: editKey: parent=" + parent + ", editCmd=" + editCmd + "\n");

  if (!EnigmailCore.getService(parent)) {
    EnigmailLog.ERROR("keyEdit.jsm: Enigmail.editKey: not yet initialized\n");
    parentCallback(-1, EnigmailLocale.getString("notInit"));
    return -1;
  }

  var keyIdList = keyId.split(" ");
  var args = EnigmailGpg.getStandardArgs(false);

  var statusFlags = {};

  args = args.concat(["--no-tty", "--no-verbose", "--status-fd", "1", "--logger-fd", "1", "--command-fd", "0"]);
  if (userId) args = args.concat(["-u", userId]);
  var editCmdArr;
  if (typeof(editCmd) == "string") {
    editCmdArr = [editCmd];
  }
  else {
    editCmdArr = editCmd;
  }

  if (editCmdArr[0] == "revoke") {
    // escape backslashes and ' characters
    args = args.concat(["-a", "-o"]);
    args.push(EnigmailFiles.getEscapedFilename(inputData.outFile.path));
    args.push("--gen-revoke");
    args = args.concat(keyIdList);
  }
  else if (editCmdArr[0].indexOf("--") === 0) {
    args = args.concat(editCmd);
    args = args.concat(keyIdList);
  }
  else {
    args = args.concat(["--ask-cert-level", "--edit-key", keyId]);
    args = args.concat(editCmd);
  }


  var command = EnigmailGpgAgent.agentPath;
  EnigmailLog.CONSOLE("enigmail> " + EnigmailFiles.formatCmdLine(command, args) + "\n");

  var keyEdit = new GpgEditorInterface(requestObserver, callbackFunc, inputData);

  try {
    EnigmailExecution.execCmd2(command, args,
      keyEdit.setStdin.bind(keyEdit),
      keyEdit.gotData.bind(keyEdit),
      function(result) {
        EnigmailKeyRing.updateKeys(keyIdList);
        keyEdit.onComplete(parentCallback, 0); // ignore exit code from GnuPG
      }
    );
  }
  catch (ex) {
    EnigmailLog.ERROR("keyEditor.jsm: editKey: " + command.path + " failed\n");
    parentCallback(-1, "");
  }

  return null;
}

function runKeyTrustCheck(callbackFunc) {
  EnigmailLog.DEBUG("keyEdit.jsm: runKeyTrustCheck()\n");

  let args = EnigmailGpg.getStandardArgs(true);
  args = args.concat(["--yes", "--check-trustdb"]);

  EnigmailExecution.execCmd2(EnigmailGpgAgent.agentPath,
    args,
    null,
    function stdout(data) {
      EnigmailLog.DEBUG(data);
    },
    function(result) {
      EnigmailLog.DEBUG("keyEdit.jsm: runKeyTrustCheck: done\n");
    });
}

/*
 * NOTE: the callbackFunc used in every call to the key editor needs to be implemented like this:
 * callbackFunc(returnCode, errorMsg)
 * returnCode = 0 in case of success
 * returnCode != 0 and errorMsg set in case of failure
 */
var EnigmailKeyEditor = {
  setKeyTrust: function(parent, keyId, trustLevel, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.setKeyTrust: trustLevel=" + trustLevel + ", keyId=" + keyId + "\n");

    return editKey(parent, false, null, keyId, "trust", {
        trustLevel: trustLevel
      },
      keyTrustCallback,
      null,
      function _f(returnCode, errorMsg) {
        runKeyTrustCheck();
        EnigmailKeyRing.updateKeys([keyId]);
        callbackFunc(returnCode, errorMsg);
      });
  },


  /**
   * Call editKey() to set the expiration date of the chosen key and subkeys
   *
   * @param  Object    parent
   * @param  String    keyId         e.g. 8D18EB22FDF633A2
   * @param  Array     subKeys       List of Integer values, e.g. [0,1,3]
   *                                 "0" should allways be set because it's the main key.
   * @param  Integer   expiryLength  A number between 1 and 100
   * @param  Integer   timeScale     1 or 30 or 365 meaning days, months, years
   * @param  Boolean   noExpiry      True: Expire never. False: Use expiryLength.
   * @param  Function  callbackFunc  will be executed by editKey()
   * @return  Integer
   *          returnCode = 0 in case of success
   *          returnCode != 0 and errorMsg set in case of failure
   */
  setKeyExpiration: function(parent, keyId, subKeys, expiryLength, timeScale, noExpiry, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.setKeyExpiry: keyId=" + keyId + "\n");

    expiryLength = String(expiryLength);
    if (noExpiry === true) {
      expiryLength = "0";
    }
    else {
      switch (parseInt(timeScale, 10)) {
        case 365:
          expiryLength += "y";
          break;
        case 30:
          expiryLength += "m";
          break;
        case 7:
          expiryLength += "w";
          break;
      }
    }

    return editKey(parent,
      true,
      null,
      keyId,
      "", /* "expire", */ {
        expiryLength: expiryLength,
        subKeys: subKeys,
        currentSubKey: false
      },
      keyExpiryCallback, /* contains the gpg communication logic */
      null,
      callbackFunc);
  },


  signKey: function(parent, userId, keyId, signLocally, trustLevel, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.signKey: trustLevel=" + trustLevel + ", userId=" + userId + ", keyId=" + keyId + "\n");
    return editKey(parent, true, userId, keyId, (signLocally ? "lsign" : "sign"), {
        trustLevel: trustLevel,
        usePassphrase: true
      },
      signKeyCallback,
      null,
      function _f(returnCode, errorMsg) {
        runKeyTrustCheck();
        EnigmailKeyRing.updateKeys([keyId]);
        callbackFunc(returnCode, errorMsg);
      });
      
  },

  genRevokeCert: function(parent, keyId, outFile, reasonCode, reasonText, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.genRevokeCert: keyId=" + keyId + "\n");

    /**
     * GnuPG < 2.1 does not properly report failures;
     * therefore we check if the revokation certificate was really generated
     */
    function checkGeneratedCert(exitCode, errorMsg) {
      if (!outFile.exists()) {
        exitCode = 1;
        errorMsg = "";
      }
      callbackFunc(exitCode, errorMsg);
    }

    return editKey(parent, true, null, keyId, "revoke", {
        outFile: outFile,
        reasonCode: reasonCode,
        reasonText: EnigmailData.convertFromUnicode(reasonText),
        usePassphrase: true
      },
      revokeCertCallback,
      null,
      checkGeneratedCert);
  },

  addUid: function(parent, keyId, name, email, comment, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.addUid: keyId=" + keyId + ", name=" + name + ", email=" + email + "\n");
    return editKey(parent, true, null, keyId, "adduid", {
        email: email,
        name: name,
        comment: comment,
        nameAsked: 0,
        emailAsked: 0,
        usePassphrase: true
      },
      addUidCallback,
      null,
      callbackFunc);
  },

  deleteKey: function(parent, keyId, deleteSecretKey, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.addUid: keyId=" + keyId + ", deleteSecretKey=" + deleteSecretKey + "\n");

    var cmd = ["--yes", (deleteSecretKey ? "--delete-secret-and-public-key" : "--delete-key")];
    return editKey(parent, false, null, keyId, cmd, {
        usePassphrase: true
      },
      deleteKeyCallback,
      null,
      callbackFunc);
  },

  changePassphrase: function(parent, keyId, oldPw, newPw, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.changePassphrase: keyId=" + keyId + "\n");

    var pwdObserver = new ChangePasswdObserver();
    return editKey(parent, false, null, keyId, "passwd", {
        oldPw: oldPw,
        newPw: newPw,
        step: 0,
        observer: pwdObserver,
        usePassphrase: true
      },
      changePassphraseCallback,
      pwdObserver,
      callbackFunc);
  },


  enableDisableKey: function(parent, keyId, disableKey, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.enableDisableKey: keyId=" + keyId + ", disableKey=" + disableKey + "\n");

    var cmd = (disableKey ? "disable" : "enable");
    return editKey(parent, false, null, keyId, cmd, {
        usePassphrase: true
      },
      null,
      null,
      callbackFunc);
  },

  setPrimaryUid: function(parent, keyId, idNumber, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.setPrimaryUid: keyId=" + keyId + ", idNumber=" + idNumber + "\n");
    return editKey(parent, true, null, keyId, "", {
        idNumber: idNumber,
        step: 0,
        usePassphrase: true
      },
      setPrimaryUidCallback,
      null,
      callbackFunc);
  },


  deleteUid: function(parent, keyId, idNumber, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.deleteUid: keyId=" + keyId + ", idNumber=" + idNumber + "\n");
    return editKey(parent, true, null, keyId, "", {
        idNumber: idNumber,
        step: 0,
        usePassphrase: true
      },
      deleteUidCallback,
      null,
      callbackFunc);
  },


  revokeUid: function(parent, keyId, idNumber, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.revokeUid: keyId=" + keyId + ", idNumber=" + idNumber + "\n");
    return editKey(parent, true, null, keyId, "", {
        idNumber: idNumber,
        step: 0,
        usePassphrase: true
      },
      revokeUidCallback,
      null,
      callbackFunc);
  },

  addPhoto: function(parent, keyId, photoFile, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.addPhoto: keyId=" + keyId + "\n");

    var photoFileName = EnigmailFiles.getEscapedFilename(EnigmailFiles.getFilePath(photoFile.QueryInterface(Ci.nsIFile)));

    return editKey(parent, true, null, keyId, "addphoto", {
        file: photoFileName,
        step: 0,
        usePassphrase: true
      },
      addPhotoCallback,
      null,
      function _f(returnCode, errorMsg) {
        runKeyTrustCheck();
        EnigmailKeyRing.updateKeys([keyId]);
        callbackFunc(returnCode, errorMsg);
      });
  },


  genCardKey: function(parent, name, email, comment, expiry, backupPasswd, requestObserver, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.genCardKey: \n");
    var generateObserver = new EnigCardAdminObserver(requestObserver, EnigmailOS.isDosLike);
    return editKey(parent, false, null, "", ["--with-colons", "--card-edit"], {
        step: 0,
        name: EnigmailData.convertFromUnicode(name),
        email: email,
        comment: EnigmailData.convertFromUnicode(comment),
        expiry: expiry,
        backupPasswd: backupPasswd,
        cardAdmin: true,
        backupKey: (backupPasswd.length > 0 ? "Y" : "N"),
        parent: parent
      },
      genCardKeyCallback,
      generateObserver,
      callbackFunc);
  },

  cardAdminData: function(parent, name, firstname, lang, sex, url, login, forcepin, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.cardAdminData: parent=" + parent + ", name=" + name + ", firstname=" + firstname + ", lang=" + lang + ", sex=" + sex + ", url=" + url +
      ", login=" + login + ", forcepin=" + forcepin + "\n");
    var adminObserver = new EnigCardAdminObserver(null, EnigmailOS.isDosLike);
    return editKey(parent, false, null, "", ["--with-colons", "--card-edit"], {
        step: 0,
        name: name,
        firstname: firstname,
        lang: lang,
        sex: sex,
        url: url,
        login: login,
        cardAdmin: true,
        forcepin: forcepin
      },
      cardAdminDataCallback,
      adminObserver,
      callbackFunc);
  },

  cardChangePin: function(parent, action, oldPin, newPin, adminPin, pinObserver, callbackFunc) {
    EnigmailLog.DEBUG("keyEdit.jsm: Enigmail.cardChangePin: parent=" + parent + ", action=" + action + "\n");
    var adminObserver = new EnigCardAdminObserver(pinObserver, EnigmailOS.isDosLike);

    return editKey(parent, true, null, "", ["--with-colons", "--card-edit"], {
        step: 0,
        pinStep: 0,
        cardAdmin: true,
        action: action,
        oldPin: oldPin,
        newPin: newPin,
        adminPin: adminPin
      },
      cardChangePinCallback,
      adminObserver,
      callbackFunc);
  }

}; // EnigmailKeyEditor


function signKeyCallback(inputData, keyEdit, ret) {

  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_BOOL, "sign_uid.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "keyedit.sign_all.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_LINE, "sign_uid.expire")) {
    ret.exitCode = 0;
    ret.writeTxt = "0";
  }
  else if (keyEdit.doCheck(GET_LINE, "trustsig_prompt.trust_value")) {
    ret.exitCode = 0;
    ret.writeTxt = "0";
  }
  else if (keyEdit.doCheck(GET_LINE, "trustsig_prompt.trust_depth")) {
    ret.exitCode = 0;
    ret.writeTxt = "";
  }
  else if (keyEdit.doCheck(GET_LINE, "trustsig_prompt.trust_regexp")) {
    ret.exitCode = 0;
    ret.writeTxt = "0";
  }
  else if (keyEdit.doCheck(GET_LINE, "siggen.valid")) {
    ret.exitCode = 0;
    ret.writeTxt = "0";
  }
  else if (keyEdit.doCheck(GET_BOOL, "sign_uid.local_promote_okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "sign_uid.replace_expired_okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_LINE, "sign_uid.class")) {
    ret.exitCode = 0;
    ret.writeTxt = String(inputData.trustLevel);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.quitNow = true;
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function keyTrustCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "edit_ownertrust.value")) {
    ret.exitCode = 0;
    ret.writeTxt = String(inputData.trustLevel);
  }
  else if (keyEdit.doCheck(GET_BOOL, "edit_ownertrust.set_ultimate.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.quitNow = true;
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

/**
 *
 * @param  Array   inputData  Has the keys ...
 *                        expiryLength (String): e.g. 8m = 8 month, 5 = 5 days, 3y = 3 years, 0 = never
 *                        subKeys (array): list of still unprocessed subkeys
 *                        currentSubKey (Integer or false): current subkey in progress
 * @param  Object  keyEdit    Readonly messages from GPG.
 * @param  Object  ret
 */
function keyExpiryCallback(inputData, keyEdit, ret) {
  EnigmailLog.DEBUG("keyEdit.jsm: keyExpiryCallback()\n");

  ret.writeTxt = "";
  ret.errorMsg = "";

  if (inputData.subKeys.length === 0) {
    // zero keys are submitted to edit: this must be a mistake.
    ret.exitCode = -1;
    ret.quitNow = true;
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    if (inputData.currentSubKey === false) {
      // currently no subkey is selected. Chose the first subkey.
      inputData.currentSubKey = inputData.subKeys[0];
      ret.exitCode = 0;
      ret.writeTxt = "key " + inputData.currentSubKey;
    }
    else if (inputData.currentSubKey === inputData.subKeys[0]) {
      // a subkey is selected. execute command "expire"
      ret.exitCode = 0;
      ret.writeTxt = "expire";
    }
    else {
      // if (inputData.currentSubKey === inputData.subKeys[0])
      // unselect the previous used subkey
      ret.exitCode = 0;
      ret.writeTxt = "key " + inputData.currentSubKey;
      inputData.currentSubKey = false;
    }
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.valid")) {
    // submit the expiry length.
    ret.exitCode = 0;
    ret.writeTxt = inputData.expiryLength;
    // processing of the current subkey is through.
    // remove current subkey from list of "to be processed keys".
    inputData.subKeys.splice(0, 1);
    // if the list of "to be processed keys" is empty, then quit.
    if (inputData.subKeys.length === 0) {
      ret.quitNow = true;
    }
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function addUidCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "keygen.name")) {
    ++inputData.nameAsked;
    if (inputData.nameAsked == 1) {
      ret.exitCode = 0;
      ret.writeTxt = inputData.name;
    }
    else {
      ret.exitCode = -1;
      ret.quitNow = true;
      ret.errorMsg = "Invalid name (too short)";
    }
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.email")) {
    ++inputData.emailAsked;
    if (inputData.emailAsked == 1) {
      ret.exitCode = 0;
      ret.writeTxt = inputData.email;
    }
    else {
      ret.exitCode = -1;
      ret.quitNow = true;
      ret.errorMsg = "Invalid email";
    }
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.comment")) {
    ret.exitCode = 0;
    if (inputData.comment) {
      ret.writeTxt = inputData.comment;
    }
    else {
      ret.writeTxt = "";
    }
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.quitNow = true;
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function revokeCertCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "ask_revocation_reason.code")) {
    ret.exitCode = 0;
    ret.writeTxt = String(inputData.reasonCode);
  }
  else if (keyEdit.doCheck(GET_LINE, "ask_revocation_reason.text")) {
    ret.exitCode = 0;
    ret.writeTxt = "";
  }
  else if (keyEdit.doCheck(GET_BOOL, "gen_revoke.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "ask_revocation_reason.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "openfile.overwrite.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.quitNow = true;
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function setPrimaryUidCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ++inputData.step;
    switch (inputData.step) {
      case 1:
        ret.exitCode = 0;
        ret.writeTxt = "uid " + inputData.idNumber;
        break;
      case 2:
        ret.exitCode = 0;
        ret.writeTxt = "primary";
        break;
      case 3:
        ret.exitCode = 0;
        ret.quitNow = true;
        break;
      default:
        ret.exitCode = -1;
        ret.quitNow = true;
    }

  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function changePassphraseCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_HIDDEN, "passphrase.enter")) {
    switch (inputData.observer.passphraseStatus) {
      case 0:
        ret.writeTxt = inputData.oldPw;
        ret.exitCode = 0;
        break;
      case 1:
        ret.writeTxt = inputData.newPw;
        ret.exitCode = 0;
        break;
      case -1:
        ret.exitCode = -2;
        ret.quitNow = true;
        break;
    }
  }
  else if (keyEdit.doCheck(GET_BOOL, "change_passwd.empty.okay")) {
    ret.writeTxt = "Y";
    ret.exitCode = 0;
  }
  else if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.quitNow = true;
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function deleteUidCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ++inputData.step;
    switch (inputData.step) {
      case 1:
        ret.exitCode = 0;
        ret.writeTxt = "uid " + inputData.idNumber;
        break;
      case 2:
        ret.exitCode = 0;
        ret.writeTxt = "deluid";
        break;
      case 4:
        ret.exitCode = 0;
        ret.quitNow = true;
        break;
      default:
        ret.exitCode = -1;
        ret.quitNow = true;
    }
  }
  else if (keyEdit.doCheck(GET_BOOL, "keyedit.remove.uid.okay")) {
    ++inputData.step;
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function revokeUidCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ++inputData.step;
    switch (inputData.step) {
      case 1:
        ret.exitCode = 0;
        ret.writeTxt = "uid " + inputData.idNumber;
        break;
      case 2:
        ret.exitCode = 0;
        ret.writeTxt = "revuid";
        break;
      case 7:
        ret.exitCode = 0;
        ret.quitNow = true;
        break;
      default:
        ret.exitCode = -1;
        ret.quitNow = true;
    }
  }
  else if (keyEdit.doCheck(GET_BOOL, "keyedit.revoke.uid.okay")) {
    ++inputData.step;
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_LINE, "ask_revocation_reason.code")) {
    ++inputData.step;
    ret.exitCode = 0;
    ret.writeTxt = "0"; // no reason specified
  }
  else if (keyEdit.doCheck(GET_LINE, "ask_revocation_reason.text")) {
    ++inputData.step;
    ret.exitCode = 0;
    ret.writeTxt = "";
  }
  else if (keyEdit.doCheck(GET_BOOL, "ask_revocation_reason.okay")) {
    ++inputData.step;
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}


function deleteKeyCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_BOOL, "delete_key.secret.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "keyedit.remove.subkey.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_BOOL, "delete_key.okay")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function getPin(domWindow, promptMsg, ret) {
  EnigmailLog.DEBUG("keyEdit.jsm: getPin: \n");

  var passwdObj = {
    value: ""
  };
  var dummyObj = {};

  var success = false;

  var promptService = Cc[NS_PROMPTSERVICE_CONTRACTID].getService(Ci.nsIPromptService);
  success = promptService.promptPassword(domWindow,
    EnigmailLocale.getString("Enigmail"),
    promptMsg,
    passwdObj,
    null,
    dummyObj);

  if (!success) {
    ret.errorMsg = EnigmailLocale.getString("noPassphrase");
    ret.quitNow = true;
    return false;
  }

  EnigmailLog.DEBUG("keyEdit.jsm: getPin: got pin\n");
  ret.writeTxt = passwdObj.value;

  return true;
}

function genCardKeyCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  var pinObj = {};

  if (keyEdit.doCheck(GET_LINE, "cardedit.prompt")) {
    if (inputData.step === 0) {
      ret.exitCode = 0;
      ret.writeTxt = "admin";
    }
    else if (inputData.step == 1) {
      ret.exitCode = 0;
      ret.writeTxt = "generate";
    }
    else {
      ret.exitCode = 0;
      ret.quitNow = true;
      ret.writeTxt = "quit";
    }
    ++inputData.step;
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.genkeys.backup_enc") ||
    keyEdit.doCheck(GET_BOOL, "cardedit.genkeys.backup_enc")) {
    ret.exitCode = 0;
    ret.writeTxt = String(inputData.backupKey);
  }
  else if (keyEdit.doCheck(GET_BOOL, "cardedit.genkeys.replace_keys")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y";
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.enter")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.backupPasswd;
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.valid")) {
    ret.exitCode = 0;
    ret.writeTxt = String(inputData.expiry);
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.genkeys.size")) {
    ret.exitCode = 0;
    ret.writeTxt = "2048";
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.name")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.name;
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.email")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.email;
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.comment")) {
    ret.exitCode = 0;
    if (inputData.comment) {
      ret.writeTxt = inputData.comment;
    }
    else {
      ret.writeTxt = "";
    }
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function cardAdminDataCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  var pinObj = {};

  if (keyEdit.doCheck(GET_LINE, "cardedit.prompt")) {
    ++inputData.step;
    ret.exitCode = 0;
    switch (inputData.step) {
      case 1:
        ret.writeTxt = "admin";
        break;
      case 2:
        ret.writeTxt = "name";
        break;
      case 3:
        ret.writeTxt = "lang";
        break;
      case 4:
        ret.writeTxt = "sex";
        break;
      case 5:
        ret.writeTxt = "url";
        break;
      case 6:
        ret.writeTxt = "login";
        break;
      case 7:
        if (inputData.forcepin !== 0) {
          ret.writeTxt = "forcesig";
        }
        else {
          ret.writeTxt = "quit";
          ret.exitCode = 0;
          ret.quitNow = true;
        }
        break;
      default:
        ret.writeTxt = "quit";
        ret.exitCode = 0;
        ret.quitNow = true;
        break;
    }
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.smartcard.surname")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.name.replace(/^$/, "-");
  }
  else if (keyEdit.doCheck(GET_LINE, "keygen.smartcard.givenname")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.firstname.replace(/^$/, "-");
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.change_sex")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.sex;
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.change_lang")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.lang.replace(/^$/, "-");
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.change_url")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.url.replace(/^$/, "-");
  }
  else if (keyEdit.doCheck(GET_LINE, "cardedit.change_login")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.login.replace(/^$/, "-");
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function cardChangePinCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "cardedit.prompt")) {
    ++inputData.step;
    ret.exitCode = 0;
    switch (inputData.step) {
      case 1:
        ret.writeTxt = "admin";
        break;
      case 2:
        ret.writeTxt = "passwd";
        break;
      default:
        ret.writeTxt = "quit";
        ret.exitCode = 0;
        ret.quitNow = true;
        break;
    }
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.adminPin;
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.oldPin;
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.new.ask") ||
    keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.repeat") ||
    keyEdit.doCheck(GET_HIDDEN, "passphrase.ask") ||
    keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.new.ask")) {
    ret.exitCode = 0;
    ret.writeTxt = inputData.newPin;
  }
  else if (keyEdit.doCheck(GET_LINE, "cardutil.change_pin.menu")) {
    ret.exitCode = 0;
    ++inputData.pinStep;
    if (inputData.pinStep == 1) {
      ret.writeTxt = inputData.action.toString();
    }
    else {
      ret.writeTxt = "Q";
    }
  }
  else {
    ret.exitCode = -1;
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
  }
}


function addPhotoCallback(inputData, keyEdit, ret) {
  ret.writeTxt = "";
  ret.errorMsg = "";

  if (keyEdit.doCheck(GET_LINE, "keyedit.prompt")) {
    ret.exitCode = 0;
    ret.writeTxt = "save";
    ret.quitNow = true;
  }
  else if (keyEdit.doCheck(GET_LINE, "photoid.jpeg.add")) {
    if (inputData.step === 0) {
      ++inputData.step;
      ret.exitCode = 0;
      ret.writeTxt = inputData.file;
    }
    else {
      ret.exitCode = -1;
      ret.quitNow = true;
    }
  }
  else if (keyEdit.doCheck(GET_BOOL, "photoid.jpeg.size")) {
    ret.exitCode = 0;
    ret.writeTxt = "Y"; // add large file
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.adminpin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterAdminPin"), ret);
  }
  else if (keyEdit.doCheck(GET_HIDDEN, "passphrase.pin.ask")) {
    getPin(inputData.parent, EnigmailLocale.getString("enterCardPin"), ret);
  }
  else {
    ret.quitNow = true;
    EnigmailLog.ERROR("Unknown command prompt: " + keyEdit.getText() + "\n");
    ret.exitCode = -1;
  }
}

function EnigCardAdminObserver(guiObserver, isDosLike) {
  this._guiObserver = guiObserver;
  this._isDosLike = isDosLike;
}

EnigCardAdminObserver.prototype = {
  _guiObserver: null,
  _failureCode: 0,

  onDataAvailable: function(data) {
    var ret = "";
    EnigmailLog.DEBUG("keyEdit.jsm: enigCardAdminObserver.onDataAvailable: data=" + data + "\n");
    if (this._isDosLike && data.indexOf("[GNUPG:] BACKUP_KEY_CREATED") === 0) {
      data = data.replace(/\//g, "\\");
    }
    if (data.indexOf("[GNUPG:] SC_OP_FAILURE") >= 0) {
      data = data.substr(23);
      if (data == "2") {
        data = "[GNUPG:] BAD_PASSPHRASE 0";
        this._failureCode = 2;
      }
      else
        this._failureCode = 1;
    }
    if (this._failureCode == 1) {
      ret = "[GNUPG:] ENIGMAIL_FAILURE " + data;
    }
    if (this._guiObserver) {
      this._guiObserver.onDataAvailable(data);
    }
    return ret;
  }
};

function ChangePasswdObserver() {}

ChangePasswdObserver.prototype = {
  _failureCode: 0,
  passphraseStatus: 0,

  onDataAvailable: function(data) {
    var ret = "";
    EnigmailLog.DEBUG("keyEdit.jsm: ChangePasswdObserver.onDataAvailable: data=" + data + "\n");
    if (this._failureCode) {
      ret = "[GNUPG:] ENIGMAIL_FAILURE " + data;
    }
    if (data.indexOf("[GNUPG:] GOOD_PASSPHRASE") >= 0) {
      this.passphraseStatus = 1;
    }
    else if (data.indexOf("[GNUPG:] BAD_PASSPHRASE") >= 0) {
      this.passphraseStatus = -1;
    }
    return ret;
  }
};
