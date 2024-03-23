#filter dumbComments emptyLines substitution

// This Source Code Form is subject to the terms of the Mozilla Public
// License, v. 2.0. If a copy of the MPL was not distributed with this
// file, You can obtain one at http://mozilla.org/MPL/2.0/.

//
// Prefs shared by OpenPGP and S/MIME
//

pref("mail.identity.default.encryptionpolicy", 0);
pref("mail.identity.default.sign_mail", false);

//
// S/MIME prefs
//

pref("mail.identity.default.encryption_cert_name", "");
pref("mail.identity.default.signing_cert_name", "");

//
// OpenPGP prefs
//

pref("openpgp.loglevel", "Warn");

// If true, we allow the use of GnuPG for OpenPGP secret key operations
pref("mail.openpgp.allow_external_gnupg", false);
// If allow_external_gnupg is true: Optionally use a different gpg executable
pref("mail.openpgp.alternative_gpg_path", "");
// The hexadecimal OpenPGP key ID used for an identity.
pref("mail.identity.default.openpgp_key_id", "");
// If true, then openpgp_key_id is managed externally by GnuPG
pref("mail.identity.default.is_gnupg_key_id", false);
// The hexadecimal OpenPGP key ID externally configured by GnuPG used for an identity.
pref("mail.identity.default.last_entered_external_gnupg_key_id", "");
// When using external GnuPG, also load public keys from GnuPG keyring
pref("mail.openpgp.fetch_pubkeys_from_gnupg", false);

// When sending an OpenPGP message that is both signed and encrypted,
// it's possible to use one combined MIME layer, or separate layers.
pref("mail.openpgp.separate_mime_layers", false);

// Load a JSON file that contains recipient key alias rules. See bug 1644085.
// Suggested filename: openpgp-alias-rules.json
// Simple filenames (without path) are loaded from the profile directory.
// If you need to specify a path, use a file:// URL
pref("mail.openpgp.alias_rules_file", "");

// If set to true, enable user interface that allows the user to optionally set
// and manage individual, user-defined passphrases for OpenPGP secret keys.
// If set to false, the respective user interface will be hidden.
// Even when set to true, the user may decide to use the original approach
// for OpenPGP key protection (using the global primary password or none),
// by selecting the respective choices in the user interface.
// Note, if a user sets an user-defined passphrase while this this setting
// is true, and then switches this setting to false, the keys will keep
// the user-defined passphrase protection. The application will still prompt
// to unlock the key using the user-defined passphrase whenever necessary.
pref("mail.openpgp.passphrases.enabled", false);

// Automatically enable encryption if S/MIME certificates or OpenPGP keys are
// available for all recipients, and thus encryption is possible.
// This pref is only about enabling, and doesn't control automatic disabling.
pref("mail.e2ee.auto_enable", false);

// If end-to-end encryption with S/MIME or OpenPGP is enabled,
// and the user adds another recipient with unavailable certificate or key,
// and this preference is true, then automatically disable encryption.
// This pref is dangerous, and it is recommended to always keep it at false.
// If you change the pref to true, the user might assume that encryption
// is still enabled, and might not notice that encryption gets disabled.
// There is an exception: If encryption was enabled, because the message
// refers to an existing encrypted conversation (e.g. replying to an
// encrypted message), this preference is ignored, encryption will
// remain on. It isn't possible to override that behavior.
// Note that encryption will never be disabled automatically on sending,
// only when the list of recipients is changed.
// If mail.e2ee.auto_enable is false, then mail.e2ee.auto_disable
// will be ignored.
pref("mail.e2ee.auto_disable", false);

// If end-to-end encryption gets automatically disabled, inform the user
// using a prompt.
pref("mail.e2ee.notify_on_auto_disable", true);

// If false, disable the reminder in composer, whether email could be
// sent with OpenPGP encryption (without further user actions/decisions).
pref("mail.openpgp.remind_encryption_possible", true);

// If false, disable the reminder in composer, whether email could be
// sent with S/MIME encryption (without further user actions/decisions).
pref("mail.smime.remind_encryption_possible", true);

pref("mail.smime.accept_insecure_sha1_message_signatures", false);

// When sending, encrypt to this additional key. Not available in release channel builds.
pref("mail.openpgp.debug.extra_encryption_key", "");

// Allow import of problematic OpenPGP keys, if import otherwise fails.
// Don't enable, unless you know how to manually clean up failures in OpenPGP storage.
pref("mail.openpgp.allow_permissive_import", false);

// Hide prefs and menu entries from non-advanced users
pref("temp.openpgp.advancedUser", false);

// ** enigmail keySel preferences:
// use rules to assign keys
pref("temp.openpgp.assignKeysByRules", true);
// use email addresses to assign keys
pref("temp.openpgp.assignKeysByEmailAddr", true);
// use manual dialog to assign missing keys
pref("temp.openpgp.assignKeysManuallyIfMissing", true);
// always srats manual dialog for keys
pref("temp.openpgp.assignKeysManuallyAlways", false);

// countdown for alerts when composing inline PGP HTML msgs
pref("temp.openpgp.composeHtmlAlertCount", 3);

// show warning message when clicking on sign icon
pref("temp.openpgp.displaySignWarn", true);

// try to match secondary uid to from address
pref("temp.openpgp.displaySecondaryUid", true);

// treat '-- ' as signature separator
pref("temp.openpgp.doubleDashSeparator", true);

// skip the attachments dialog
pref("temp.openpgp.encryptAttachmentsSkipDlg", 0);

// Encrypt to self
pref("temp.openpgp.encryptToSelf", true);

// enable 'Decrypt & open' for double click on attachment (if possible)
pref("temp.openpgp.handleDoubleClick", true);

// disable '<' and '>' around email addresses
pref("temp.openpgp.hushMailSupport", false);

// use -a for encrypting attachments for inline PGP
pref("temp.openpgp.inlineAttachAsciiArmor", false);

// extension to append for inline-encrypted attachments
pref("temp.openpgp.inlineAttachExt", ".pgp");

// extension to append for inline-signed attachments
pref("temp.openpgp.inlineSigAttachExt", ".sig");

// debug log directory (if set, also enabled debugging)
pref("temp.openpgp.logDirectory", "");

// List of key servers to use (comma separated list), ordered by priority.
// Only the first supported keyserver will be used for uploading keys.
pref("mail.openpgp.keyserver_list", "vks://keys.openpgp.org, hkps://keys.mailvelope.com");

// keep passphrase for ... minutes
pref("temp.openpgp.maxIdleMinutes", 5);

// maximum number of parallel decrypt processes that Enigmaik will handle
// (requests above the threshold are ignored)
pref("temp.openpgp.maxNumProcesses", 3);

// GnuPG hash algorithm
// 0: automatic seletion (i.e. let GnuPG choose)
// 1: SHA1, 2: RIPEMD160, 3: SHA256, 4: SHA384, 5: SHA512, 6: SHA224
pref("temp.openpgp.mimeHashAlgorithm", 0);

// no passphrase for GnuPG key needed
pref("temp.openpgp.noPassphrase", false);

// use http proxy settings as set in Mozilla/Thunderbird
pref("temp.openpgp.respectHttpProxy", true);

// selection for which encryption model to prefer
// 0: convenient encryption settings DEFAULT
// 1: manual encryption settings
pref("temp.openpgp.encryptionModel", 0);

// enable encryption for replies to encrypted mails
pref("temp.openpgp.keepSettingsForReply", true);

// holds the last result of the dayily key expiry check
pref("temp.openpgp.keyCheckResult", "");

// selection for automatic send encrypted if all keys valid
// 0: never
// 1: if all keys found and accepted DEFAULT
pref("temp.openpgp.autoSendEncrypted", 1);

// enable automatic lookup of keys using Web Key Directory (WKD)
// (see https://tools.ietf.org/html/draft-koch-openpgp-webkey-service)
// 0: no
// 1: yes DEFAULT
pref("temp.openpgp.autoWkdLookup", 1);

// ask to confirm before sending
// 0: never DEFAULT
// 1: always
// 2: if send encrypted
// 3: if send unencrypted
// 4: if send (un)encrypted due to rules
pref("temp.openpgp.confirmBeforeSending", 0);

// show "Missing Trust in own keys" message (and remember selected state)
pref("temp.openpgp.warnOnMissingOwnerTrust", true);

// use GnuPG's default instead of Enigmail/Mozilla comment of for signed messages
pref("temp.openpgp.useDefaultComment", true);

// holds the timestamp of the last check for GnuPG updates
pref("temp.openpgp.gpgLastUpdate", "0");

// set locale for GnuPG calls to en-US (Windows only)
pref("temp.openpgp.gpgLocaleEn", true);

// use PGP/MIME (0=never, 1=allow, 2=always)
// pref("temp.openpgp.usePGPMimeOption",1); -- OBSOLETE, see mail.identity.default.pgpMimeMode

// show "conflicting rules" message (and remember selected state)
pref("temp.openpgp.warnOnRulesConflict", 0);

// display a warning when the passphrase is cleared
pref("temp.openpgp.warnClearPassphrase", true);

// display a warning if the GnuPG version is deprecated
pref("temp.openpgp.warnDeprecatedGnuPG", true);

// warn if gpg-agent is found and "remember passphrase for X minutes is active"
pref("temp.openpgp.warnGpgAgentAndIdleTime", true);

// display a warning when the keys for all contacts are downloaded
pref("temp.openpgp.warnDownloadContactKeys", true);

// wrap HTML messages before sending inline PGP messages
pref("temp.openpgp.wrapHtmlBeforeSend", true);

// do reset the "references" and "in-reply-to" headers?
pref("temp.openpgp.protectReferencesHdr", false);

// tor configuration
pref("temp.openpgp.torIpAddr", "127.0.0.1");
pref("temp.openpgp.torServicePort", "9050");
pref("temp.openpgp.torBrowserBundlePort", "9150");

// gpg tor actions
pref("temp.openpgp.downloadKeyWithTor", false);
pref("temp.openpgp.downloadKeyRequireTor", false);
pref("temp.openpgp.searchKeyWithTor", false);
pref("temp.openpgp.searchKeyRequireTor", false);
pref("temp.openpgp.uploadKeyWithTor", false);
pref("temp.openpgp.uploadKeyRequireTor", false);

// enable experimental features.
// WARNING: such features may unfinished functions or tests that can break
// existing functionality in Enigmail and Thunderbird!
pref("temp.openpgp.enableExperiments", false);


// Default pref values for the enigmail per-identity
// settings

pref("mail.identity.default.sendAutocryptHeaders", true);
pref("mail.identity.default.attachPgpKey", true);
pref("mail.identity.default.autoEncryptDrafts", true);
pref("mail.identity.default.protectSubject", true);

// 0 selected automatically, 1 prefer S/MIME, 2 prefer OpenPGP
pref("mail.identity.default.e2etechpref", 0);

//
// Other settings (change Mozilla behaviour)
//

// disable flowed text by default
// TODO: pref("mailnews.send_plaintext_flowed", false);

