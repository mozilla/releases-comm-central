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
    return {
      folders: {
        async create({ accountId, path: parentPath }, childName) {
          let uri = folderPathToURI(accountId, parentPath);
          let parentFolder = MailServices.folderLookup.getFolderForURL(uri);
          if (!parentFolder) {
            throw new ExtensionError(`Folder not found: ${parentPath}`);
          }

          let childFolder = await new Promise(resolve => {
            MailServices.mfn.addListener(
              {
                folderAdded(childFolder) {
                  if (childFolder.parent.URI != uri) {
                    return;
                  }

                  MailServices.mfn.removeListener(this);
                  resolve(childFolder);
                },
              },
              MailServices.mfn.folderAdded
            );

            parentFolder.createSubfolder(childName, null);
          });

          return convertFolder(childFolder);
        },
        async rename({ accountId, path }, newName) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

          let newFolder = await new Promise(resolve => {
            MailServices.mfn.addListener(
              {
                folderRenamed(oldFolder, newFolder) {
                  if (oldFolder.URI != uri) {
                    return;
                  }

                  MailServices.mfn.removeListener(this);
                  resolve(newFolder);
                },
              },
              MailServices.mfn.folderRenamed
            );

            folder.rename(newName, null);
          });

          return convertFolder(newFolder);
        },
        async delete({ accountId, path }) {
          let uri = folderPathToURI(accountId, path);
          let folder = MailServices.folderLookup.getFolderForURL(uri);
          if (!folder) {
            throw new ExtensionError(`Folder not found: ${path}`);
          }

          await new Promise(resolve => {
            MailServices.mfn.addListener(
              {
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
                  resolve();
                },
              },
              MailServices.mfn.folderDeleted |
                MailServices.mfn.folderMoveCopyCompleted
            );

            folder.parent.deleteSubFolders(
              toXPCOMArray([folder], Ci.nsIMutableArray),
              null
            );
          });
        },
      },
    };
  }
};
