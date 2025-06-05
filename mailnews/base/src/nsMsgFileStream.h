/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGFILESTREAM_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGFILESTREAM_H_

#include "nsIInputStream.h"
#include "nsIOutputStream.h"
#include "nsISeekableStream.h"
#include "prio.h"

class nsMsgFileStream final : public nsIInputStream,
                              public nsIOutputStream,
                              public nsISeekableStream {
 public:
  nsMsgFileStream();

  NS_DECL_ISUPPORTS

  NS_IMETHOD Available(uint64_t* _retval) override;
  NS_IMETHOD Read(char* aBuf, uint32_t aCount, uint32_t* _retval) override;
  NS_IMETHOD ReadSegments(nsWriteSegmentFun aWriter, void* aClosure,
                          uint32_t aCount, uint32_t* _retval) override;
  NS_DECL_NSIOUTPUTSTREAM
  NS_DECL_NSISEEKABLESTREAM
  NS_DECL_NSITELLABLESTREAM

  nsresult InitWithFile(nsIFile* localFile);

 protected:
  ~nsMsgFileStream();

  PRFileDesc* mFileDesc;
  bool mSeekedToEnd;
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGFILESTREAM_H_
