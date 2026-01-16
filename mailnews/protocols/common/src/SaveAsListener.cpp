/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "SaveAsListener.h"

#include "nsIInputStream.h"

NS_IMPL_ISUPPORTS(SaveAsListener, nsIStreamListener, nsIRequestObserver)

NS_IMETHODIMP SaveAsListener::OnStartRequest(nsIRequest* request) {
  if (mUrlListener) {
    // If we have a URL listener we must have a URI too (there's an assertion
    // for this in this class's constructor).
    mUrlListener->OnStartRunningUrl(mUri);
  }

  return NS_OK;
}

NS_IMETHODIMP
SaveAsListener::OnStopRequest(nsIRequest* request, nsresult aStatus) {
  if (mOutputStream) {
    mOutputStream->Flush();
    mOutputStream->Close();
  }

  if (mUrlListener) {
    // If we have a URL listener we must have a URI too (there's an assertion
    // for this in this class's constructor).
    mUrlListener->OnStopRunningUrl(mUri, aStatus);
  }

  return NS_OK;
}

NS_IMETHODIMP SaveAsListener::OnDataAvailable(nsIRequest* request,
                                              nsIInputStream* inStream,
                                              uint64_t srcOffset,
                                              uint32_t count) {
  nsresult rv;
  uint64_t available;
  rv = inStream->Available(&available);
  if (!mWrittenData) {
    mWrittenData = true;
    rv = SetupMsgOutputStream();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  const char* lineEnding = (mUseCanonicalLineEnding) ? CRLF : MSG_LINEBREAK;
  uint32_t lineEndingLength = (mUseCanonicalLineEnding) ? 2 : MSG_LINEBREAK_LEN;

  uint32_t readCount, maxReadCount = kDataBufferSize - mLeftOver;
  uint32_t writeCount;
  char *start, *end, lastCharInPrevBuf = '\0';
  uint32_t linebreak_len = 0;

  while (count > 0) {
    if (count < maxReadCount) maxReadCount = count;
    rv = inStream->Read(mDataBuffer + mLeftOver, maxReadCount, &readCount);
    if (NS_FAILED(rv)) return rv;

    mLeftOver += readCount;
    mDataBuffer[mLeftOver] = '\0';

    start = mDataBuffer;
    // make sure we don't insert another LF, accidentally, by ignoring
    // second half of CRLF spanning blocks.
    if (lastCharInPrevBuf == '\r' && *start == '\n') start++;

    end = PL_strpbrk(start, "\r\n");
    if (end) linebreak_len = (end[0] == '\r' && end[1] == '\n') ? 2 : 1;

    count -= readCount;
    maxReadCount = kDataBufferSize - mLeftOver;

    if (!end && count > maxReadCount) {
      // must be a very very long line; sorry cannot handle it
      return NS_ERROR_FAILURE;
    }

    while (start && end) {
      if (mOutputStream && PL_strncasecmp(start, "X-Mozilla-Status:", 17) &&
          PL_strncasecmp(start, "X-Mozilla-Status2:", 18) &&
          PL_strncmp(start, "From - ", 7)) {
        rv = mOutputStream->Write(start, end - start, &writeCount);
        nsresult tmp =
            mOutputStream->Write(lineEnding, lineEndingLength, &writeCount);
        if (NS_FAILED(tmp)) {
          rv = tmp;
        }
      }
      start = end + linebreak_len;
      if (start >= mDataBuffer + mLeftOver) {
        maxReadCount = kDataBufferSize;
        mLeftOver = 0;
        break;
      }
      end = PL_strpbrk(start, "\r\n");
      if (end) linebreak_len = (end[0] == '\r' && end[1] == '\n') ? 2 : 1;
      if (start && !end) {
        mLeftOver -= (start - mDataBuffer);
        memcpy(mDataBuffer, start,
               mLeftOver + 1);  // including null
        maxReadCount = kDataBufferSize - mLeftOver;
      }
    }
    if (NS_FAILED(rv)) return rv;
    if (end) lastCharInPrevBuf = *end;
  }

  return rv;
}

nsresult SaveAsListener::SetupMsgOutputStream() {
  // If the file already exists, delete it, but do this before getting the
  // outputstream.
  // Due to bug 328027, the `nsSaveMsgListener` created in `nsMessenger::SaveAs`
  // now opens the stream on the nsIFile object, thus creating an empty file.
  // Actual save operations for IMAP, EWS and NNTP use this `SaveAsListener`
  // here, though, so we have to close the stream before deleting the file, else
  // data would still be written happily into a now non-existing file. (Windows
  // doesn't care, btw, just unixoids do...)
  mOutputFile->Remove(false);

  nsresult rv = MsgNewBufferedFileOutputStream(getter_AddRefs(mOutputStream),
                                               mOutputFile, -1, 0666);
  NS_ENSURE_SUCCESS(rv, rv);

  if (mOutputStream && mAddDummyEnvelope) {
    nsAutoCString result;
    uint32_t writeCount;

    time_t now = time((time_t*)0);
    char* ct = ctime(&now);
    // Remove the ending new-line character.
    ct[24] = '\0';
    result = "From - ";
    result += ct;
    result += MSG_LINEBREAK;
    mOutputStream->Write(result.get(), result.Length(), &writeCount);

    result = "X-Mozilla-Status: 0001";
    result += MSG_LINEBREAK;
    result += "X-Mozilla-Status2: 00000000";
    result += MSG_LINEBREAK;
    mOutputStream->Write(result.get(), result.Length(), &writeCount);
  }

  return rv;
}
