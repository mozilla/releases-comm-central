/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef PerFolderDatabase_h__
#define PerFolderDatabase_h__

#include "FolderDatabase.h"
#include "mozilla/WeakPtr.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsIDBFolderInfo.h"
#include "nsIFolder.h"
#include "nsIMsgDatabase.h"
#include "nsMsgEnumerator.h"

namespace mozilla::mailnews {

class MessageDatabase;

class PerFolderDatabase : public nsIMsgDatabase, public SupportsWeakPtr {
 public:
  explicit PerFolderDatabase(MessageDatabase* aDatabase, uint64_t aFolderId)
      : mDatabase(aDatabase), mFolderId(aFolderId) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBCHANGEANNOUNCER
  NS_DECL_NSIMSGDATABASE

 private:
  virtual ~PerFolderDatabase() {};

  MessageDatabase* mDatabase;
  uint64_t mFolderId;
  nsTArray<nsMsgKey> mNewList;
};

class MessageEnumerator : public nsBaseMsgEnumerator {
 public:
  MessageEnumerator(MessageDatabase* aDatabase, mozIStorageStatement* aStmt);

  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

 private:
  ~MessageEnumerator() {
    if (mStmt) mStmt->Finalize();
  }

  MessageDatabase* mDatabase;
  nsCOMPtr<mozIStorageStatement> mStmt;
  bool mHasNext = false;
};

class FolderInfo : public nsIDBFolderInfo {
 public:
  explicit FolderInfo(uint64_t aFolderId);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBFOLDERINFO

 private:
  virtual ~FolderInfo() {};

  nsCOMPtr<nsIFolderDatabase> mDatabase;
  nsCOMPtr<nsIFolder> mFolder;
};

}  // namespace mozilla::mailnews

#endif  // PerFolderDatabase_h__
