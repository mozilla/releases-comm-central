/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "DeferredTask",
  "resource://gre/modules/DeferredTask.jsm"
);

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
        Ci.nsIFolderListener.intPropertyChanged
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

  OnItemIntPropertyChanged(item, property, oldValue, newValue) {
    if (!(item instanceof Ci.nsIMsgFolder)) {
      return;
    }

    switch (property) {
      case "FolderFlag":
        if (
          (oldValue & Ci.nsMsgFolderFlags.Favorite) !=
          (newValue & Ci.nsMsgFolderFlags.Favorite)
        ) {
          this.addPendingInfoNotification(
            item,
            "favorite",
            !!(newValue & Ci.nsMsgFolderFlags.Favorite)
          );
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
    let folderInfo = this.pendingInfoNotifications.get(folder);
    if (folderInfo.size > 0) {
      this.emit(
        "folder-info-changed",
        convertFolder(folder),
        Object.fromEntries(folderInfo)
      );
      this.pendingInfoNotifications.delete(folder);
    }
  }

  // nsIMsgFolderListener

  folderAdded(childFolder) {
    this.emit("folder-created", convertFolder(childFolder));
  }
  folderDeleted(oldFolder) {
    this.emit("folder-deleted", convertFolder(oldFolder));
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
        convertFolder(srcFolder),
        convertFolder(dstFolder)
      );
    } else {
      this.emit(
        "folder-copied",
        convertFolder(srcFolder),
        convertFolder(dstFolder)
      );
    }
  }
  folderRenamed(oldFolder, newFolder) {
    this.emit(
      "folder-renamed",
      convertFolder(oldFolder),
      convertFolder(newFolder)
    );
  }
})();

/**
 * Accepts a MailFolder or a MailAccount and returns the actual folder and its
 * accountId. Throws if the requested folder does not exist.
 */
function getFolder({ accountId, path, id }) {
  if (id && !path && !accountId) {
    accountId = id;
    path = "/";
  }

  let uri = folderPathToURI(accountId, path);
  let folder = MailServices.folderLookup.getFolderForURL(uri);
  if (!folder) {
    throw new ExtensionError(`Folder not found: ${path}`);
  }
  return { folder, accountId };
}

/**
 * Copy or Move a folder.
 */
async function doMoveCopyOperation(source, destination, isMove) {
  // The schema file allows destination to be either a MailFolder or a
  // MailAccount.
  let srcFolder = getFolder(source);
  let dstFolder = getFolder(destination);

  if (
    srcFolder.folder.server.type == "nntp" ||
    dstFolder.folder.server.type == "nntp"
  ) {
    throw new ExtensionError(
      `folders.${isMove ? "move" : "copy"}() is not supported in news accounts`
    );
  }

  if (
    dstFolder.folder.hasSubFolders &&
    dstFolder.folder.subFolders.find(
      f => f.prettyName == srcFolder.folder.prettyName
    )
  ) {
    throw new ExtensionError(
      `folders.${isMove ? "move" : "copy"}() failed, because ${
        srcFolder.folder.prettyName
      } already exists in ${folderURIToPath(
        dstFolder.accountId,
        dstFolder.folder.URI
      )}`
    );
  }

  let rv = await new Promise(resolve => {
    let _destination = null;
    const listener = {
      folderMoveCopyCompleted(_isMove, _srcFolder, _dstFolder) {
        if (
          _destination != null ||
          _isMove != isMove ||
          _srcFolder.URI != srcFolder.folder.URI ||
          _dstFolder.URI != dstFolder.folder.URI
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
      srcFolder.folder,
      dstFolder.folder,
      isMove,
      {
        OnStartCopy() {},
        OnProgress() {},
        SetMessageKey() {},
        GetMessageId() {},
        OnStopCopy(status) {
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
    throw new ExtensionError(
      `folders.${isMove ? "move" : "copy"}() failed for unknown reasons`
    );
  }

  return convertFolder(rv.folder, dstFolder.accountId);
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

this.folders = class extends ExtensionAPI {
  getAPI(context) {
    return {
      folders: {
        onCreated: new EventManager({
          context,
          name: "folders.onCreated",
          register: fire => {
            let listener = async (event, createdMailFolder) => {
              fire.async(createdMailFolder);
            };
            folderTracker.on("folder-created", listener);
            return () => {
              folderTracker.off("folder-created", listener);
            };
          },
        }).api(),
        onRenamed: new EventManager({
          context,
          name: "folders.onRenamed",
          register: fire => {
            let listener = async (
              event,
              originalMailFolder,
              renamedMailFolder
            ) => {
              fire.async(originalMailFolder, renamedMailFolder);
            };
            folderTracker.on("folder-renamed", listener);
            return () => {
              folderTracker.off("folder-renamed", listener);
            };
          },
        }).api(),
        onMoved: new EventManager({
          context,
          name: "folders.onMoved",
          register: fire => {
            let listener = async (event, srcMailFolder, dstMailFolder) => {
              fire.async(srcMailFolder, dstMailFolder);
            };
            folderTracker.on("folder-moved", listener);
            return () => {
              folderTracker.off("folder-moved", listener);
            };
          },
        }).api(),
        onCopied: new EventManager({
          context,
          name: "folders.onCopied",
          register: fire => {
            let listener = async (event, srcMailFolder, dstMailFolder) => {
              fire.async(srcMailFolder, dstMailFolder);
            };
            folderTracker.on("folder-copied", listener);
            return () => {
              folderTracker.off("folder-copied", listener);
            };
          },
        }).api(),
        onDeleted: new EventManager({
          context,
          name: "folders.onDeleted",
          register: fire => {
            let listener = async (event, deletedMailFolder) => {
              fire.async(deletedMailFolder);
            };
            folderTracker.on("folder-deleted", listener);
            return () => {
              folderTracker.off("folder-deleted", listener);
            };
          },
        }).api(),
        onFolderInfoChanged: new EventManager({
          context,
          name: "folders.onFolderInfoChanged",
          register: fire => {
            let listener = async (event, changedMailFolder, mailFolderInfo) => {
              fire.async(changedMailFolder, mailFolderInfo);
            };
            folderTracker.on("folder-info-changed", listener);
            return () => {
              folderTracker.off("folder-info-changed", listener);
            };
          },
        }).api(),
        async create(parent, childName) {
          // The schema file allows parent to be either a MailFolder or a
          // MailAccount.
          let { folder: parentFolder, accountId } = getFolder(parent);

          if (
            parentFolder.hasSubFolders &&
            parentFolder.subFolders.find(f => f.prettyName == childName)
          ) {
            throw new ExtensionError(
              `folders.create() failed, because ${childName} already exists in ${folderURIToPath(
                accountId,
                parentFolder.URI
              )}`
            );
          }

          let childFolderPromise = waitForOperation(
            MailServices.mfn.folderAdded,
            parentFolder.URI
          );
          parentFolder.createSubfolder(childName, null);

          let childFolder = await childFolderPromise;
          return convertFolder(childFolder, accountId);
        },
        async rename({ accountId, path }, newName) {
          let { folder } = getFolder({ accountId, path });

          if (!folder.parent) {
            throw new ExtensionError(
              `folders.rename() failed, because it cannot rename the root of the account`
            );
          }
          if (folder.server.type == "nntp") {
            throw new ExtensionError(
              `folders.rename() is not supported in news accounts`
            );
          }

          if (folder.parent.subFolders.find(f => f.prettyName == newName)) {
            throw new ExtensionError(
              `folders.rename() failed, because ${newName} already exists in ${folderURIToPath(
                accountId,
                folder.parent.URI
              )}`
            );
          }

          let newFolderPromise = waitForOperation(
            MailServices.mfn.folderRenamed,
            folder.URI
          );
          folder.rename(newName, null);

          let newFolder = await newFolderPromise;
          return convertFolder(newFolder, accountId);
        },
        async move(source, destination) {
          return doMoveCopyOperation(source, destination, true /* isMove */);
        },
        async copy(source, destination) {
          return doMoveCopyOperation(source, destination, false /* isMove */);
        },
        async delete({ accountId, path }) {
          if (
            !context.extension.hasPermission("accountsFolders") ||
            !context.extension.hasPermission("messagesDelete")
          ) {
            throw new ExtensionError(
              'Using folders.delete() requires the "accountsFolders" and the "messagesDelete" permission'
            );
          }

          let { folder } = getFolder({ accountId, path });
          if (folder.server.type == "nntp") {
            throw new ExtensionError(
              `folders.delete() is not supported in news accounts`
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
              let deletedPromise = new Promise(resolve => {
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
              let status = await deletedPromise;
              if (!Components.isSuccessCode(status)) {
                throw new ExtensionError(
                  `folders.delete() failed for unknown reasons`
                );
              }
            } else {
              // FixMe: Accounts could have their trash folder outside of their
              // own folder structure.
              let trash = folder.server.rootFolder.getFolderWithFlags(
                Ci.nsMsgFolderFlags.Trash
              );
              let deletedPromise = new Promise(resolve => {
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
              let status = await deletedPromise;
              if (!Components.isSuccessCode(status)) {
                throw new ExtensionError(
                  `folders.delete() failed for unknown reasons`
                );
              }
            }
          } else {
            let deletedPromise = waitForOperation(
              MailServices.mfn.folderDeleted |
                MailServices.mfn.folderMoveCopyCompleted,
              folder.URI
            );
            folder.deleteSelf(null);
            await deletedPromise;
          }
        },
        async getFolderInfo({ accountId, path }) {
          let { folder } = getFolder({ accountId, path });

          let mailFolderInfo = {
            favorite: folder.getFlag(Ci.nsMsgFolderFlags.Favorite),
            totalMessageCount: 0,
            unreadMessageCount: 0,
          };

          // Not using folder.getNumUnread() here, as it is unreliable.
          if (folder.messages) {
            let messages = folder.messages;
            while (messages.hasMoreElements()) {
              let msg = messages.getNext();
              mailFolderInfo.totalMessageCount++;
              if (!msg.isRead) {
                mailFolderInfo.unreadMessageCount++;
              }
            }
          }
          return mailFolderInfo;
        },
        async getParentFolders({ accountId, path }, includeFolders) {
          let { folder } = getFolder({ accountId, path });
          let parentFolders = [];
          // We do not consider the absolute root ("/") as a root folder, but
          // the first real folders (all folders returned in MailAccount.folders
          // are considered root folders).
          while (folder.parent != null && folder.parent.parent != null) {
            folder = folder.parent;

            if (includeFolders) {
              parentFolders.push(traverseSubfolders(folder, accountId));
            } else {
              parentFolders.push(convertFolder(folder, accountId));
            }
          }
          return parentFolders;
        },
        async getSubFolders(accountOrFolder, includeFolders) {
          let { folder, accountId } = getFolder(accountOrFolder);
          let subFolders = [];
          if (folder.hasSubFolders) {
            for (let subFolder of folder.subFolders) {
              if (includeFolders) {
                subFolders.push(traverseSubfolders(subFolder, accountId));
              } else {
                subFolders.push(convertFolder(subFolder, accountId));
              }
            }
          }
          return subFolders;
        },
      },
    };
  }
};
