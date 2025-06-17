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
#include "mozilla/storage/Variant.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsIDatabaseCore.h"
#include "nsIFolderDatabase.h"
#include "nsIVariant.h"
#include "nsMsgMessageFlags.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsTString.h"
#include "VirtualFolderWrapper.h"

namespace mozilla::mailnews {

class LiveViewFilter {
  friend class LiveView;

 public:
  LiveViewFilter() {}
  virtual ~LiveViewFilter() {}

  virtual bool Matches(Message& aMessage) { return false; }
  virtual void Refresh() {}

 protected:
  nsAutoCString mSQLClause;
  nsTArray<nsCOMPtr<nsIVariant>> mSQLParams;
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
    mWrapper = new VirtualFolderWrapper(folder);
    Refresh();
  }

  void Refresh();

  bool Matches(Message& message) {
    // TODO: This is incomplete. We haven't matched the message against the
    // search terms.
    return mSearchFolderIds.Contains(message.mFolderId);
  }

 protected:
  uint64_t mVirtualFolderId;
  nsTArray<uint64_t> mSearchFolderIds;
  RefPtr<VirtualFolderWrapper> mWrapper;
};

class TaggedMessagesFilter final : public LiveViewFilter {
 public:
  explicit TaggedMessagesFilter(const nsACString& aTag, bool aWanted)
      : mTag(aTag), mWanted(aWanted) {
    mSQLClause.Assign(aWanted ? "TAGS_INCLUDE(tags, ?)"
                              : "TAGS_EXCLUDE(tags, ?)");
    mSQLParams.AppendElement(new mozilla::storage::UTF8TextVariant(mTag));
  }

 protected:
  nsAutoCString mTag;
  bool mWanted;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEWFILTERS_H_
