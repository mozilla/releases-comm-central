/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "MailStream.h"

#include "HeaderReader.h"
#include "nsStreamUtils.h"

NS_IMPL_ADDREF(MailStream)
NS_IMPL_RELEASE(MailStream)

NS_INTERFACE_MAP_BEGIN(MailStream)
  NS_INTERFACE_MAP_ENTRY(nsISupports)
  NS_INTERFACE_MAP_ENTRY(nsIInputStream)
NS_INTERFACE_MAP_END

MailStream::MailStream(nsIInputStream* realStream) : mStream(realStream) {}

// A return of NS_OK guarantees two things:
// 1. The entire header is in the mBuffer.
// 2. mGotHeader is true.
nsresult MailStream::EnsureHeaderInBuffer() {
  NS_ENSURE_TRUE(mStream, NS_ERROR_NOT_INITIALIZED);

  mozilla::RecursiveMutexAutoLock lock(mBufferMutex);

  // We loop until we either get the whole header or hit an error.
  while (!mGotHeader) {
    size_t pos = mBuffer.length();
    if (!mBuffer.growBy(kChunkSize)) {
      return NS_ERROR_OUT_OF_MEMORY;
    }

    uint32_t bytesRead;
    MOZ_TRY(mStream->Read(&mBuffer[pos], kChunkSize, &bytesRead));
    // Trim unused buffer (leaving buffer capacity unchanged).
    if (!mBuffer.resize(pos + bytesRead)) {
      return NS_ERROR_UNEXPECTED;
    }

    // EOF without seeing the end of the header?
    if (bytesRead == 0) {
      return NS_ERROR_UNEXPECTED;
    }

    // Exceeded sensible header block size?
    if (mBuffer.length() > kMaxHeaderSize) {
      return NS_ERROR_UNEXPECTED;
    }

    // Look for the blank separator line.
    mozilla::Span<const char> unprocessed(mBuffer.begin() + mHeaderSize,
                                          mBuffer.end());
    while (!unprocessed.empty()) {
      auto line = FirstLine(unprocessed);
      unprocessed = unprocessed.From(line.Length());
      if (line.IsEmpty()) {
        break;  // Incomplete line - need more data.
      }
      mHeaderSize += line.Length();  // Include line in the header.
      // Accept CRLF or just bare LF line endings.
      if (line[0] == '\n' ||
          (line.Length() == 2 && line[0] == '\r' && line[1] == '\n')) {
        // It's the blank line - we're done!
        mGotHeader = true;
        break;
      }
    }
  }

  MOZ_ASSERT(mGotHeader);
  return NS_OK;
}

mozilla::Result<mozilla::Span<const char>, nsresult> MailStream::HeaderBlock() {
  mozilla::RecursiveMutexAutoLock lock(mBufferMutex);
  MOZ_TRY(EnsureHeaderInBuffer());
  MOZ_ASSERT(mGotHeader);
  return mozilla::Span<const char>(mBuffer.begin(), mHeaderSize);
}

NS_IMETHODIMP MailStream::Close() {
  nsresult rv = NS_OK;
  if (mStream) {
    rv = mStream->Close();
  }
  mStream = nullptr;
  return rv;
}

NS_IMETHODIMP
MailStream::Available(uint64_t* result) {
  *result = 0;
  if (!mStream) {
    return NS_BASE_STREAM_CLOSED;
  }

  MOZ_TRY(EnsureHeaderInBuffer());

  uint64_t underlying;
  MOZ_TRY(mStream->Available(&underlying));

  mozilla::RecursiveMutexAutoLock lock(mBufferMutex);
  if (mCursor >= mBuffer.length()) {
    *result = underlying;
  } else {
    *result = (mBuffer.length() - mCursor) + underlying;
  }
  return NS_OK;
}

NS_IMETHODIMP
MailStream::StreamStatus() {
  if (!mStream) {
    return NS_BASE_STREAM_CLOSED;
  }
  MOZ_TRY(EnsureHeaderInBuffer());
  mozilla::RecursiveMutexAutoLock lock(mBufferMutex);
  if (mCursor < mBuffer.length()) {
    return NS_OK;
  }
  return mStream->StreamStatus();
}

NS_IMETHODIMP
MailStream::Read(char* buf, uint32_t count, uint32_t* result) {
  *result = 0;
  if (!mStream) {
    return NS_OK;
  }
  MOZ_TRY(EnsureHeaderInBuffer());
  mozilla::RecursiveMutexAutoLock lock(mBufferMutex);
  if (mCursor < mBuffer.length()) {
    // we can serve some data from the buffer.
    uint32_t avail = (uint32_t)mBuffer.length() - mCursor;
    uint32_t n = std::min(count, avail);
    memcpy(buf, &mBuffer[0] + mCursor, n);
    *result += n;
    mCursor += n;
    buf += n;
    count -= n;
  }
  if (count > 0) {
    uint32_t n;
    MOZ_TRY(mStream->Read(buf, count, &n));
    *result += n;
  }
  return NS_OK;
}

NS_IMETHODIMP
MailStream::ReadSegments(nsWriteSegmentFun writer, void* closure,
                         uint32_t count, uint32_t* result) {
  // In theory we could implement this while theres mBuffer-resident data
  // to serve, but it's not clear if yanking away ReadSegments() support
  // mid-operation is frowned upon or not, so let's just keep things simple.
  *result = 0;
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP
MailStream::IsNonBlocking(bool* nonBlocking) {
  NS_ENSURE_STATE(mStream);
  return mStream->IsNonBlocking(nonBlocking);
}
