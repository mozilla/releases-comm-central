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
  "fixIterator",
  "resource:///modules/iteratorUtils.jsm"
);
ChromeUtils.defineModuleGetter(
  this,
  "toXPCOMArray",
  "resource:///modules/iteratorUtils.jsm"
);

this.folders = class extends ExtensionAPI {
  getAPI(context) {
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
    return {
      folders: {
        async create({ accountId, path: parentPath }, childName) {
          let uri = folderPathToURI(accountId, parentPath);
          let parentFolder = MailServices.folderLookup.getFolderForURL(uri);
          if (!parentFolder) {
            throw new ExtensionError(`Folder not found: ${parentPath}`);
          }

          let childFolderPromise = waitForOperation(
            MailServices.mfn.folderAdded,
            uri
          );
          parentFolder.createSubfolder(childName, null);

          let childFolder = await childFolderPromise;
          return convertFolder(childFolder);
        },
        async rename({ accountId, path }, newName) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

          let newFolderPromise = waitForOperation(
            MailServices.mfn.folderRenamed,
            uri
          );
          folder.rename(newName, null);

          let newFolder = await newFolderPromise;
          return convertFolder(newFolder);
        },
        async delete({ accountId, path }) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

          let deletedPromise;
          if (folder.server.type == "imap") {
            let inTrash = false;
            let parent = folder.parent;
            while (!inTrash && parent) {
              inTrash = parent.flags & Ci.nsMsgFolderFlags.Trash;
              parent = parent.parent;
            }
            if (inTrash) {
              deletedPromise = new Promise(resolve => {
                MailServices.imap.deleteFolder(
                  folder,
                  {
                    OnStartRunningUrl() {},
                    OnStopRunningUrl: resolve,
                  },
                  null
                );
              });
            } else {
              let trash = folder.server.rootFolder.getFolderWithFlags(
                Ci.nsMsgFolderFlags.Trash
              );
              deletedPromise = waitForOperation(
                MailServices.mfn.folderRenamed,
                uri
              );
              MailServices.imap.moveFolder(folder, trash, null, null);
            }
          } else {
            deletedPromise = waitForOperation(
              MailServices.mfn.folderDeleted |
                MailServices.mfn.folderMoveCopyCompleted,
              uri
            );
            folder.deleteSelf(null);
          }

          // This may return a folder but we don't want the caller to get it.
          await deletedPromise;
        },
      },
    };
  }
};
