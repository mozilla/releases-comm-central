/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_TEST_GTEST_HELPERS_H_
#define COMM_MAILNEWS_BASE_TEST_GTEST_HELPERS_H_

#include "nsIOutputStream.h"
#include "nsISeekableStream.h"
#include "nsString.h"
#include <algorithm>

class nsIInputStream;

namespace testing {

/**
 * ExtractFromMbox() takes mbox data (as a string) and parses it using
 * MboxMsgInputStream, returning the individual messages via the `msgs`
 * array.
 * `readSize` is the buffer size used for reads. The idea is that
 * parsing code like MboxMsgInputStream might have little biases which
 * produce bad results at different read sizes, so this can be used to
 * shake it out by asking for, say, a single byte at a time.
 */
void ExtractFromMbox(nsACString const& mbox, nsTArray<nsCString>& msgs,
                     size_t readSize = 4096);

/**
 * Slurp just reads the src stream until EOF, returning the data in
 * `out`.
 * `readSize` is the buffer size passed to the stream Read() function,
 */
nsresult Slurp(nsIInputStream* src, size_t readSize, nsACString& out);

/**
 * CaptureStream is a helper class, an output stream which just stashes
 * everything written to it into a string.
 *
 * NOTE: for inputstream equivalent, see NS_NewCStringInputStream().
 */
class CaptureStream : public nsIOutputStream, nsISeekableStream {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIOUTPUTSTREAM
  NS_DECL_NSISEEKABLESTREAM
  NS_DECL_NSITELLABLESTREAM

  // Access the captured data.
  nsCString const& Data() const { return mData; }

 private:
  virtual ~CaptureStream() = default;
  nsCString mData;
  int64_t mPos{0};
};

}  // namespace testing

#endif  // COMM_MAILNEWS_BASE_TEST_GTEST_HELPERS_H_
