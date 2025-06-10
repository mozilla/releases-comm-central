/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEWFILTERS_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEWFILTERS_H_

#include "Folder.h"
#include "FolderDatabase.h"
#include "Message.h"
#include "mozilla/Components.h"
#include "mozilla/RefPtr.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsIDatabaseCore.h"
#include "nsIFolderDatabase.h"
#include "nsMsgMessageFlags.h"
#include "nsString.h"
#include "nsTString.h"

namespace mozilla::mailnews {

class LiveViewFilter {
 public:
  LiveViewFilter() : mUID(nextUID++) {}
  virtual ~LiveViewFilter() {}

  virtual nsCString GetSQLClause() { return mSQLClause; }
  virtual void PrepareStatement(mozIStorageStatement* aStmt) {}
  virtual bool Matches(Message& aMessage) { return false; }
  virtual void Refresh() {}

 protected:
  static uint64_t nextUID;
  uint64_t mUID;
  nsAutoCString mSQLClause;
};

class SingleFolderFilter final : public LiveViewFilter {
 public:
  explicit SingleFolderFilter(nsIFolder* aFolder)
      : mFolderId(aFolder->GetId()) {
    mSQLClause.Assign("folderId = ");
    mSQLClause.AppendInt(mFolderId);
  }

  bool Matches(Message& aMessage) { return aMessage.mFolderId == mFolderId; }

 protected:
  uint64_t mFolderId;
};

class MultiFolderFilter final : public LiveViewFilter {
 public:
  explicit MultiFolderFilter(const nsTArray<RefPtr<nsIFolder>>& aFolders) {
    mSQLClause.Assign("folderId IN (");
    for (size_t i = 0; i < aFolders.Length(); i++) {
      if (i > 0) {
        mSQLClause.Append(", ");
      }
      mSQLClause.AppendInt(aFolders[i]->GetId());
      mFolderIds.AppendElement(aFolders[i]->GetId());
    }
    mSQLClause.Append(")");
  }

  bool Matches(Message& aMessage) {
    return mFolderIds.Contains(aMessage.mFolderId);
  }

 protected:
  nsTArray<uint64_t> mFolderIds;
};

class VirtualFolderFilter final : public LiveViewFilter {
 public:
  explicit VirtualFolderFilter(nsIFolder* folder)
      : mVirtualFolderId(folder->GetId()) {
    mSQLClause.Assign(
        "folderId IN (SELECT searchFolderId FROM virtualFolder_folders WHERE "
        "virtualFolderId = ");
    mSQLClause.AppendInt(mVirtualFolderId);
    mSQLClause.Append(")");

    Refresh();
  }

  void Refresh() {
    nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
    nsCOMPtr<nsIFolderDatabase> folders = database->GetFolders();
    (static_cast<FolderDatabase*>(folders.get()))
        ->GetVirtualFolderFolders(mVirtualFolderId, mSearchFolderIds);
  }

  bool Matches(Message& aMessage) {
    return mSearchFolderIds.Contains(aMessage.mFolderId);
  }

 protected:
  uint64_t mVirtualFolderId;
  nsTArray<uint64_t> mSearchFolderIds;
};

class TaggedMessagesFilter final : public LiveViewFilter {
 public:
  explicit TaggedMessagesFilter(const nsACString& aTag, bool aWanted)
      : mTag(aTag), mWanted(aWanted) {
    // There could be more than one tag filter, so use a unique parameter name.
    mParamName.Assign("tag");
    mParamName.AppendInt(mUID);

    mSQLClause.Assign(aWanted ? "TAGS_INCLUDE(tags, :"
                              : "TAGS_EXCLUDE(tags, :");
    mSQLClause.Append(mParamName);
    mSQLClause.Append(")");
  }
  void PrepareStatement(mozIStorageStatement* aStmt) override {
    aStmt->BindUTF8StringByName(mParamName, mTag);
  }

 protected:
  nsAutoCString mParamName;
  nsAutoCString mTag;
  bool mWanted;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEWFILTERS_H_
