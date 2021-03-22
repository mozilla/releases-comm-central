/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const EXPORTED_SYMBOLS = ["OpenPGPTestUtils"];

const { Assert } = ChromeUtils.import("resource://testing-common/Assert.jsm");
const { BrowserTestUtils } = ChromeUtils.import(
  "resource://testing-common/BrowserTestUtils.jsm"
);
const EventUtils = ChromeUtils.import(
  "resource://testing-common/mozmill/EventUtils.jsm"
);

const { XPCOMUtils } = ChromeUtils.import(
  "resource://gre/modules/XPCOMUtils.jsm"
);

XPCOMUtils.defineLazyModuleGetters(this, {
  OpenPGPAlias: "chrome://openpgp/content/modules/OpenPGPAlias.jsm",
  EnigmailCore: "chrome://openpgp/content/modules/core.jsm",
  EnigmailKeyRing: "chrome://openpgp/content/modules/keyRing.jsm",
  EnigmailFiles: "chrome://openpgp/content/modules/files.jsm",
  RNP: "chrome://openpgp/content/modules/RNP.jsm",
  PgpSqliteDb2: "chrome://openpgp/content/modules/sqliteDb.jsm",
  uidHelper: "chrome://openpgp/content/modules/uidHelper.jsm",
});

const OpenPGPTestUtils = {
  ACCEPTANCE_PERSONAL: "personal",
  ACCEPTANCE_REJECTED: "rejected",
  ACCEPTANCE_UNVERIFIED: "unverified",
  ACCEPTANCE_VERIFIED: "verified",
  ACCEPTANCE_UNDECIDED: "undecided",
  ALICE_KEY_ID: "F231550C4F47E38E",
  BOB_KEY_ID: "FBFCC82A015E7330",
  CAROL_KEY_ID: "3099FF1238852B9F",

  /**
   * Given a compose message window, clicks on the "Digitally Sign This Message"
   * menu item.
   */
  async toggleMessageSigning(win) {
    return clickMenuOption(win, "#menu_securitySign_Menubar");
  },

  /**
   * Given a compose message window, clicks on the "Attach My Public Key"
   * menu item.
   */
  async toggleMessageKeyAttachment(win) {
    return clickMenuOption(win, "#menu_securityMyPublicKey_Menubar");
  },

  /**
   * Given a compose message window, clicks on the "Require Encryption"
   * menu item.
   */
  async toggleMessageEncryption(win) {
    return clickMenuOption(win, "#menu_securityEncryptRequire_Menubar");
  },

  /**
   * For xpcshell-tests OpenPGP is not intialized automatically. This method
   * should be called at the start of testing.
   */
  async initOpenPGP() {
    Assert.ok(await RNP.init(), "librnp did load");
    Assert.ok(await EnigmailCore.getService({}), "EnigmailCore did load");
    EnigmailKeyRing.init();
    await OpenPGPAlias.load();
  },

  /**
   * Tests whether the signed icon's "signed" attribute matches the provided
   * state.
   *
   * @param {HTMLDocument} doc - The document of the message window.
   * @param {string} state - The state to test for.
   * @returns {boolean}
   */
  hasSignedIconState(doc, state) {
    return doc.querySelector(`#signedHdrIcon[signed=${state}]`) != null;
  },

  /**
   * Checks that the signed icon's "signed" attribute has none of the supported
   * states.
   *
   * @param {HTMLDocument} doc - The document of the message window.
   * @returns {boolean}
   */
  hasNoSignedIconState(doc) {
    return (
      !OpenPGPTestUtils.hasSignedIconState(doc, "ok") &&
      !OpenPGPTestUtils.hasSignedIconState(doc, "notok") &&
      !OpenPGPTestUtils.hasSignedIconState(doc, "verified") &&
      !OpenPGPTestUtils.hasSignedIconState(doc, "unverified") &&
      !OpenPGPTestUtils.hasSignedIconState(doc, "mismatch") &&
      !OpenPGPTestUtils.hasSignedIconState(doc, "unknown")
    );
  },

  /**
   * Tests whether the encrypted icon's "encrypted" attribute matches the
   * provided state value.
   *
   * @param {HTMLDocument} doc - The document of the message window.
   * @param {string} state - The state to test for.
   * @returns {boolean}
   */
  hasEncryptedIconState(doc, state) {
    return doc.querySelector(`#encryptedHdrIcon[encrypted=${state}]`) != null;
  },

  /**
   * Imports a public key into the keyring while also updating its acceptance.
   *
   * @param {nsIWindow} parent - The parent window.
   * @param {nsIFile} file - A valid file containing a public OpenPGP key.
   * @param {string} [acceptance] - The acceptance setting for the key.
   * @return {string[]} - List of imported key ids.
   */
  async importPublicKey(
    parent,
    file,
    acceptance = OpenPGPTestUtils.ACCEPTANCE_VERIFIED
  ) {
    let ids = await OpenPGPTestUtils.importKey(parent, file, false);
    if (!ids.length) {
      throw new Error("importPublicKey filed");
    }
    return OpenPGPTestUtils.updateKeyIdAcceptance(ids, acceptance);
  },

  /**
   * Imports a private key into the keyring while also updating its acceptance.
   *
   * @param {nsIWindow} parent - The parent window.
   * @param {nsIFile} file - A valid file containing a private OpenPGP key.
   * @param {string} [acceptance] - The acceptance setting for the key.
   * @return {string[]} - List of imported key ids.
   */
  async importPrivateKey(
    parent,
    file,
    acceptance = OpenPGPTestUtils.ACCEPTANCE_PERSONAL
  ) {
    let ids = await OpenPGPTestUtils.importKey(parent, file, false, true);
    if (!ids.length) {
      throw new Error("importPrivateKey filed");
    }
    return OpenPGPTestUtils.updateKeyIdAcceptance(ids, acceptance);
  },

  /**
   * Imports a key into the keyring.
   *
   * @param {nsIWindow} parent - The parent window.
   * @param {nsIFile} file - A valid file containing an OpenPGP key.
   * @param {boolean} [isBinary] - false for ASCII armored files
   * @param {boolean} [isSecret=false] - Flag indicating if the key is secret or
   *                                     not.
   * @returns {Promise<string[]>} - A list of ids for the key(s) imported.
   */
  async importKey(parent, file, isBinary, isSecret = false) {
    let txt = EnigmailFiles.readFile(file);
    let errorObj = {};
    let fingerPrintObj = {};

    if (txt == "") {
      throw new Error(`Could not open key file at path "${file.path}"!`);
    }

    let result = EnigmailKeyRing.importKey(
      parent,
      false,
      txt,
      isBinary,
      null,
      errorObj,
      fingerPrintObj,
      false,
      [],
      isSecret
    );

    if (result !== 0) {
      console.debug(
        `EnigmailKeyRing.importKey failed with result "${result}"!`
      );
      return [];
    }
    return fingerPrintObj.value.slice();
  },

  /**
   * Updates the acceptance value of the provided key(s) in the database.
   *
   * @param {string|string[]} id - The id or list of ids to update.
   * @param {string} acceptance  - The new acceptance level for the key id.
   * @return {string[]} - A list of the key ids processed.
   */
  async updateKeyIdAcceptance(id, acceptance) {
    let ids = Array.isArray(id) ? id : [id];
    for (let id of ids) {
      let key = EnigmailKeyRing.getKeyById(id);
      let parts = {};
      uidHelper.getPartsFromUidStr(key.userId, parts);
      await PgpSqliteDb2.updateAcceptance(key.fpr, [parts.email], acceptance);
    }
    EnigmailKeyRing.clearCache();
    return ids.slice();
  },

  /**
   * Removes a key by its id, clearing its acceptance and refreshing the
   * cache.
   *
   * @param {string|string[]} id - The id or list of ids to remove.
   * @param {boolean} [deleteSecret=false] - If true, secret keys will be removed too.
   */
  async removeKeyById(id, deleteSecret = false) {
    let ids = Array.isArray(id) ? id : [id];
    for (let id of ids) {
      let key = EnigmailKeyRing.getKeyById(id);
      await RNP.deleteKey(key.fpr, deleteSecret);
      await PgpSqliteDb2.deleteAcceptance(key.fpr);
    }
    EnigmailKeyRing.clearCache();
  },
};

async function clickMenuOption(win, selector) {
  let menu = win.document.querySelector("#optionsMenu");
  let waitForShown = BrowserTestUtils.waitForEvent(menu, "popupshown");
  EventUtils.synthesizeMouseAtCenter(menu, {}, win);
  await waitForShown;

  let waitForClose = BrowserTestUtils.waitForEvent(menu, "popuphidden");
  EventUtils.synthesizeMouseAtCenter(
    win.document.querySelector(selector),
    {},
    win
  );
  await waitForClose;
}
