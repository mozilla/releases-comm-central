/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsQuarantinedOutputStream.h"
#include "nsDirectoryServiceDefs.h"
#include "nsIInputStream.h"
#include "nsISeekableStream.h"
#include "nsIFile.h"
#include "nsNetUtil.h"
#include "mozilla/UniquePtr.h"

NS_IMPL_ISUPPORTS(nsQuarantinedOutputStream, nsIOutputStream,
                  nsISafeOutputStream)

nsQuarantinedOutputStream::~nsQuarantinedOutputStream() { Close(); }

// Initialise mTempFile and open it for writing (mTempStream).
nsresult nsQuarantinedOutputStream::InitTemp() {
  MOZ_ASSERT(mState == eUninitialized);
  MOZ_ASSERT(!mTempFile);
  MOZ_ASSERT(!mTempStream);
  // Create a unique temp file.
  {
    nsCOMPtr<nsIFile> file;
    nsresult rv = NS_GetSpecialDirectory(NS_OS_TEMP_DIR, getter_AddRefs(file));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = file->Append(u"newmsg"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = file->CreateUnique(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
    mTempFile = std::move(file);
  }

  // Open the temp file for writing.
  {
    nsCOMPtr<nsIOutputStream> stream;
    nsresult rv = NS_NewLocalFileOutputStream(getter_AddRefs(stream), mTempFile,
                                              -1, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
    mTempStream = std::move(stream);
  }

  return NS_OK;
}

// Put us into the error state and clean up (by deleting the temp file
// if it exists).
void nsQuarantinedOutputStream::EnterErrorState(nsresult status) {
  mState = eError;
  mError = status;
  mTarget = nullptr;

  if (mTempStream) {
    mTempStream = nullptr;
  }
  if (mTempFile) {
    mTempFile->Remove(false);
    mTempFile = nullptr;
  }
}

// copyStream copies all the data in the input stream to the output stream.
// It keeps going until it sees an EOF on the input.
static nsresult copyStream(nsIInputStream* in, nsIOutputStream* out) {
  constexpr uint32_t BUFSIZE = 8192;
  auto buf = mozilla::MakeUnique<char[]>(BUFSIZE);
  while (true) {
    // Read input stream into buf.
    uint32_t bufCnt;
    nsresult rv = in->Read(buf.get(), BUFSIZE, &bufCnt);
    NS_ENSURE_SUCCESS(rv, rv);
    if (bufCnt == 0) {
      break;  // EOF. We're all done!
    }
    // Write buf to output stream.
    uint32_t pos = 0;
    while (pos < bufCnt) {
      uint32_t writeCnt;
      rv = out->Write(buf.get() + pos, bufCnt - pos, &writeCnt);
      NS_ENSURE_SUCCESS(rv, rv);
      pos += writeCnt;
    }
  }
  return NS_OK;
}

// copyStreamSafely() wraps copyStream(). If the output stream is seekable,
// it will try to roll it back if an error occurs during the copy.
static nsresult copyStreamSafely(nsIInputStream* in, nsIOutputStream* out) {
  nsCOMPtr<nsISeekableStream> outSeekable = do_QueryInterface(out);
  if (!outSeekable) {
    // It's not seekable, so we jump out without a parachute.
    return copyStream(in, out);
  }
  int64_t initialOffset;
  nsresult rv = outSeekable->Tell(&initialOffset);
  NS_ENSURE_SUCCESS(rv, rv);
  rv = copyStream(in, out);
  if (NS_FAILED(rv)) {
    // Uhoh... the copy failed! Try to remove the partially-written data.
    rv = outSeekable->Seek(nsISeekableStream::NS_SEEK_SET, initialOffset);
    NS_ENSURE_SUCCESS(rv, rv);
    rv = outSeekable->SetEOF();
    NS_ENSURE_SUCCESS(rv, rv);
  }
  return NS_OK;
}

NS_IMETHODIMP nsQuarantinedOutputStream::Close() {
  if (mState != eOpen) {
    // Already failed or closed or no data written. That's OK.
    return NS_OK;
  }
  nsresult rv = NS_OK;
  if (mTempStream) {
    rv = mTempStream->Close();
    mTempStream = nullptr;
  }
  if (mTempFile) {
    mTempFile->Remove(false);
    mTempFile = nullptr;
  }
  mTarget->Close();
  mTarget = nullptr;
  mState = eClosed;
  return rv;
}

NS_IMETHODIMP nsQuarantinedOutputStream::Finish() {
  // Fail here if there was a previous error.
  if (mState == eError) {
    return mError;
  }
  if (mState != eOpen) {
    // Already closed or no data written. That's OK.
    return NS_OK;
  }

  // Flush and close the temp file. Hopefully any virus checker will now act
  // and prevent us reopening any suspicious-looking file.
  MOZ_ASSERT(mTempStream);
  MOZ_ASSERT(mTempFile);
  mTempStream->Flush();
  nsresult rv = mTempStream->Close();
  if (NS_FAILED(rv)) {
    EnterErrorState(rv);
    return rv;
  }
  mTempStream = nullptr;

  // Write the tempfile out to the target stream
  {
    nsCOMPtr<nsIInputStream> ins;
    // If a virus checker smells something bad, it should show up here as a
    // failure to (re)open the temp file.
    rv = NS_NewLocalFileInputStream(getter_AddRefs(ins), mTempFile);
    if (NS_FAILED(rv)) {
      EnterErrorState(rv);
      return rv;
    }
    rv = copyStreamSafely(ins, mTarget);
    if (NS_FAILED(rv)) {
      EnterErrorState(rv);
      return rv;
    }
  }

  // All done!
  {
    nsCOMPtr<nsISafeOutputStream> safe = do_QueryInterface(mTarget);
    if (safe) {
      safe->Finish();
    } else {
      mTarget->Close();
    }
    mTarget = nullptr;
  }

  mTempFile->Remove(false);
  mTempFile = nullptr;
  mState = eClosed;
  return NS_OK;
}

NS_IMETHODIMP nsQuarantinedOutputStream::Flush() {
  if (mState != eOpen) {
    return NS_OK;  // Don't rock the boat.
  }
  nsresult rv = mTempStream->Flush();
  if (NS_FAILED(rv)) {
    EnterErrorState(rv);
  }
  return rv;
}

NS_IMETHODIMP nsQuarantinedOutputStream::Write(const char* buf, uint32_t count,
                                               uint32_t* result) {
  if (mState == eUninitialized) {
    // Lazy open.
    nsresult rv = InitTemp();
    if NS_FAILED (rv) {
      EnterErrorState(rv);
      return rv;
    }
    mState = eOpen;
  }

  if (mState != eOpen) {
    return NS_ERROR_UNEXPECTED;
  }

  nsresult rv = mTempStream->Write(buf, count, result);
  if (NS_FAILED(rv)) {
    EnterErrorState(rv);
    return rv;
  }
  return NS_OK;
}

NS_IMETHODIMP nsQuarantinedOutputStream::WriteFrom(nsIInputStream* fromStream,
                                                   uint32_t count,
                                                   uint32_t* retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsQuarantinedOutputStream::WriteSegments(nsReadSegmentFun reader,
                                                       void* closure,
                                                       uint32_t count,
                                                       uint32_t* retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP nsQuarantinedOutputStream::IsNonBlocking(bool* nonBlocking) {
  *nonBlocking = false;
  return NS_OK;
}

NS_IMETHODIMP nsQuarantinedOutputStream::StreamStatus() {
  return mState == eOpen ? NS_OK : NS_BASE_STREAM_CLOSED;
}
