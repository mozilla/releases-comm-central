/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_STOREINDEXER_H_
#define COMM_MAILNEWS_LOCAL_SRC_STOREINDEXER_H_

#include "nsIMsgPluggableStore.h"
#include "nsCOMPtr.h"
#include "nsString.h"
#include <mozilla/Buffer.h>

class nsMsgLocalMailFolder;
class nsParseMailMessageState;
class nsIMsgDatabase;

/**
 * StoreIndexer iterates through all the messages in a folder's local
 * msgStore, building (or rebuilding) the message database.
 *
 * Future improvements:
 * StoreIndexer should be decoupled from the folder. It should just take an
 * nsIMsgPluggableStore to scan and a nsIMsgDatabase to populate, and that's
 * it.
 * Any folder-specific stuff (folder locking etc) should be handled higher
 * up, by the calling code and its callback functions.
 *
 * NOTE: deriving from nsIStoreScanListener is _purely_ an implementation
 * detail, and should not be considered part of the public interface!
 */

class StoreIndexer : public nsIStoreScanListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTORESCANLISTENER
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER

  StoreIndexer();

  /**
   * GoIndex() begins indexing the folder.
   *
   * As the operation progresses, progressFn is invoked regularly to
   * provide feedback.
   * When the indexing is complete, completionFn is invoked.
   *
   * Once this function is called, StoreIndex is self-sustaining - you don't
   * need to hold an external RefPtr<> on it to keep it from being deleted.
   * It will keep itself in existance until completion, so it can be used in
   * a "fire-and-forget" manner.
   *
   * If this function returns an error, no callbacks will be invoked.
   * Also, no callbacks will be invoked until _after_ this function has
   * returned.
   */
  nsresult GoIndex(nsMsgLocalMailFolder* folder,
                   std::function<void(int64_t, int64_t)> progressFn = {},
                   std::function<void(nsresult)> completionFn = {});

 private:
  virtual ~StoreIndexer();
  void ReleaseFolder();

  RefPtr<nsMsgLocalMailFolder> mFolder;
  nsCOMPtr<nsIMsgDatabase> mDB;
  nsCOMPtr<nsIMsgDatabase> mBackupDB;

  std::function<void(int64_t, int64_t)> mProgressFn;
  std::function<void(nsresult)> mCompletionFn;

  // Vars to track overall progress.
  int64_t mExpectedTotalCount;
  int64_t mCurrentCount;

  // The storeToken for the message currently being processed.
  nsAutoCString mStoreToken;
  // Track the size of the current message.
  size_t mCurrentMsgSize;
  // Parser object for the current message.
  RefPtr<nsParseMailMessageState> mParser;

  // Our read buffer.
  mozilla::Buffer<char> mBuf;
  // Number of consumed bytes in mBuf (starting from position 0).
  size_t mUsed;
  // Number of unconsumed bytes in mBuf (starting at position mUsed).
  size_t mUnused;

  // Any lines larger than this will not be considered for header parsing.
  static constexpr size_t STUPIDLY_LONG_LINE_THRESHOLD = 1000;
  // True if we're currently processing a stupidly-long-line.
  bool mIsStupidlyLongLine;
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_STOREINDEXER_H_
