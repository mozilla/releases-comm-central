/*
 * This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/.
 */

"use strict";

var { Services } = ChromeUtils.import("resource://gre/modules/Services.jsm");
var { EnigmailDialog } = ChromeUtils.import(
  "chrome://openpgp/content/modules/dialog.jsm"
);
var { EnigmailKey } = ChromeUtils.import(
  "chrome://openpgp/content/modules/key.jsm"
);
var { EnigmailKeyRing } = ChromeUtils.import(
  "chrome://openpgp/content/modules/keyRing.jsm"
);
var { EnigmailArmor } = ChromeUtils.import(
  "chrome://openpgp/content/modules/armor.jsm"
);
var { EnigmailFiles } = ChromeUtils.import(
  "chrome://openpgp/content/modules/files.jsm"
);

var l10n = new Localization(["messenger/openpgp/openpgp.ftl"], true);

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
      l10n.formatValueSync("passphrase-prompt", {
        key: keyId,
      }),
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

// Return the first block of the wanted type (skip blocks of wrong type)
function getKeyBlockFromFile(path, wantSecret) {
  var contents = EnigmailFiles.readFile(path);
  if (!contents) {
    return "";
  }

  let searchOffset = 0;

  while (searchOffset < contents.length) {
    const beginIndexObj = {};
    const endIndexObj = {};
    const blockType = EnigmailArmor.locateArmoredBlock(
      contents,
      searchOffset,
      "",
      beginIndexObj,
      endIndexObj,
      {}
    );
    if (!blockType) {
      return "";
    }

    if (
      (wantSecret && blockType.search(/^PRIVATE KEY BLOCK$/) !== 0) ||
      (!wantSecret && blockType.search(/^PUBLIC KEY BLOCK$/) !== 0)
    ) {
      searchOffset = endIndexObj.value;
      continue;
    }

    return contents.substr(
      beginIndexObj.value,
      endIndexObj.value - beginIndexObj.value + 1
    );
  }
  return "";
}

/**
 * import OpenPGP keys from file
 * @param {string} what - "rev" for revocation, "pub" for public keys, "sec" for secret keys.
 */
function EnigmailCommon_importObjectFromFile(what) {
  let importingRevocation = what == "rev";
  let promptStr = importingRevocation ? "import-rev-file" : "import-key-file";

  let files = EnigmailDialog.filePicker(
    window,
    l10n.formatValueSync(promptStr),
    "",
    false,
    true,
    "*.asc",
    "",
    [l10n.formatValueSync("gnupg-file"), "*.asc;*.gpg;*.pgp"]
  );

  if (!files.length) {
    return;
  }

  for (let file of files) {
    if (file.fileSize > 5000000) {
      document.l10n.formatValue("file-to-big-to-import").then(value => {
        EnigmailDialog.alert(window, value);
      });
      continue;
    }

    let errorMsgObj = {};

    if (importingRevocation) {
      EnigmailKeyRing.importRevFromFile(file);
      continue;
    }

    let isSecret = what == "sec";
    let importBinary = false;
    let keyBlock = getKeyBlockFromFile(file, isSecret);

    // if we don't find an ASCII block, try to import as binary.
    if (!keyBlock) {
      importBinary = true;
      keyBlock = EnigmailFiles.readFile(file);
    }

    // Generat a preview of the imported key.
    let preview = EnigmailKey.getKeyListFromKeyBlock(
      keyBlock,
      errorMsgObj,
      true, // interactive
      !isSecret,
      isSecret
    );

    if (!preview || !preview.length || errorMsgObj.value) {
      document.l10n.formatValue("import-keys-failed").then(value => {
        EnigmailDialog.alert(window, value + "\n\n" + errorMsgObj.value);
      });
      continue;
    }

    if (preview.length > 0) {
      let confirmImport = false;
      let autoAcceptance = null;
      if (isSecret) {
        if (preview.length == 1) {
          confirmImport = EnigmailDialog.confirmDlg(
            window,
            l10n.formatValueSync("do-import-one", {
              name: preview[0].name,
              id: preview[0].id,
            })
          );
        } else {
          confirmImport = EnigmailDialog.confirmDlg(
            window,
            l10n.formatValueSync("do-import-multiple", {
              key: preview
                .map(function(a) {
                  return "\t" + a.name + " (" + a.id + ")";
                })
                .join("\n"),
            })
          );
        }
      } else {
        let outParam = {};
        confirmImport = EnigmailDialog.confirmPubkeyImport(
          window,
          preview,
          outParam
        );
        if (confirmImport) {
          autoAcceptance = outParam.acceptance;
        }
      }

      if (confirmImport) {
        // import
        let resultKeys = {};

        let importExitCode = EnigmailKeyRing.importKey(
          window,
          false, // interactive, we already asked for confirmation
          keyBlock,
          importBinary,
          null, // expected keyId, ignored
          errorMsgObj,
          resultKeys,
          false, // minimize
          [], // filter
          isSecret,
          true, // allow prompt for permissive
          passphrasePromptCallback,
          autoAcceptance
        );

        if (importExitCode !== 0) {
          document.l10n.formatValue("import-keys-failed").then(value => {
            EnigmailDialog.alert(window, value + "\n\n" + errorMsgObj.value);
          });
          continue;
        }

        EnigmailDialog.keyImportDlg(window, resultKeys.value);
      }
    }
  }
}
