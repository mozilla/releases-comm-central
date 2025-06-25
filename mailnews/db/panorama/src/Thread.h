/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_

#include "DatabaseCore.h"
#include "Message.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "nsIMsgThread.h"
#include "nsMsgEnumerator.h"

namespace mozilla::mailnews {

class Thread : public nsIMsgThread {
 public:
  explicit Thread(uint64_t folderId, uint64_t threadId, uint64_t maxDate)
      : mFolderId(folderId), mThreadId(threadId), mMaxDate(maxDate) {
    RefPtr<DatabaseCore> database = DatabaseCore::GetInstanceForService();
    mMessageDatabase = database->mMessageDatabase;
  }
  explicit Thread(uint64_t folderId, uint64_t threadId)
      : Thread(folderId, threadId, 0) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTHREAD

 private:
  virtual ~Thread() {};

  RefPtr<MessageDatabase> mMessageDatabase;
  uint64_t mFolderId;
  uint64_t mThreadId;
  uint64_t mMaxDate;

  nsresult GetKeys(nsTArray<nsMsgKey>& keys);
  nsTArray<nsMsgKey> mKeys;
};

class ThreadMessageEnumerator : public nsBaseMsgEnumerator {
 public:
  explicit ThreadMessageEnumerator(nsTArray<nsMsgKey>& keys)
      : mKeys(keys.Clone()) {
    RefPtr<DatabaseCore> database = DatabaseCore::GetInstanceForService();
    mMessageDatabase = database->mMessageDatabase;
  }

  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

 private:
  ~ThreadMessageEnumerator() {}

  RefPtr<MessageDatabase> mMessageDatabase;
  nsTArray<nsMsgKey> mKeys;
  uint64_t mCurrent{0};
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
