/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

ChromeUtils.defineModuleGetter(
  this,
  "MailServices",
  "resource:///modules/MailServices.jsm"
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
        async create(accountOrParentFolder, childName) {
          let accountId, parentPath;
          if (
            accountOrParentFolder.hasOwnProperty("accountId") &&
            accountOrParentFolder.hasOwnProperty("path")
          ) {
            accountId = accountOrParentFolder.accountId;
            parentPath = accountOrParentFolder.path;
          } else {
            accountId = accountOrParentFolder.id;
            parentPath = "/";
          }

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
          return convertFolder(childFolder, accountId);
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
          return convertFolder(newFolder, accountId);
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
        async getParentFolders({ accountId, path }, includeFolders) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

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
          let accountId, path;
          if (
            accountOrFolder.hasOwnProperty("accountId") &&
            accountOrFolder.hasOwnProperty("path")
          ) {
            accountId = accountOrFolder.accountId;
            path = accountOrFolder.path;
          } else {
            accountId = accountOrFolder.id;
            path = "/";
          }

          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

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
