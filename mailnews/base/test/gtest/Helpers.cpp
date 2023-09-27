/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "Helpers.h"
#include "gtest/gtest.h"
#include "nsStringStream.h"
#include "nsISeekableStream.h"
#include "nsString.h"
#include "MboxMsgInputStream.h"
#include "mozilla/Buffer.h"

namespace testing {

void ExtractFromMbox(nsACString const& mbox, nsTArray<nsCString>& msgs,
                     size_t readSize) {
  // Open stream for raw mbox.
  nsCOMPtr<nsIInputStream> raw;
  nsresult rv = NS_NewByteInputStream(getter_AddRefs(raw), mozilla::Span(mbox),
                                      NS_ASSIGNMENT_COPY);
  ASSERT_TRUE(NS_SUCCEEDED(rv));

  msgs.Clear();
  // Wrap with MboxMsgInputStream and read single message.
  RefPtr<MboxMsgInputStream> rdr = new MboxMsgInputStream(raw);

  while (true) {
    nsAutoCString got;
    rv = Slurp(rdr, readSize, got);
    ASSERT_TRUE(NS_SUCCEEDED(rv));
    // Corner case: suppress dud message for empty mbox file.
    if (!rdr->IsNullMessage()) {
      msgs.AppendElement(got);
    }
    // Try and reuse the MboxMsgInputStream for the next message.
    bool more;
    rv = rdr->Continue(more);
    ASSERT_TRUE(NS_SUCCEEDED(rv));
    if (!more) {
      break;
    }
  }
}

// Read all the data out of a stream into a string, reading readSize
// bytes at a time.
nsresult Slurp(nsIInputStream* src, size_t readSize, nsACString& out) {
  mozilla::Buffer<char> readbuf(readSize);
  out.Truncate();
  while (true) {
    uint32_t n;
    nsresult rv = src->Read(readbuf.Elements(), readbuf.Length(), &n);
    NS_ENSURE_SUCCESS(rv, rv);
    if (n == 0) {
      break;  // EOF.
    }
    out.Append(readbuf.Elements(), n);
  }
  return NS_OK;
}

NS_IMPL_ISUPPORTS(CaptureStream, nsIOutputStream);

NS_IMETHODIMP CaptureStream::Close() { return NS_OK; }

NS_IMETHODIMP CaptureStream::Flush() { return NS_OK; }

NS_IMETHODIMP CaptureStream::StreamStatus() { return NS_OK; }

NS_IMETHODIMP CaptureStream::Write(const char* buf, uint32_t count,
                                   uint32_t* bytesWritten) {
  mData.Append(buf, count);
  *bytesWritten = count;
  return NS_OK;
}

NS_IMETHODIMP CaptureStream::WriteFrom(nsIInputStream* fromStream,
                                       uint32_t count, uint32_t* bytesWritten) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP CaptureStream::WriteSegments(nsReadSegmentFun reader,
                                           void* closure, uint32_t count,
                                           uint32_t* bytesWritten) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP CaptureStream::IsNonBlocking(bool* nonBlocking) {
  *nonBlocking = false;
  return NS_OK;
}

}  // namespace testing
