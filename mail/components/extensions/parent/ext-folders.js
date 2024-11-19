/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

ChromeUtils.defineESModuleGetters(this, {
  DeferredTask: "resource://gre/modules/DeferredTask.sys.mjs",
  FolderUtils: "resource:///modules/FolderUtils.sys.mjs",
  SmartMailboxUtils: "resource:///modules/SmartMailboxUtils.sys.mjs",
  VirtualFolderHelper: "resource:///modules/VirtualFolderWrapper.sys.mjs",
});
var {
  CachedFolder,
  folderURIToPath,
  getFolder,
  getMailAccounts,
  getWildcardVirtualFolders,
  specialUseMap,
} = ChromeUtils.importESModule("resource:///modules/ExtensionAccounts.sys.mjs");

/**
 * Tracks folder events.
 *
 * @implements {nsIMsgFolderListener}
 */
var folderTracker = new (class extends EventEmitter {
  constructor() {
    super();
    this.listenerCount = 0;
    this.pendingInfoNotifications = new ExtensionUtils.DefaultMap(
      () => new Map()
    );
    this.deferredInfoNotifications = new ExtensionUtils.DefaultMap(
      folder =>
        new DeferredTask(
          () => this.emitPendingInfoNotification(folder),
          NOTIFICATION_COLLAPSE_TIME
        )
    );
  }

  on(...args) {
    super.on(...args);
    this.incrementListeners();
  }

  off(...args) {
    super.off(...args);
    this.decrementListeners();
  }

  incrementListeners() {
    this.listenerCount++;
    if (this.listenerCount == 1) {
      // nsIMsgFolderListener
      const flags =
        MailServices.mfn.folderAdded |
        MailServices.mfn.folderDeleted |
        MailServices.mfn.folderMoveCopyCompleted |
        MailServices.mfn.folderRenamed;
      MailServices.mfn.addListener(this, flags);
      // nsIFolderListener
      MailServices.mailSession.AddFolderListener(
        this,
        Ci.nsIFolderListener.intPropertyChanged |
          Ci.nsIFolderListener.boolPropertyChanged |
          Ci.nsIFolderListener.event
      );
    }
  }
  decrementListeners() {
    this.listenerCount--;
    if (this.listenerCount == 0) {
      MailServices.mfn.removeListener(this);
      MailServices.mailSession.RemoveFolderListener(this);
    }
  }

  // nsIFolderListener

  onFolderIntPropertyChanged(item, property, oldValue, newValue) {
    if (!(item instanceof Ci.nsIMsgFolder)) {
      return;
    }

    switch (property) {
      case "FolderFlag":
        {
          let modified = false;

          if (
            (oldValue & Ci.nsMsgFolderFlags.Favorite) !=
            (newValue & Ci.nsMsgFolderFlags.Favorite)
          ) {
            modified = true;

            // Deprecated in MV3, will be suppressed before sending it to the
            // WebExtension.
            this.addPendingInfoNotification(
              item,
              "favorite",
              !!(newValue & Ci.nsMsgFolderFlags.Favorite)
            );
          }

          const specialUseFlags = [...specialUseMap.keys()].reduce(
            (rv, f) => rv | f
          );
          if ((oldValue & specialUseFlags) != (newValue & specialUseFlags)) {
            modified = true;
          }

          if (modified) {
            const updatedFolder = new CachedFolder(item);
            const originalFolder = new CachedFolder(item);
            originalFolder.flags = oldValue;
            this.emit("folder-updated", originalFolder, updatedFolder);
          }
        }
        break;
      case "TotalMessages":
        this.addPendingInfoNotification(item, "totalMessageCount", newValue);
        break;
      case "TotalUnreadMessages":
        this.addPendingInfoNotification(item, "unreadMessageCount", newValue);
        break;
    }
  }

  onFolderBoolPropertyChanged(folder, property) {
    if (!(folder instanceof Ci.nsIMsgFolder)) {
      return;
    }

    switch (property) {
      case "NewMessages":
        this.addPendingInfoNotification(
          folder,
          "newMessageCount",
          folder.msgDatabase.getNewList().length
        );
        break;
    }
  }

  onFolderEvent(folder, event) {
    if (!(folder instanceof Ci.nsIMsgFolder)) {
      return;
    }

    switch (event) {
      case "MRUTimeChanged":
        try {
          const time = Number(folder.getStringProperty("MRUTime")) * 1000;
          if (time) {
            this.addPendingInfoNotification(folder, "lastUsed", new Date(time));
          }
        } catch (e) {}
        break;
    }
  }

  addPendingInfoNotification(folder, key, value) {
    // If there is already a notification entry, decide if it must be emitted,
    // or if it can be collapsed: Message count changes can be collapsed.
    // This also collapses multiple different notifications types into a
    // single event.
    if (
      ["favorite"].includes(key) &&
      this.deferredInfoNotifications.has(folder) &&
      this.pendingInfoNotifications.get(folder).has(key)
    ) {
      this.deferredInfoNotifications.get(folder).disarm();
      this.emitPendingInfoNotification(folder);
    }

    this.pendingInfoNotifications.get(folder).set(key, value);
    this.deferredInfoNotifications.get(folder).disarm();
    this.deferredInfoNotifications.get(folder).arm();
  }

  emitPendingInfoNotification(folder) {
    const folderInfo = this.pendingInfoNotifications.get(folder);
    if (folderInfo.size > 0) {
      this.emit(
        "folder-info-changed",
        new CachedFolder(folder),
        Object.fromEntries(folderInfo)
      );
      this.pendingInfoNotifications.delete(folder);
    }
  }

  // nsIMsgFolderListener

  folderAdded(childFolder) {
    this.emit("folder-created", new CachedFolder(childFolder));
  }
  folderDeleted(oldFolder) {
    // Deleting an account, will trigger delete notifications for its folders,
    // but the account lookup fails, so skip them.
    const server = oldFolder.server;
    const account = MailServices.accounts.findAccountForServer(server);
    if (account) {
      this.emit("folder-deleted", new CachedFolder(oldFolder), account.key);
    }
  }
  folderMoveCopyCompleted(move, srcFolder, targetFolder) {
    // targetFolder is not the copied/moved folder, but its parent. Find the
    // actual folder by its name (which is unique).
    let dstFolder = null;
    if (targetFolder && targetFolder.hasSubFolders) {
      dstFolder = targetFolder.subFolders.find(
        f => f.prettyName == srcFolder.prettyName
      );
    }

    if (move) {
      this.emit(
        "folder-moved",
        new CachedFolder(srcFolder),
        new CachedFolder(dstFolder)
      );
    } else {
      this.emit(
        "folder-copied",
        new CachedFolder(srcFolder),
        new CachedFolder(dstFolder)
      );
    }
  }
  folderRenamed(oldFolder, newFolder) {
    this.emit(
      "folder-renamed",
      new CachedFolder(oldFolder),
      new CachedFolder(newFolder)
    );
  }
})();

/**
 * Copy or Move a folder.
 */
async function doMoveCopyOperation(source, destination, extension, isMove) {
  const functionName = isMove ? "folders.move()" : "folders.copy()";

  // The schema file allows destination to be either a MailFolder or a
  // MailAccount.
  const { folder: srcFolder } = getFolder(source);
  const {
    folder: dstFolder,
    path: dstFolderPath,
    accountKey: dstFolderAccountKey,
  } = getFolder(destination);

  if (!dstFolder.canCreateSubfolders) {
    throw new ExtensionError(
      `${functionName} failed, cannot create subfolders in ${dstFolder.prettyName}`
    );
  }

  if (isMove && !FolderManager.canBeDeleted(srcFolder)) {
    throw new ExtensionError(
      `${functionName} failed, cannot delete source folder ${srcFolder.prettyName}`
    );
  }

  if (dstFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
    throw new ExtensionError(
      `The destination used in ${functionName} cannot be a virtual search folder`
    );
  }

  if (
    dstFolder.hasSubFolders &&
    dstFolder.subFolders.find(f => f.prettyName == srcFolder.prettyName)
  ) {
    throw new ExtensionError(
      `${functionName} failed, because ${srcFolder.prettyName} already exists in ${dstFolderPath}`
    );
  }

  const rv = await new Promise(resolve => {
    let _destination = null;
    const listener = {
      folderMoveCopyCompleted(_isMove, _srcFolder, _dstFolder) {
        if (
          _destination != null ||
          _isMove != isMove ||
          _srcFolder.URI != srcFolder.URI ||
          _dstFolder.URI != dstFolder.URI
        ) {
          return;
        }

        // The targetFolder is not the copied/moved folder, but its parent.
        // Find the actual folder by its name (which is unique).
        if (_dstFolder && _dstFolder.hasSubFolders) {
          _destination = _dstFolder.subFolders.find(
            f => f.prettyName == _srcFolder.prettyName
          );
        }
      },
    };
    MailServices.mfn.addListener(
      listener,
      MailServices.mfn.folderMoveCopyCompleted
    );
    MailServices.copy.copyFolder(
      srcFolder,
      dstFolder,
      isMove,
      /** @implements {nsIMsgCopyServiceListener} */
      {
        onStartCopy() {},
        onProgress() {},
        setMessageKey() {},
        getMessageId() {
          return null;
        },
        onStopCopy(status) {
          MailServices.mfn.removeListener(listener);
          resolve({
            status,
            folder: _destination,
          });
        },
      },
      null
    );
  });

  if (!Components.isSuccessCode(rv.status)) {
    throw new ExtensionError(`${functionName} failed for unknown reasons`);
  }

  return extension.folderManager.convert(rv.folder, dstFolderAccountKey);
}

/**
 * Wait for a folder operation.
 */
function waitForOperation(flags, uri) {
  return new Promise(resolve => {
    MailServices.mfn.addListener(
      {
        folderAdded(childFolder) {
          if (childFolder.parent.URI != uri) {
            return;
          }

          MailServices.mfn.removeListener(this);
          resolve(childFolder);
        },
        folderDeleted(oldFolder) {
          if (oldFolder.URI != uri) {
            return;
          }

          MailServices.mfn.removeListener(this);
          resolve();
        },
        folderMoveCopyCompleted(move, srcFolder, destFolder) {
          if (srcFolder.URI != uri) {
            return;
          }

          MailServices.mfn.removeListener(this);
          resolve(destFolder);
        },
        folderRenamed(oldFolder, newFolder) {
          if (oldFolder.URI != uri) {
            return;
          }

          MailServices.mfn.removeListener(this);
          resolve(newFolder);
        },
      },
      flags
    );
  });
}

this.folders = class extends ExtensionAPIPersistent {
  PERSISTENT_EVENTS = {
    // For primed persistent events (deactivated background), the context is only
    // available after fire.wakeup() has fulfilled (ensuring the convert() function
    // has been called).

    onCreated({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, createdFolder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(folderManager.convert(createdFolder));
      }
      folderTracker.on("folder-created", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-created", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onRenamed({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, originalFolder, renamedFolder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          folderManager.convert(originalFolder),
          folderManager.convert(renamedFolder)
        );
      }
      folderTracker.on("folder-renamed", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-renamed", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onMoved({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, srcFolder, dstFolder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          folderManager.convert(srcFolder),
          folderManager.convert(dstFolder)
        );
      }
      folderTracker.on("folder-moved", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-moved", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onCopied({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, srcFolder, dstFolder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          folderManager.convert(srcFolder),
          folderManager.convert(dstFolder)
        );
      }
      folderTracker.on("folder-copied", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-copied", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onDeleted({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, deletedFolder, accountKey) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(folderManager.convert(deletedFolder, accountKey));
      }
      folderTracker.on("folder-deleted", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-deleted", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onFolderInfoChanged({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, changedFolder, mailFolderInfo) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        if (extension.manifestVersion > 2) {
          delete mailFolderInfo.favorite;
        }
        if (Object.keys(mailFolderInfo).length > 0) {
          fire.async(folderManager.convert(changedFolder), mailFolderInfo);
        }
      }
      folderTracker.on("folder-info-changed", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-info-changed", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
    onUpdated({ fire }) {
      const { extension } = this;
      const { folderManager } = extension;

      async function listener(event, originalFolder, updatedFolder) {
        if (fire.wakeup) {
          await fire.wakeup();
        }
        fire.async(
          folderManager.convert(originalFolder),
          folderManager.convert(updatedFolder)
        );
      }
      folderTracker.on("folder-updated", listener);
      return {
        unregister: () => {
          folderTracker.off("folder-updated", listener);
        },
        convert(newFire) {
          fire = newFire;
        },
      };
    },
  };

  getAPI(context) {
    const manifestVersion = context.extension.manifestVersion;

    return {
      folders: {
        onCreated: new EventManager({
          context,
          module: "folders",
          event: "onCreated",
          extensionApi: this,
        }).api(),
        onRenamed: new EventManager({
          context,
          module: "folders",
          event: "onRenamed",
          extensionApi: this,
        }).api(),
        onMoved: new EventManager({
          context,
          module: "folders",
          event: "onMoved",
          extensionApi: this,
        }).api(),
        onCopied: new EventManager({
          context,
          module: "folders",
          event: "onCopied",
          extensionApi: this,
        }).api(),
        onDeleted: new EventManager({
          context,
          module: "folders",
          event: "onDeleted",
          extensionApi: this,
        }).api(),
        onFolderInfoChanged: new EventManager({
          context,
          module: "folders",
          event: "onFolderInfoChanged",
          extensionApi: this,
        }).api(),
        onUpdated: new EventManager({
          context,
          module: "folders",
          event: "onUpdated",
          extensionApi: this,
        }).api(),
        async query(queryInfo) {
          const monthOld = Math.floor(
            (Date.now() - FolderUtils.ONE_MONTH_IN_MILLISECONDS) / 1000
          );

          // Generator function to flatten the folder structure.
          function* getFlatFolderStructure(folder) {
            yield folder;
            if (folder.hasSubFolders) {
              for (const subFolder of folder.subFolders) {
                yield* getFlatFolderStructure(subFolder);
              }
            }
          }

          // Evaluate query properties which can be specified as boolean
          // (none/some) or integer (min/max).
          function matchBooleanOrQueryRange(query, valueCallback) {
            if (query == null) {
              return true;
            }
            const value = valueCallback();

            if (typeof query == "boolean") {
              return query == (value != 0);
            }
            // If not a boolean, it is an object with min and max members.
            if (query.min != null && value < query.min) {
              return false;
            }
            if (query.max != null && value > query.max) {
              return false;
            }
            return true;
          }

          function isRecent(folder) {
            try {
              const time = Number(folder.getStringProperty("MRUTime")) || 0;
              return !(time < monthOld);
            } catch (e) {
              return false;
            }
          }

          // Prepare folders, which are to be searched.
          const parentFolders = [];
          if (queryInfo.folderId) {
            const { folder, accountKey } = getFolder(queryInfo.folderId);
            if (!queryInfo.accountId || queryInfo.accountId == accountKey) {
              parentFolders.push({
                rootFolder: folder,
                accountId: accountKey,
              });
            }
          } else if (queryInfo.isUnified || queryInfo.isTag) {
            const smartMailbox = SmartMailboxUtils.getSmartMailbox();
            // Unified mailbox folders are disjunct to virtual tag folders.
            // Manually suppress the case both are specified.
            if (
              smartMailbox.account &&
              queryInfo.isUnified &&
              !queryInfo.isTag
            ) {
              const allowedFolderFlags =
                SmartMailboxUtils.getFolderTypes().reduce(
                  (acc, { flag }) => acc | flag,
                  0
                );
              for (const folder of smartMailbox.rootFolder.subFolders) {
                // Require unified folders to have an allowed folder type.
                if (allowedFolderFlags & folder.flags) {
                  parentFolders.push({
                    rootFolder: folder,
                    accountId: smartMailbox.account.key,
                  });
                }
              }
            }
            if (
              smartMailbox.account &&
              !queryInfo.isUnified &&
              queryInfo.isTag
            ) {
              const tags = MailServices.tags.getAllTags();
              for (const tag of tags) {
                const folder = smartMailbox.getTagFolder(tag);
                parentFolders.push({
                  rootFolder: folder,
                  accountId: smartMailbox.account.key,
                });
              }
            }
          } else {
            for (const account of getMailAccounts()) {
              const accountId = account.key;
              if (!queryInfo.accountId || queryInfo.accountId == accountId) {
                parentFolders.push({
                  rootFolder: account.incomingServer.rootFolder,
                  accountId,
                });
              }
            }
          }

          // Prepare usage flags.
          const specialUse =
            !queryInfo.specialUse && queryInfo.type && manifestVersion < 3
              ? [queryInfo.type]
              : queryInfo.specialUse;
          const specialUseFlags =
            specialUse && Array.isArray(specialUse) && specialUse.length > 0
              ? [...specialUseMap.entries()]
                  .filter(([, specialUseName]) =>
                    specialUse.includes(specialUseName)
                  )
                  .map(([flag]) => flag)
                  .reduce((rv, f) => rv | f)
              : null;

          // Prepare regular expression for the name.
          let nameRegExp;
          if (queryInfo.name != null && queryInfo.name.regexp) {
            try {
              nameRegExp = new RegExp(
                queryInfo.name.regexp,
                queryInfo.name.flags || undefined
              );
            } catch (ex) {
              throw new ExtensionError(
                `Invalid Regular Expression: ${JSON.stringify(queryInfo.name)}`
              );
            }
          }

          // Prepare regular expression for the path.
          let pathRegExp;
          if (queryInfo.path != null && queryInfo.path.regexp) {
            try {
              pathRegExp = new RegExp(
                queryInfo.path.regexp,
                queryInfo.path.flags || undefined
              );
            } catch (ex) {
              throw new ExtensionError(
                `Invalid Regular Expression: ${JSON.stringify(queryInfo.path)}`
              );
            }
          }

          let foundFolders = [];
          for (const parentFolder of parentFolders) {
            const { accountId, rootFolder } = parentFolder;
            for (const folder of getFlatFolderStructure(rootFolder)) {
              // Apply search criteria.
              if (
                queryInfo.recent !== null &&
                queryInfo.recent != isRecent(folder)
              ) {
                return false;
              }

              if (
                queryInfo.isFavorite != null &&
                queryInfo.isFavorite !=
                  !!folder.getFlag(Ci.nsMsgFolderFlags.Favorite)
              ) {
                continue;
              }

              const isServer = folder.isServer;
              if (queryInfo.isRoot != null && queryInfo.isRoot != isServer) {
                continue;
              }

              if (
                queryInfo.isUnified != null &&
                queryInfo.isUnified !=
                  (folder.server.hostName == "smart mailboxes")
              ) {
                continue;
              }

              if (
                queryInfo.isVirtual != null &&
                queryInfo.isVirtual !=
                  folder.getFlag(Ci.nsMsgFolderFlags.Virtual)
              ) {
                continue;
              }

              if (specialUseFlags && ~folder.flags & specialUseFlags) {
                continue;
              }

              if (
                !matchBooleanOrQueryRange(queryInfo.hasMessages, () =>
                  isServer ? 0 : folder.getTotalMessages(false)
                )
              ) {
                continue;
              }

              if (
                !matchBooleanOrQueryRange(queryInfo.hasNewMessages, () =>
                  isServer ? 0 : folder.msgDatabase.getNewList().length
                )
              ) {
                continue;
              }

              if (
                !matchBooleanOrQueryRange(queryInfo.hasUnreadMessages, () =>
                  isServer ? 0 : folder.getNumUnread(false)
                )
              ) {
                continue;
              }

              if (
                !matchBooleanOrQueryRange(
                  queryInfo.hasSubFolders,
                  () => folder.subFolders?.length || 0
                )
              ) {
                continue;
              }

              if (
                queryInfo.canAddMessages != null &&
                queryInfo.canAddMessages != folder.canFileMessages
              ) {
                continue;
              }

              if (
                queryInfo.canAddSubfolders != null &&
                queryInfo.canAddSubfolders != folder.canCreateSubfolders
              ) {
                continue;
              }

              if (
                queryInfo.canBeDeleted != null &&
                queryInfo.canBeDeleted != FolderManager.canBeDeleted(folder)
              ) {
                continue;
              }

              if (
                queryInfo.canBeRenamed != null &&
                queryInfo.canBeRenamed != FolderManager.canBeRenamed(folder)
              ) {
                continue;
              }

              if (
                queryInfo.canDeleteMessages != null &&
                queryInfo.canDeleteMessages != folder.canDeleteMessages
              ) {
                continue;
              }

              if (queryInfo.name) {
                const name = isServer ? "Root" : folder.prettyName;
                if (nameRegExp) {
                  if (!nameRegExp.test(name)) {
                    continue;
                  }
                } else if (queryInfo.name != name) {
                  continue;
                }
              }

              if (queryInfo.path) {
                const folderPath = folderURIToPath(accountId, folder.URI);
                if (pathRegExp) {
                  if (!pathRegExp.test(folderPath)) {
                    continue;
                  }
                } else if (queryInfo.path != folderPath) {
                  continue;
                }
              }

              foundFolders.push(folder);
            }
          }

          // Sort by recentness for recent queries. Apply the limit, but ignore
          // limit of -1 = mail.folder_widget.max_recent for non-recent queries.
          if (queryInfo.recent) {
            let limit = queryInfo.limit || Infinity;
            if (limit == -1) {
              limit = Services.prefs.getIntPref(
                "mail.folder_widget.max_recent"
              );
            }
            foundFolders = FolderUtils.getMostRecentFolders(
              foundFolders,
              limit,
              "MRUTime"
            );
          } else if (queryInfo.limit && queryInfo.limit > 0) {
            // If limit is used without recent, mail.folder_widget.max_recent is
            // ignored.
            foundFolders.splice(queryInfo.limit);
          }

          return foundFolders.map(folder =>
            context.extension.folderManager.convert(folder)
          );
        },
        async get(folderId, includeSubFolders) {
          const { folder, accountKey } = getFolder(folderId);
          if (includeSubFolders) {
            return context.extension.folderManager.traverseSubfolders(
              folder,
              accountKey
            );
          }
          return context.extension.folderManager.convert(folder);
        },
        async create(destination, childName) {
          // The schema file allows parent to be either a MailFolder or a
          // MailAccount.
          const {
            folder: parentFolder,
            accountKey,
            isUnified,
            isTag,
          } = getFolder(destination);

          if (isUnified) {
            throw new ExtensionError(
              `The destination used in folders.create() cannot be a unified mailbox folder`
            );
          }

          if (isTag) {
            throw new ExtensionError(
              `The destination used in folders.create() cannot be a virtual tag folder`
            );
          }

          if (parentFolder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
            throw new ExtensionError(
              `The destination used in folders.create() cannot be a virtual search folder`
            );
          }

          if (!parentFolder.canCreateSubfolders) {
            throw new ExtensionError(
              `The destination used in folders.create() does not support to create subfolders.`
            );
          }

          if (
            parentFolder.hasSubFolders &&
            parentFolder.subFolders.find(f => f.prettyName == childName)
          ) {
            throw new ExtensionError(
              `folders.create() failed, because ${childName} already exists in ${folderURIToPath(
                accountKey,
                parentFolder.URI
              )}`
            );
          }

          const childFolderPromise = waitForOperation(
            MailServices.mfn.folderAdded,
            parentFolder.URI
          );
          parentFolder.createSubfolder(childName, null);

          const childFolder = await childFolderPromise;
          return context.extension.folderManager.convert(
            childFolder,
            accountKey
          );
        },
        async rename(target, newName) {
          const { folder, accountKey } = getFolder(target);

          if (!FolderManager.canBeRenamed(folder)) {
            const name = folder.isServer ? "Root" : folder.prettyName;
            throw new ExtensionError(
              `folders.rename() failed, the folder ${name} cannot be renamed`
            );
          }

          if (folder.parent.subFolders.find(f => f.prettyName == newName)) {
            throw new ExtensionError(
              `folders.rename() failed, because ${newName} already exists in ${folderURIToPath(
                accountKey,
                folder.parent.URI
              )}`
            );
          }

          const newFolderPromise = waitForOperation(
            MailServices.mfn.folderRenamed,
            folder.URI
          );
          folder.rename(newName, null);

          const newFolder = await newFolderPromise;
          return context.extension.folderManager.convert(newFolder, accountKey);
        },
        async move(source, destination) {
          return doMoveCopyOperation(
            source,
            destination,
            context.extension,
            true /* isMove */
          );
        },
        async copy(source, destination) {
          return doMoveCopyOperation(
            source,
            destination,
            context.extension,
            false /* isMove */
          );
        },
        async delete(target) {
          if (
            !context.extension.hasPermission("accountsFolders") ||
            !context.extension.hasPermission("messagesDelete")
          ) {
            throw new ExtensionError(
              'Using folders.delete() requires the "accountsFolders" and the "messagesDelete" permission'
            );
          }

          const { folder } = getFolder(target);

          if (!FolderManager.canBeDeleted(folder)) {
            const name = folder.isServer ? "Root" : folder.prettyName;
            throw new ExtensionError(
              `folders.delete() failed, the folder ${name} cannot be deleted`
            );
          }

          if (folder.server.type == "imap") {
            let inTrash = false;
            let parent = folder.parent;
            while (!inTrash && parent) {
              inTrash = parent.flags & Ci.nsMsgFolderFlags.Trash;
              parent = parent.parent;
            }
            if (inTrash) {
              // FixMe: The UI is not updated, the folder is still shown, only after
              // a restart it is removed from trash.
              const deletedPromise = new Promise(resolve => {
                MailServices.imap.deleteFolder(
                  folder,
                  {
                    OnStartRunningUrl() {},
                    OnStopRunningUrl(url, status) {
                      resolve(status);
                    },
                  },
                  null
                );
              });
              const status = await deletedPromise;
              if (!Components.isSuccessCode(status)) {
                throw new ExtensionError(
                  `folders.delete() failed for unknown reasons`
                );
              }
            } else {
              // FixMe: Accounts could have their trash folder outside of their
              // own folder structure.
              const trash = folder.server.rootFolder.getFolderWithFlags(
                Ci.nsMsgFolderFlags.Trash
              );
              const deletedPromise = new Promise(resolve => {
                MailServices.imap.moveFolder(
                  folder,
                  trash,
                  {
                    OnStartRunningUrl() {},
                    OnStopRunningUrl(url, status) {
                      resolve(status);
                    },
                  },
                  null
                );
              });
              const status = await deletedPromise;
              if (!Components.isSuccessCode(status)) {
                throw new ExtensionError(
                  `folders.delete() failed for unknown reasons`
                );
              }
            }
          } else {
            const deletedPromise = waitForOperation(
              MailServices.mfn.folderDeleted |
                MailServices.mfn.folderMoveCopyCompleted,
              folder.URI
            );
            folder.deleteSelf(null);
            await deletedPromise;
          }
        },
        async update(target, updateProperties) {
          const { folder, path } = getFolder(target);

          if (!folder.parent) {
            throw new ExtensionError(
              `folders.update() failed, cannot update account root: ${path}`
            );
          }

          if (updateProperties.isFavorite != null) {
            if (updateProperties.isFavorite) {
              folder.setFlag(Ci.nsMsgFolderFlags.Favorite);
            } else {
              folder.clearFlag(Ci.nsMsgFolderFlags.Favorite);
            }
          }
        },
        async getFolderCapabilities(target) {
          const { folder } = getFolder(target);

          const mailFolderCapabilities = {
            canAddMessages: !!folder.canFileMessages,
            canAddSubfolders: !!folder.canCreateSubfolders,
            canBeDeleted: !!FolderManager.canBeDeleted(folder),
            canBeRenamed: !!FolderManager.canBeRenamed(folder),
            canDeleteMessages: !!folder.canDeleteMessages,
          };

          return mailFolderCapabilities;
        },
        async getFolderInfo(target) {
          const { folder } = getFolder(target);

          if (folder.isServer) {
            throw new ExtensionError(
              `folders.getFolderInfo() failed, not supported for root folders`
            );
          }

          // Support quota names containing "STORAGE" or "MESSAGE", which are
          // defined in RFC2087. Excluding unusual quota names containing items
          // like "MAILBOX" and "LEVEL".
          let folderQuota = [];
          if (folder.getQuota) {
            folderQuota = folder
              .getQuota()
              .map(quota => {
                const name = quota.name.toUpperCase();
                const type = ["STORAGE", "MESSAGE"].find(x => name.includes(x));
                switch (type) {
                  case "STORAGE":
                    return {
                      type,
                      limit: quota.limit * 1024,
                      used: quota.usage * 1024,
                      unused: (quota.limit - quota.usage) * 1024,
                    };
                  case "MESSAGE":
                    return {
                      type,
                      limit: quota.limit,
                      used: quota.usage,
                      unused: quota.limit - quota.usage,
                    };
                }
                return null;
              })
              .filter(quota => !!quota);
          }

          // Virtual folders which search all folders without explicitly stating
          // their searchfolders, do not correctly report message counts. The
          // count is updated whenever a search was done in the UI!
          if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
            const wrappedVirtualFolder =
              VirtualFolderHelper.wrapVirtualFolder(folder);
            if (wrappedVirtualFolder.searchFolderURIs == "*") {
              console.warn(
                "folders.getFolderInfo() for virtual folders searching all folders may return invalid results"
              );
            }
          }

          const mailFolderInfo = {
            totalMessageCount: folder.getTotalMessages(false),
            unreadMessageCount: folder.getNumUnread(false),
            newMessageCount: folder.msgDatabase.getNewList().length,
          };

          if (folderQuota.length) {
            mailFolderInfo.quota = folderQuota;
          }

          // MailFolderInfo.favorite property was moved to MailFolder.isFavorite
          // in MV3.
          if (manifestVersion < 3) {
            mailFolderInfo.favorite = folder.getFlag(
              Ci.nsMsgFolderFlags.Favorite
            );
          }

          try {
            const time = Number(folder.getStringProperty("MRUTime")) * 1000;
            if (time) {
              mailFolderInfo.lastUsed = new Date(time);
            }
          } catch (e) {}

          return mailFolderInfo;
        },
        async getParentFolders(target, includeSubFolders) {
          const { folderManager } = context.extension;
          let { folder, accountKey, isUnified, isTag } = getFolder(target);

          const parentFolders = [];
          // Early exit for unified mailbox folders and virtual tag folders. For
          // the WebExtension API, these folders exist independently of an account,
          // and we do not want to expose them belonging to a common base account.
          if (isUnified || isTag) {
            return [];
          }

          // MV3 considers the rootFolder as a true folder.
          while (
            folder.parent != null &&
            (manifestVersion > 2 || folder.parent.parent != null)
          ) {
            folder = folder.parent;

            if (includeSubFolders) {
              parentFolders.push(
                folderManager.traverseSubfolders(folder, accountKey)
              );
            } else {
              parentFolders.push(folderManager.convert(folder, accountKey));
            }
          }
          return parentFolders;
        },
        async getSubFolders(target, includeSubFolders) {
          const { folderManager } = context.extension;
          let { folder, accountKey, isUnified } = getFolder(target);
          const directSubFolders = folderManager.getDirectSubfolders(
            folder,
            isUnified
          );

          // If the folder is a virtual folder, its subfolders could belong to a
          // different account. Ignore the accountKey.
          if (folder.getFlag(Ci.nsMsgFolderFlags.Virtual)) {
            accountKey = null;
          }

          const subFolders = [];
          for (const directSubFolder of directSubFolders) {
            if (includeSubFolders) {
              subFolders.push(
                folderManager.traverseSubfolders(directSubFolder, accountKey)
              );
            } else {
              subFolders.push(
                folderManager.convert(directSubFolder, accountKey)
              );
            }
          }
          return subFolders;
        },
        async getUnifiedFolder(requestedType, includeSubFolders) {
          const { folderManager } = context.extension;
          const { name: smartFolderName } =
            SmartMailboxUtils.getFolderTypes().find(
              ({ type }) => type == requestedType
            );

          if (!smartFolderName) {
            throw new ExtensionError(
              `folders.getUnifiedFolder() failed, the requested type ${requestedType} is unknown`
            );
          }

          const smartMailbox = SmartMailboxUtils.getSmartMailbox();
          const smartFolder = smartMailbox.getSmartFolder(smartFolderName);
          if (!smartFolder) {
            throw new ExtensionError(
              `folders.getUnifiedFolder() failed, the folder for the requested type ${requestedType} does not exist`
            );
          }
          if (includeSubFolders) {
            return folderManager.traverseSubfolders(smartFolder);
          }
          return folderManager.convert(smartFolder);
        },
        async getTagFolder(requestedTagKey) {
          const { folderManager } = context.extension;
          const tag = MailServices.tags
            .getAllTags()
            .find(t => t.key == requestedTagKey);
          if (!tag) {
            throw new ExtensionError(
              `folders.getTagFolder() failed, the requested tag key ${requestedTagKey} is unknown`
            );
          }

          const smartMailbox = SmartMailboxUtils.getSmartMailbox();
          const tagFolder = smartMailbox.getTagFolder(tag);
          if (!tagFolder) {
            throw new ExtensionError(
              `folders.getTagFolder() failed, the folder for the requested tag key ${requestedTagKey} does not exist`
            );
          }
          return folderManager.convert(tagFolder);
        },
        markAsRead(target) {
          const { folder, path } = getFolder(target);

          if (!folder.parent) {
            throw new ExtensionError(
              `folders.markAsRead() failed, cannot mark account root as read: ${path}`
            );
          }

          if (folder.flags & Ci.nsMsgFolderFlags.Virtual) {
            const virtualFolder = VirtualFolderHelper.wrapVirtualFolder(folder);
            const folders = getWildcardVirtualFolders(virtualFolder);
            for (const searchFolder of virtualFolder.searchFolders) {
              folders.push(searchFolder);
            }
            for (const nativeFolder of folders) {
              nativeFolder.markAllMessagesRead(null);
            }
          } else {
            folder.markAllMessagesRead(null);
          }
        },
      },
    };
  }
};
