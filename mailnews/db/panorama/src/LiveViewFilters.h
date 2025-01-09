/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LiveViewFilters_h__
#define LiveViewFilters_h__

#include "Folder.h"
#include "MessageDatabase.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsMsgMessageFlags.h"
#include "nsString.h"
#include "nsTString.h"

namespace mozilla {
namespace mailnews {

class LiveViewFilter {
 public:
  LiveViewFilter() : mUID(nextUID++) {}
  virtual ~LiveViewFilter() {}

  virtual nsCString GetSQLClause() { return mSQLClause; }
  virtual void PrepareStatement(mozIStorageStatement* aStmt) {}
  virtual bool Matches(Message& aMessage) { return false; }

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

  bool Matches(Message& aMessage) { return aMessage.folderId == mFolderId; }

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
      mIds.AppendElement(aFolders[i]->GetId());
    }
    mSQLClause.Append(")");
  }

  bool Matches(Message& aMessage) { return mIds.Contains(aMessage.folderId); }

 protected:
  nsTArray<uint64_t> mIds;
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // LiveViewFilters_h__
