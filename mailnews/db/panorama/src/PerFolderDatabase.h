/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_PERFOLDERDATABASE_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_PERFOLDERDATABASE_H_

#include "DatabaseCore.h"
#include "FolderDatabase.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "mozilla/WeakPtr.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsIDBChangeListener.h"
#include "nsIDBFolderInfo.h"
#include "nsIFolder.h"
#include "nsIMsgDatabase.h"
#include "nsIMsgFolder.h"
#include "nsIMsgThread.h"
#include "nsMsgEnumerator.h"

namespace mozilla::mailnews {

class PerFolderDatabase : public nsIMsgDatabase,
                          public SupportsWeakPtr,
                          public MessageListener {
 public:
  explicit PerFolderDatabase(uint64_t folderId, bool isNewsFolder)
      : mFolderId(folderId), mIsNewsFolder(isNewsFolder) {
    MessageDB().AddMessageListener(this);
  }

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBCHANGEANNOUNCER
  NS_DECL_NSIMSGDATABASE

  // MessageListener functions.
  void OnMessageAdded(Message* message) override;
  void OnMessageRemoved(Message* message) override;
  void OnMessageFlagsChanged(Message* message, uint64_t oldFlags,
                             uint64_t newFlags) override;

 private:
  virtual ~PerFolderDatabase() {};

  MessageDatabase& MessageDB() const {
    return *DatabaseCore::sInstance->mMessageDatabase;
  }

  uint64_t mFolderId;
  bool mIsNewsFolder;
  nsTArray<nsMsgKey> mNewList;
  nsTObserverArray<RefPtr<nsIDBChangeListener>> mListeners;
};

class MessageEnumerator : public nsBaseMsgEnumerator {
 public:
  explicit MessageEnumerator(mozIStorageStatement* aStmt);

  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

 private:
  ~MessageEnumerator() {
    if (mStmt) mStmt->Finalize();
  }

  nsCOMPtr<mozIStorageStatement> mStmt;
  bool mHasNext = false;
};

class ThreadEnumerator : public nsBaseMsgThreadEnumerator {
 public:
  ThreadEnumerator(mozIStorageStatement* stmt, uint64_t folderId);

  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgThread** item) override;
  NS_IMETHOD HasMoreElements(bool* hasNext) override;

 private:
  ~ThreadEnumerator() {
    if (mStmt) mStmt->Finalize();
  }

  nsCOMPtr<mozIStorageStatement> mStmt;
  uint64_t mFolderId;
  bool mHasNext = false;
};

class FolderInfo : public nsIDBFolderInfo {
 public:
  explicit FolderInfo(PerFolderDatabase* perFolderDatabase, uint64_t folderId);

  NS_DECL_ISUPPORTS
  NS_DECL_NSIDBFOLDERINFO

 private:
  virtual ~FolderInfo() {};

  FolderDatabase& FolderDB() const {
    return *DatabaseCore::sInstance->mFolderDatabase;
  }
  MessageDatabase& MessageDB() const {
    return *DatabaseCore::sInstance->mMessageDatabase;
  }
  RefPtr<PerFolderDatabase> mPerFolderDatabase;
  nsCOMPtr<nsIFolder> mFolder;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_PERFOLDERDATABASE_H_
