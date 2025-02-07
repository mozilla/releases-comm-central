/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_LOCAL_SRC_MBOXSCANNER_H_
#define COMM_MAILNEWS_LOCAL_SRC_MBOXSCANNER_H_

#include "nsIStreamListener.h"

class MboxMsgInputStream;
class nsIInputStreamPump;
class nsIFile;
class nsIStoreScanListener;

/**
 * MboxScanner is a helper class for implementing
 * nsMsgBrkMBoxStore::AsyncScan().
 *
 * It derives from nsIStreamListener purely as an implementation detail,
 * using itself as a listener to handle async streaming of message data.
 * nsIStreamListener shouldn't be considered part of the public interface.
 *
 * It keeps a self reference, which will be released when the operation is
 * finished. So the caller doesn't need to hold onto it.
 */
class MboxScanner : public nsIStreamListener {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSISTREAMLISTENER
  NS_DECL_NSIREQUESTOBSERVER

  // If BeginScan() is successful, a reference-counted pointer to
  // scanListener will be held until the scan completes.
  nsresult BeginScan(nsIFile* mboxFile, nsIStoreScanListener* scanListener);

 private:
  virtual ~MboxScanner() {}
  nsCOMPtr<nsIStoreScanListener> mScanListener;

  RefPtr<MboxScanner> mKungFuDeathGrip;
  RefPtr<MboxMsgInputStream> mMboxStream;
  // Pump to use a sync stream as async.
  nsCOMPtr<nsIInputStreamPump> mPump;
};

#endif  // COMM_MAILNEWS_LOCAL_SRC_MBOXSCANNER_H_
