/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var EnigmailDialog = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
).EnigmailDialog;
var EnigmailLocale = ChromeUtils.import(
  "chrome://openpgp/content/modules/locale.jsm"
).EnigmailLocale;
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var EnigmailKeyRing = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
).EnigmailKeyRing;

var l10n = new Localization(["messenger/openpgp/enigmail.ftl"], true);

/**
 * opens a prompt, asking the user to enter passphrase for given key id
 * returns: the passphrase if entered (empty string is allowed)
 * resultFlags.canceled is set to true if the user clicked cancel
 */
function passphrasePromptCallback(win, keyId, resultFlags) {
  let p = {};
  p.value = "";
  let dummy = {};
  if (
    !Services.prompt.promptPassword(
      win,
      "",
      EnigmailLocale.getString("passphrasePrompt", [keyId]),
      p,
      null,
      dummy
    )
  ) {
    resultFlags.canceled = true;
    return "";
  }

  resultFlags.canceled = false;
  return p.value;
}

/**
 * import OpenPGP keys from file
 */
function EnigmailCommon_importKeysFromFile(secret) {
  let inFile = EnigmailDialog.filePicker(
    window,
    l10n.formatValueSync("import-key-file"),
    "",
    false,
    "*.asc",
    "",
    [l10n.formatValueSync("gnupg-file"), "*.asc;*.gpg;*.pgp"]
  );
  if (!inFile) {
    return false;
  }

  // infile type: nsIFile
  // RNP.maxImportKeyBlockSize
  if (inFile.fileSize > 5000000) {
    EnigmailDialog.alert(window, EnigmailLocale.getString("fileToBigToImport"));
    return false;
  }
  let errorMsgObj = {};
  // preview
  let preview = EnigmailKey.getKeyListFromKeyFile(
    inFile,
    errorMsgObj,
    !secret,
    secret
  );

  if (!preview || !preview.length || errorMsgObj.value) {
    document.l10n.formatValue("import-keys-failed").then(value => {
      EnigmailDialog.alert(window, value + "\n\n" + errorMsgObj.value);
    });
    return false;
  }
  let exitStatus = -1;

  if (preview.length > 0) {
    if (preview.length == 1) {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportOne", [
          preview[0].name,
          preview[0].id,
        ])
      );
    } else {
      exitStatus = EnigmailDialog.confirmDlg(
        window,
        EnigmailLocale.getString("doImportMultiple", [
          preview
            .map(function(a) {
              return "\t" + a.name + " (" + a.id + ")";
            })
            .join("\n"),
        ])
      );
    }

    if (exitStatus) {
      // import
      let resultKeys = {};
      let exitCode = EnigmailKeyRing.importKeyFromFile(
        window,
        passphrasePromptCallback,
        inFile,
        errorMsgObj,
        resultKeys,
        !secret,
        secret
      );
      if (exitCode !== 0) {
        document.l10n.formatValue("import-keys-failed").then(value => {
          EnigmailDialog.alert(window, value + "\n\n" + errorMsgObj.value);
        });
      } else {
        console.debug("import final resultKeys: %o", resultKeys.keys);
        EnigmailDialog.keyImportDlg(window, resultKeys.keys);
        return true;
      }
    }
  }

  return false;
}
