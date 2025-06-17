/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_VIRTUALFOLDERWRAPPER_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_VIRTUALFOLDERWRAPPER_H_

#include "nsIVirtualFolderWrapper.h"

#include "FolderDatabase.h"
#include "mozilla/Components.h"
#include "nsCOMPtr.h"
#include "nsIDatabaseCore.h"
#include "nsIFactory.h"
#include "nsIFolderDatabase.h"
#include "nsIMsgFolder.h"

namespace mozilla::mailnews {

class VirtualFolderWrapper : public nsIVirtualFolderWrapper {
 public:
  VirtualFolderWrapper() {}
  explicit VirtualFolderWrapper(nsIFolder* folder) {
    nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
    nsCOMPtr<nsIFolderDatabase> folders = database->GetFolders();
    mFolderDatabase = static_cast<FolderDatabase*>(folders.get());

    folders->GetMsgFolderForFolder(folder, getter_AddRefs(mMsgFolder));
    mVirtualFolderId = folder->GetId();
  }

  NS_DECL_ISUPPORTS
  NS_DECL_NSIVIRTUALFOLDERWRAPPER

  nsTArray<uint64_t> GetSearchFolderIds();

 protected:
  virtual ~VirtualFolderWrapper() {};

  FolderDatabase* mFolderDatabase;
  nsCOMPtr<nsIMsgFolder> mMsgFolder;
  uint64_t mVirtualFolderId;
};

class VirtualFolderWrapperFactory final : public nsIFactory {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIFACTORY

 private:
  ~VirtualFolderWrapperFactory() = default;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_VIRTUALFOLDERWRAPPER_H_
