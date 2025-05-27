/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_

#include "Message.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "nsIMsgThread.h"
#include "nsMsgEnumerator.h"

namespace mozilla::mailnews {

class Thread : public nsIMsgThread {
 public:
  explicit Thread(MessageDatabase* messageDatabase, uint64_t folderId,
                  uint64_t threadId, uint64_t maxDate)
      : mMessageDatabase(messageDatabase),
        mFolderId(folderId),
        mThreadId(threadId),
        mMaxDate(maxDate) {}
  explicit Thread(MessageDatabase* messageDatabase, uint64_t folderId,
                  uint64_t threadId)
      : Thread(messageDatabase, folderId, threadId, 0) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGTHREAD

 private:
  virtual ~Thread() {};

  MessageDatabase* mMessageDatabase;
  uint64_t mFolderId;
  uint64_t mThreadId;
  uint64_t mMaxDate;

  nsresult GetKeys(nsTArray<nsMsgKey>& keys);
  nsTArray<nsMsgKey> mKeys;
};

class ThreadMessageEnumerator : public nsBaseMsgEnumerator {
 public:
  ThreadMessageEnumerator(MessageDatabase* messageDatabase,
                          nsTArray<nsMsgKey>& keys)
      : mMessageDatabase(messageDatabase), mKeys(keys.Clone()) {}

  // nsIMsgEnumerator support.
  NS_IMETHOD GetNext(nsIMsgDBHdr** aItem) override;
  NS_IMETHOD HasMoreElements(bool* aResult) override;

 private:
  ~ThreadMessageEnumerator() {}

  MessageDatabase* mMessageDatabase;
  nsTArray<nsMsgKey> mKeys;
  uint64_t mCurrent{0};
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_THREAD_H_
