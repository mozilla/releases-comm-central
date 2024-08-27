/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";
import { MailServices } from "resource:///modules/MailServices.sys.mjs";
import { SmartMailboxUtils } from "resource:///modules/SmartMailboxUtils.sys.mjs";
import { VirtualFolderHelper } from "resource:///modules/VirtualFolderWrapper.sys.mjs";

var { ExtensionError } = ExtensionUtils;

/**
 * Return all mail accounts, which are supported by Thunderbird's WebExtension APIs.
 * This excludes chat accounts and the preliminary EWS accounts.
 *
 * @returns {nsIMsgAccount[]}
 */
export function getMailAccounts() {
  return MailServices.accounts.accounts.filter(
    account => !["im", "ews"].includes(account.incomingServer.type)
  );
}

export class AccountManager {
  constructor(extension) {
    this.extension = extension;
  }

  /**
   * Get the WebExtension server type for the given server.
   *
   * @param {nsIMsgIncomingServer} server - The server to retrieve the type for.
   * @returns {string}
   */
  getType(server) {
    // Skip the "smart" account, which holds the unified mailbox folders and the
    // virtual tag folders.
    if (server.hostName == "smart mailboxes") {
      return null;
    }

    const type = server.type;

    // Skip chat accounts which are currently not accessible through the accounts
    // API. Also skip the preliminary Exchange accounts.
    if (["im", "ews"].includes(type)) {
      return null;
    }

    if (type == "none") {
      return this.extension.manifestVersion < 3 ? "none" : "local";
    }

    if (["imap", "pop3", "nntp", "rss"].includes(type)) {
      return type;
    }

    // Experiment extensions may have registered custom types. Since there is no
    // officially way for extension to register their types, we return all unknown
    // types as extensions types.
    return `extension:${type}`;
  }

  /**
   * Converts an nsIMsgAccount to a simple object
   *
   * @param {nsIMsgAccount} account - The account to be converted.
   * @param {boolean} [includeFolders = true]
   */
  convert(account, includeFolders = true) {
    if (!account) {
      return null;
    }

    account = account.QueryInterface(Ci.nsIMsgAccount);

    const server = account.incomingServer;
    const type = this.getType(server);
    // If the type is not supported by the API (i.e. "im"), bail out.
    if (!type) {
      return null;
    }

    const rootFolder = server.rootFolder;
    const mailAccount = {
      id: account.key,
      name: server.prettyName,
      type,
      rootFolder: this.extension.folderManager.convert(rootFolder, account.key),
      identities: account.identities.map(identity =>
        convertMailIdentity(account, identity)
      ),
    };

    if (includeFolders) {
      const { subFolders } = this.extension.folderManager.traverseSubfolders(
        rootFolder,
        account.key
      );
      mailAccount.rootFolder.subFolders = subFolders;
    }

    if (this.extension.manifestVersion < 3) {
      mailAccount.folders = includeFolders
        ? mailAccount.rootFolder.subFolders
        : null;
    }

    return mailAccount;
  }
}

/**
 * Class to cache all relevant identity information needed for later calls to
 * convertMailIdentity().
 *
 * @implements {nsIMsgIdentity} (partially)
 */
export class CachedIdentity {
  /**
   * @param {nsIMsgIdentity} identity - The identity to be cached.
   */
  constructor(identity) {
    if (!identity) {
      throw new Error("CachedIdentity constructor: identity required");
    }

    this.key = identity.key;
    this.label = identity.label;
    this.name = identity.name;
    this.email = identity.email;
    this.replyTo = identity.replyTo;
    this.organization = identity.organization;
    this.composeHtml = identity.composeHtml;
    this.htmlSigText = identity.htmlSigText;
    this.htmlSigFormat = identity.htmlSigFormat;

    this.attributes = new Map();
    this.attributes.set(
      "openpgp_key_id",
      identity.getUnicharAttribute("openpgp_key_id")
    );
    this.attributes.set(
      "signing_cert_name",
      identity.getUnicharAttribute("signing_cert_name")
    );
    this.attributes.set(
      "encryption_cert_name",
      identity.getUnicharAttribute("encryption_cert_name")
    );
  }

  getUnicharAttribute(attribute) {
    return this.attributes.get(attribute);
  }

  QueryInterface() {
    return this;
  }
}

/**
 * Class to cache all relevant server information needed by the CachedAccount
 * class.
 *
 * Note: Since there is currently no need for cached (sub-)folder, the relevant
 *       methods have not been implemented.
 *
 * @implements {nsIMsgIncomingServer} (partially)
 */
export class CachedServer {
  /**
   * @param {nsIMsgIncomingServer} server - The server to be cached.
   */
  constructor(server) {
    if (!server) {
      throw new Error("CachedServer constructor: server required");
    }

    this.type = server.type;
    this.prettyName = server.prettyName;
    this.rootFolder = server.rootFolder;
  }

  QueryInterface() {
    return this;
  }
}

/**
 * Class to cache all relevant account information needed for later calls to
 * AccountManager.convert().
 *
 * @implements {nsIMsgAccount} (partially)
 */
export class CachedAccount {
  /**
   * @param {nsIMsgAccount} account - The account to be cached.
   */
  constructor(account) {
    if (!account) {
      throw new Error("CachedAccount constructor: account required");
    }

    account = account.QueryInterface(Ci.nsIMsgAccount);

    this.key = account.key;
    this.identities = account.identities.map(
      identity => new CachedIdentity(identity)
    );
    this.incomingServer = new CachedServer(account.incomingServer);
  }

  QueryInterface() {
    return this;
  }
}

/**
 * Converts an nsIMsgIdentity to a simple object for use in messages.
 *
 * @param {nsIMsgAccount} account
 * @param {nsIMsgIdentity} identity
 * @returns {object}
 */
export function convertMailIdentity(account, identity) {
  if (!account || !identity) {
    return null;
  }

  account = account.QueryInterface(Ci.nsIMsgAccount);
  identity = identity.QueryInterface(Ci.nsIMsgIdentity);

  return {
    accountId: account.key,
    id: identity.key,
    label: identity.label || "",
    name: identity.fullName || "",
    email: identity.email || "",
    replyTo: identity.replyTo || "",
    organization: identity.organization || "",
    composeHtml: identity.composeHtml,
    signature: identity.htmlSigText || "",
    signatureIsPlainText: !identity.htmlSigFormat,
    encryptionCapabilities: {
      OpenPGP: {
        canEncrypt: !!identity.getUnicharAttribute("openpgp_key_id"),
        canSign: !!identity.getUnicharAttribute("openpgp_key_id"),
      },
      "S/MIME": {
        canEncrypt: !!identity.getUnicharAttribute("encryption_cert_name"),
        canSign: !!identity.getUnicharAttribute("signing_cert_name"),
      },
    },
  };
}

/**
 * The following functions turn nsIMsgFolder references into more human-friendly forms.
 * A folder can be referenced with the account key, and the path to the folder in that account.
 */

/**
 * Convert a folder URI to a human-friendly path.
 *
 * @returns {string}
 */
export function folderURIToPath(accountId, uri) {
  const server = MailServices.accounts.getAccount(accountId).incomingServer;
  const rootURI = server.rootFolder.URI;
  if (rootURI == uri) {
    return "/";
  }
  // The .URI property of an IMAP folder doesn't have %-encoded characters, but
  // may include literal % chars. Services.io.newURI(uri) applies encodeURI to
  // the returned filePath, but will not encode any literal % chars, which will
  // cause decodeURIComponent to fail (bug 1707408).
  if (server.type == "imap") {
    return uri.substring(rootURI.length);
  }
  const path = Services.io.newURI(uri).filePath;
  return path.split("/").map(decodeURIComponent).join("/");
}

/**
 * Convert a human-friendly path to a folder URI. This function does not assume
 * that the folder referenced exists.
 *
 * @returns {string}
 */
export function folderPathToURI(accountId, path) {
  const account = MailServices.accounts.getAccount(accountId);
  if (!account) {
    return null;
  }
  const server = account.incomingServer;
  const rootURI = server.rootFolder.URI;
  if (path == "/") {
    return rootURI;
  }
  // The .URI property of an IMAP folder doesn't have %-encoded characters.
  // If encoded here, the folder lookup service won't find the folder.
  if (server.type == "imap") {
    return rootURI + path;
  }
  return (
    rootURI +
    path
      .split("/")
      .map(p =>
        encodeURIComponent(p)
          .replace(/[~!'()*]/g, c => "%" + c.charCodeAt(0).toString(16))
          // We do not encode "+" chars in folder URIs. Manually convert them
          // back to literal + chars, otherwise folder lookup will fail.
          .replaceAll("%2B", "+")
      )
      .join("/")
  );
}

export const specialUseMap = new Map([
  [Ci.nsMsgFolderFlags.Inbox, "inbox"],
  [Ci.nsMsgFolderFlags.Drafts, "drafts"],
  [Ci.nsMsgFolderFlags.SentMail, "sent"],
  [Ci.nsMsgFolderFlags.Trash, "trash"],
  [Ci.nsMsgFolderFlags.Templates, "templates"],
  [Ci.nsMsgFolderFlags.Archive, "archives"],
  [Ci.nsMsgFolderFlags.Junk, "junk"],
  [Ci.nsMsgFolderFlags.Queue, "outbox"],
]);

/**
 * Returns an array of human readable names of the enabled nsMsgFolderFlags in
 * the provided flags value.
 *
 * @param {integer} flags
 * @returns {string[]}
 */
export function getSpecialUse(flags) {
  const specialUse = [];
  for (const [flag, specialUseName] of specialUseMap.entries()) {
    if (flags & flag) {
      specialUse.push(specialUseName);
    }
  }
  return specialUse;
}

/**
 * Returns whether the provided folder is a unified mailbox folder.
 *
 * @param {nsIMsgFolder} folder
 * @returns {boolean}
 */
function isUnifiedMailboxFolder(folder) {
  return (
    folder &&
    folder.server.hostName == "smart mailboxes" &&
    folder.parent?.isServer &&
    SmartMailboxUtils.getFolderTypes().some(({ flag }) => flag & folder.flags)
  );
}

/**
 * Returns whether the provided folder is a virtual tag folder.
 *
 * @param {nsIMsgFolder} folder
 * @returns {boolean}
 */
function isVirtualTagFolder(folder) {
  return (
    folder &&
    folder.server.hostName == "smart mailboxes" &&
    folder.parent?.name == "tags" &&
    !!(folder.flags & Ci.nsMsgFolderFlags.Virtual)
  );
}

/**
 * Some virtual folders do not search explicitly specified folders, but all
 * folders (except Trash, Junk, Outbox and other virtual folders). This function
 * returns an array with all these folders.
 *
 * @param {VirtualFolderWrapper} wrappedVirtualFolder
 * @returns {nsIMsgFolder[]}
 */
export function getWildcardVirtualFolders(wrappedVirtualFolder) {
  if (wrappedVirtualFolder.searchFolderURIs != "*") {
    return [];
  }
  // This is a special virtual folder that searches all folders in all
  // accounts (except the unwanted types listed). Get those folders now.
  const folders = [];
  const unwantedFlags =
    Ci.nsMsgFolderFlags.Trash |
    Ci.nsMsgFolderFlags.Junk |
    Ci.nsMsgFolderFlags.Queue |
    Ci.nsMsgFolderFlags.Virtual;
  for (const server of MailServices.accounts.allServers) {
    folders.push(
      ...server.rootFolder.descendants.filter(
        f => !f.isSpecialFolder(unwantedFlags, true)
      )
    );
  }
  return folders;
}

export class FolderManager {
  constructor(extension) {
    this.extension = extension;
  }

  /**
   * Supress folder.deleteable of smart folders for the WebExtension APIs.
   *
   * @param {nsIMsgFolder} folder
   * @returns {boolean}
   */
  static canBeDeleted(folder) {
    return folder.deletable && folder.server.hostName != "smart mailboxes";
  }

  /**
   * Supress folder.canRename of smart folders for the WebExtension APIs.
   *
   * @param {nsIMsgFolder} folder
   * @returns {boolean}
   */
  static canBeRenamed(folder) {
    return folder.canRename && folder.server.hostName != "smart mailboxes";
  }

  /**
   * Converts an nsIMsgFolder to a simple object for use in API messages.
   *
   * @param {nsIMsgFolder} folder - The folder to convert.
   * @param {string} [accountId] - An optimization to avoid looking up the
   *     account. The value from nsIMsgDBHdr.accountKey must not be used here.
   * @returns {MailFolder}
   * @see mail/components/extensions/schemas/folders.json
   */
  convert(folder, accountId) {
    if (!folder) {
      return null;
    }
    const server = folder.server;

    if (!accountId) {
      const account = MailServices.accounts.findAccountForServer(server);
      accountId = account.key;
    }

    const isRoot = folder.isServer;
    const isUnified = isUnifiedMailboxFolder(folder);
    const isTag = isVirtualTagFolder(folder);

    const nativePath = folderURIToPath(accountId, folder.URI);
    let id = `${accountId}:/${nativePath}`;
    let path = nativePath;
    if (isUnified || isTag) {
      // Map unified mailbox folders to /unified/*, virtual tag folders to /tag/*
      id = isUnified ? `unified:/${nativePath}` : `tag:/${path.substring(5)}`;
      path = isUnified ? `/unified${nativePath}` : `/tag${path.substring(5)}`;
    }

    const folderObject = {
      id,
      name: isRoot ? "Root" : folder.prettyName,
      path,
      specialUse: getSpecialUse(folder.flags),
      isFavorite: folder.getFlag(Ci.nsMsgFolderFlags.Favorite),
      isRoot,
      isTag,
      isUnified,
      isVirtual: folder.getFlag(Ci.nsMsgFolderFlags.Virtual),
    };

    if (isUnified || isTag) {
      // MV2 introduced the accountId as a required string property, so we have
      // to keep returning one.
      if (this.extension.manifestVersion < 3) {
        folderObject.accountId = "";
      }
    } else {
      folderObject.accountId = accountId;
    }

    // In MV2 only the first special use was returned as type, assuming a folder
    // can only be of one type. Since that turned out to be wrong, the type
    // property is now deprecated (removed in MV3) and an additional specialUse
    // property is returned.
    if (
      this.extension.manifestVersion < 3 &&
      folderObject.specialUse.length > 0
    ) {
      folderObject.type = folderObject.specialUse[0];
    }

    return folderObject;
  }

  /**
   * Returns the direct subfolders of the specifed nsIMsgFolder. Individual search
   * folders of virtual folders are usually not returned as subfolders, except for
   * unified folders.
   *
   * @param {nsIMsgFolder} folder - The folder to get the direct subfolders for.
   * @param {boolean} isUnified - Whether the folder is a unified folder.
   *
   * @returns {nsIMsgFolder[]}
   */
  getDirectSubfolders(folder, isUnified) {
    if (folder.hasSubFolders) {
      // Use the same order as used by Thunderbird.
      return folder.subFolders.sort((a, b) =>
        a.sortOrder == b.sortOrder
          ? a.name.localeCompare(b.name)
          : a.sortOrder - b.sortOrder
      );
    }
    if (isUnified) {
      const wrappedFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
      // wrappedFolder.searchFolders returns all nested folders, not just the
      // direct children. Filter out nested folders based on their URI starting
      // with a value which is already known.
      const subFolders = [];
      for (const folder of wrappedFolder.searchFolders) {
        const URI = folder.URI;
        if (subFolders.find(f => URI.startsWith(f.URI))) {
          continue;
        }
        subFolders.push(folder);
      }
      return subFolders.sort((a, b) =>
        a.sortOrder == b.sortOrder
          ? a.name.localeCompare(b.name)
          : a.sortOrder - b.sortOrder
      );
    }
    return [];
  }

  /**
   * Converts an nsIMsgFolder and all its subfolders to a simple object for use in
   * API messages.
   *
   * @param {nsIMsgFolder} folder - The folder to convert.
   * @param {string} [accountId] - An optimization to avoid looking up the
   *     account. The value from nsIMsgDBHdr.accountKey must not be used here.
   * @returns {MailFolder}
   * @see mail/components/extensions/schemas/folders.json
   */
  traverseSubfolders(folder, accountId) {
    const convertedFolder = this.convert(folder, accountId);
    const subFolders = this.getDirectSubfolders(
      folder,
      convertedFolder.isUnified
    );

    // If accountId was not specified, convert() made a lookup and retrieved the
    // actual accountId. Always use that, except if this folder is a virtual
    // folder (its subfolders could belong to a different account).
    accountId = convertedFolder.isVirtual ? null : convertedFolder.accountId;

    convertedFolder.subFolders = [];
    for (const subFolder of subFolders) {
      convertedFolder.subFolders.push(
        this.traverseSubfolders(subFolder, accountId)
      );
    }
    return convertedFolder;
  }

  get(accountId, path) {
    const { folder } = getFolder({ accountId, path });
    return folder;
  }
}

/**
 * Class to cache all relevant folder information needed for later calls to
 * FolderManager.convert()
 *
 * Note: Since there is currently no need for cached (sub-)folder, the relevant
 *       methods have not been implemented.
 *
 * @implements {nsIMsgFolder} (partially)
 */
export class CachedFolder {
  /**
   * @param {nsIMsgFolder} folder - The folder to be cached.
   */
  constructor(folder) {
    if (!folder) {
      throw new Error("CachedFolder constructor: folder required");
    }

    this.server = folder.server;
    this.prettyName = folder.prettyName;
    this.URI = folder.URI;
    this.flags = folder.flags;
    this.isServer = folder.isServer;
  }

  get hasSubFolders() {
    throw new Error("CachedFolder.hasSubFolders: Not Implemented");
  }

  get subFolder() {
    throw new Error("CachedFolder.subFolders: Not Implemented");
  }

  getFlag(flag) {
    return !!(this.flags & flag);
  }

  QueryInterface() {
    return this;
  }
}

/**
 * @typedef {object} FolderDetails
 *
 * @property {nsIMsgFolder} folder
 * @property {string} accountKey - key property of the folder's account
 * @property {boolean} isTag - MailFolder.isTag
 * @property {boolean} isUnified - MailFolder.isUnified
 * @property {string} path - MailFolder.path
 */

/**
 * Retrieves the actual folder and additional details for the specified folder
 * identifier. Throws if the folder cannot be found.
 *
 * @param {object} identifier
 * @param {?string} identifier.accountId - MailFolder.accountId
 * @param {?string} identifier.folderId - MailFolder.id
 * @param {?string} identifier.path - MailFolder.path
 *
 * @returns {FolderDetails} info - Details about the specified folder.
 */
function getFolderDetails({ accountId, folderId, path }) {
  const checkDetails = ({
    accountKey,
    folderId,
    isTag,
    isUnified,
    path,
    uri,
  }) => {
    if (!uri) {
      throw new ExtensionError(`Folder not found: ${folderId}`);
    }
    const folder = MailServices.folderLookup.getFolderForURL(uri);
    if (
      !folder ||
      (isUnified && !isUnifiedMailboxFolder(folder)) ||
      (isTag && !isVirtualTagFolder(folder))
    ) {
      throw new ExtensionError(`Folder not found: ${folderId}`);
    }
    return { accountKey, folder, isTag, isUnified, path };
  };

  // Handle unified mailbox folders, they can only be specified via folderId.
  if (folderId?.startsWith("unified://")) {
    const smartMailbox = SmartMailboxUtils.getSmartMailbox();
    if (!smartMailbox.account) {
      throw new ExtensionError(`Folder not found: ${folderId}`);
    }
    const accountKey = smartMailbox.account.key;
    const nativePath = folderId.substring(9);
    const webExtPath = `/unified/${folderId.substring(10)}`;
    const uri = folderPathToURI(accountKey, nativePath);
    return checkDetails({
      accountKey,
      folderId,
      isTag: false,
      isUnified: true,
      path: webExtPath,
      uri,
    });
  }

  // Handle virtual tag folders, they can only be specified via folderId.
  if (folderId?.startsWith("tag://")) {
    const smartMailbox = SmartMailboxUtils.getSmartMailbox();
    if (!smartMailbox.account) {
      throw new ExtensionError(`Folder not found: ${folderId}`);
    }
    const accountKey = smartMailbox.account.key;
    const nativePath = `/tags/${folderId.substring(6)}`;
    const webExtPath = `/tag/${folderId.substring(6)}`;
    const uri = folderPathToURI(accountKey, nativePath);
    return checkDetails({
      accountKey,
      folderId,
      isTag: true,
      isUnified: false,
      path: webExtPath,
      uri,
    });
  }

  if (folderId) {
    const parts = folderId.split(":/");
    accountId = parts.shift();
    // The path may contain ":/" itself, so stitch it all back together.
    path = parts.join(":/");
  } else {
    folderId = `${accountId}:/${path}`;
  }

  const uri = folderPathToURI(accountId, path);
  return checkDetails({
    accountKey: accountId,
    folderId,
    isUnified: false,
    isTag: false,
    path,
    uri,
  });
}

/**
 * Retrieves the actual folder and additional details for the specified folder
 * identifier, which may be a WebExtension MailFolder, a WebExtension MailAccount
 * or a MailFolder.id. Throws if the folder cannot be found.
 *
 * @param {MailAccount|MailFolder|string} identifier
 * @returns {FolderDetails} info - Details about the specified folder.
 */
export function getFolder(identifier) {
  if (typeof identifier === "object") {
    // A MailFolder (with path and with accountId).
    if (identifier.path && identifier.accountId) {
      return getFolderDetails({
        accountId: identifier.accountId,
        path: identifier.path,
      });
    }
    // A virtual tag folder (with path /tag/<key> and without accountId).
    if (identifier.path && identifier.path.startsWith("/tag/")) {
      return getFolderDetails({
        folderId: `tag://${identifier.path.substring(5)}`,
      });
    }
    // A unified mailbox folder (with path /unified/<type> and without accountId).
    if (identifier.path && identifier.path.startsWith("/unified/")) {
      return getFolderDetails({
        folderId: `unified://${identifier.path.substring(9)}`,
      });
    }
    // A MailAccount (without path and with id). Return the accounts root folder.
    if (identifier.id) {
      return getFolderDetails({ accountId: identifier.id, path: "/" });
    }

    throw new ExtensionError(`Folder not found: ${JSON.stringify(identifier)}`);
  }
  // A MailFolder.id.
  return getFolderDetails({ folderId: identifier });
}
