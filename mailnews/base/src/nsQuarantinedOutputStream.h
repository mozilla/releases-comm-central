/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef nsQuarantinedOutputStream_h__
#define nsQuarantinedOutputStream_h__

#include "nsIOutputStream.h"
#include "nsISafeOutputStream.h"
#include "nsCOMPtr.h"

class nsIFile;

/**
 * nsQuarantinedOutputStream layers on top of an existing target output stream.
 * The idea is to let an OS virus checker quarantine individual messages
 * _before_ they hit the mbox. You don't want entire mboxes embargoed if
 * you can avoid it.
 *
 * It works by buffering all writes to a temporary file.
 * When finish() is called the temporary file is closed, reopened,
 * then copied into a pre-existing target stream. There's no special OS
 * virus-checker integration - the assumption is that the checker will hook
 * into the filesystem and prevent us from opening a file it has flagged as
 * dodgy. Hence the temp file close/reopen before the final write.
 *
 * If the nsQuarantinedOutputStream is closed (or released) without calling
 * finish(), the write is discarded (as per nsISafeOutputStream requirements).
 *
 * Upon close() or finish(), the underlying target file is also closed.
 */
class nsQuarantinedOutputStream : public nsIOutputStream, nsISafeOutputStream {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIOUTPUTSTREAM
  NS_DECL_NSISAFEOUTPUTSTREAM

  /**
   * Pass the target output stream in during construction. Upon Close(),
   * the written data will be copied here.
   */
  explicit nsQuarantinedOutputStream(nsIOutputStream* target)
      : mTarget(target) {}
  nsQuarantinedOutputStream() = delete;

 protected:
  virtual ~nsQuarantinedOutputStream();

  // Set up mTempFile and mTempStream (called at
  // (lazily set up, upon first write).
  nsresult InitTemp();
  nsresult PerformAppend();
  void EnterErrorState(nsresult status);

  // The temporary file and stream we're writing to.
  nsCOMPtr<nsIFile> mTempFile;
  nsCOMPtr<nsIOutputStream> mTempStream;

  // The stream we'll be appending to if it all succeeds.
  nsCOMPtr<nsIOutputStream> mTarget;

  enum {
    eUninitialized,  // No temp file yet.
    eOpen,           // We're up and running.
    eClosed,         // The file has been closed.
    eError           // An error has occurred (stored in mError).
  } mState{eUninitialized};
  nsresult mError{NS_OK};
};

#endif  // nsQuarantinedOutputStream_h__
