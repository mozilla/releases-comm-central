/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { ExtensionUtils } from "resource://gre/modules/ExtensionUtils.sys.mjs";

var { ExtensionError } = ExtensionUtils;
var { MailServices } = ChromeUtils.import(
  "resource:///modules/MailServices.jsm"
);

export class AccountManager {
  constructor(extension) {
    this.extension = extension;
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
    if (server.type == "im") {
      return null;
    }

    let folders = null;
    if (includeFolders) {
      folders = this.extension.folderManager.traverseSubfolders(
        server.rootFolder,
        account.key
      ).subFolders;
    }

    return {
      id: account.key,
      name: server.prettyName,
      type: server.type,
      folders,
      identities: account.identities.map(identity =>
        convertMailIdentity(account, identity)
      ),
    };
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
  }

  get rootFolder() {
    throw new Error("CachedServer.rootFolder: Not implemented");
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
  const server = MailServices.accounts.getAccount(accountId).incomingServer;
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
          .replace(/[!'()*]/g, c => "%" + c.charCodeAt(0).toString(16))
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

export function getSpecialUse(flags) {
  const specialUse = [];
  for (const [flag, specialUseName] of specialUseMap.entries()) {
    if (flags & flag) {
      specialUse.push(specialUseName);
    }
  }
  return specialUse;
}

export class FolderManager {
  constructor(extension) {
    this.extension = extension;
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
    if (!accountId) {
      const server = folder.server;
      const account = MailServices.accounts.FindAccountForServer(server);
      accountId = account.key;
    }

    const path = folderURIToPath(accountId, folder.URI);
    const folderObject = {
      id: `${accountId}:/${path}`,
      accountId,
      name: folder.prettyName,
      path,
      specialUse: getSpecialUse(folder.flags),
      favorite: folder.getFlag(Ci.nsMsgFolderFlags.Favorite),
    };

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
    const f = this.convert(folder, accountId);
    f.subFolders = [];
    if (folder.hasSubFolders) {
      // Use the same order as used by Thunderbird.
      const subFolders = [...folder.subFolders].sort((a, b) =>
        a.sortOrder == b.sortOrder
          ? a.name.localeCompare(b.name)
          : a.sortOrder - b.sortOrder
      );
      for (const subFolder of subFolders) {
        f.subFolders.push(
          this.traverseSubfolders(subFolder, accountId || f.accountId)
        );
      }
    }
    return f;
  }

  get(accountId, path) {
    return MailServices.folderLookup.getFolderForURL(
      folderPathToURI(accountId, path)
    );
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
 * Accepts a MailFolder, a MailAccount or a folderId. Returns the actual folder,
 * its accountId and its path. Throws if the requested folder does not exist.
 */
export function getFolder(target) {
  let accountId, path;
  if (typeof target === "object") {
    // MailFolders have a mandatory accountId member, which can be used to
    // differentiate between MailAccounts and MailFolders.
    if (target.id && !target.accountId) {
      // The target is a MailAccount, use its id.
      accountId = target.id;
      path = "/";
    } else {
      // The target is a MailFolder.
      accountId = target.accountId;
      path = target.path;
    }
  } else {
    // The target is a folderId.
    const parts = target.split(":/");
    accountId = parts.shift();
    // The path may contain ":/" itself, so stich it all back together.
    path = parts.join(":/");
  }

  if (!accountId) {
    throw new ExtensionError(`Folder not found: ${JSON.stringify(target)}`);
  }

  const uri = folderPathToURI(accountId, path);
  const folder = MailServices.folderLookup.getFolderForURL(uri);
  if (!folder) {
    throw new ExtensionError(`Folder not found: ${path}`);
  }
  return { folder, accountId, path };
}
