/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERDATABASE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERDATABASE_H_

#include "FolderComparator.h"
#include "mozilla/MozPromise.h"
#include "mozilla/RefPtr.h"
#include "nsIFolderDatabase.h"
#include "nsTHashMap.h"

using mozilla::MozPromise;

namespace mozilla::mailnews {

class Folder;

class FolderDatabase : public nsIFolderDatabase {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIFOLDERDATABASE

 protected:
  virtual ~FolderDatabase() {};

 private:
  friend class DatabaseCore;

  FolderDatabase() {};
  nsresult Startup();
  void Shutdown();

 private:
  friend class DatabaseCore;
  friend class FolderInfo;
  friend class VirtualFolderFilter;
  friend class VirtualFolderWrapper;

  nsresult GetFolderProperty(uint64_t id, const nsACString& name,
                             nsACString& value);
  nsresult GetFolderProperty(uint64_t id, const nsACString& name,
                             int64_t* value);
  nsresult SetFolderProperty(uint64_t id, const nsACString& name,
                             const nsACString& value);
  nsresult SetFolderProperty(uint64_t id, const nsACString& name,
                             int64_t value);

  nsresult GetVirtualFolderFolders(uint64_t virtualFolderId,
                                   nsTArray<uint64_t>& searchFolderIds);
  nsresult SetVirtualFolderFolders(uint64_t virtualFolderId,
                                   nsTArray<uint64_t>& searchFolderIds);

 private:
  nsTHashMap<uint64_t, RefPtr<Folder>> mFoldersById;
  nsTHashMap<nsCString, RefPtr<Folder>> mFoldersByPath;
  FolderComparator mComparator;

  nsresult InternalLoadFolders();

  nsresult InternalInsertFolder(nsIFolder* aParent, const nsACString& aName,
                                nsIFolder** aChild);
  nsresult InternalDeleteFolder(nsIFolder* aFolder);

  nsresult SaveOrdinals(nsTArray<RefPtr<Folder>>& aFolders);
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_FOLDERDATABASE_H_
