/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "msgCore.h"
#include "nsIMsgFolder.h"
#include "nsIFile.h"
#include "nsNetUtil.h"
#include "nsMsgUtils.h"
#include "nsMsgLocalFolderHdrs.h"  // For X_MOZILLA_KEYWORDS_BLANK_LEN.
#include "nsMailHeaders.h"
#include "HeaderReader.h"
#include "MboxCompactor.h"
#include "MboxMsgOutputStream.h"
#include "mozilla/glean/CommMailMetrics.h"
#include "mozilla/Buffer.h"
#include "mozilla/Logging.h"
#include "mozilla/ScopeExit.h"

extern mozilla::LazyLogModule gMboxLog;
using mozilla::LogLevel;

NS_IMPL_ISUPPORTS(MboxCompactor, nsIStoreScanListener);

nsresult MboxCompactor::BeginCompaction() {
  MOZ_ASSERT(mFolder);

  nsresult rv = mFolder->GetFilePath(getter_AddRefs(mMboxPath));
  NS_ENSURE_SUCCESS(rv, rv);

  MOZ_LOG(gMboxLog, LogLevel::Info,
          ("Begin compacting '%s'.", mMboxPath->HumanReadablePath().get()));
  bool exists;
  rv = mMboxPath->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) {
    // Cheesy hack - create empty mbox file if it doesn't exist.
    // This can happen in a few circumstances - e.g. IMAP folders without
    // offline storage obviously have no messages in their local mbox file.
    // It's valid having an empty mbox file, and cleaner to let the normal
    // flow of code invoke the listener begin/complete callbacks rather than
    // returning early and invoking them explicitly here.
    rv = mMboxPath->Create(nsIFile::NORMAL_FILE_TYPE, 0600);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  rv = mMboxPath->GetFileSize(&mOriginalMboxFileSize);
  NS_ENSURE_SUCCESS(rv, rv);

  // Create output stream for our dest mbox.
  rv = NS_NewSafeLocalFileOutputStream(getter_AddRefs(mDestStream), mMboxPath,
                                       -1, 00600);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgPluggableStore> msgStore;
  rv = mFolder->GetMsgStore(getter_AddRefs(msgStore));
  NS_ENSURE_SUCCESS(rv, rv);

  // Start iterating over all the messages!
  // The scan will hold a reference to us until it's completed, so
  // no kingfudeathgrippery required here.
  rv = msgStore->AsyncScan(mFolder, this);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

// nsIStoreScanListener callback called when the scan starts.
NS_IMETHODIMP MboxCompactor::OnStartScan() {
  return mCompactListener->OnCompactionBegin();
}

// nsIStoreScanListener callback called at the start of each message.
NS_IMETHODIMP MboxCompactor::OnStartMessage(nsACString const& storeToken,
                                            nsACString const& envAddr,
                                            PRTime envDate) {
  MOZ_ASSERT(mCurToken.IsEmpty());  // We should _not_ be processing a msg yet!

  // Ask compactListener if we should keep this message.
  bool keepMsg;
  nsresult rv = mCompactListener->OnRetentionQuery(storeToken, &mMsgFlags,
                                                   mMsgKeywords, &keepMsg);
  if (NS_FAILED(rv)) {
    return rv;  // Abort the scan.
  }

  mCurToken = storeToken;
  mNewMsgSize = 0;
  mBufferCount = 0;
  if (keepMsg) {
    // Open mMsgOut to write a single message.
    MOZ_ASSERT(mDestStream);
    MOZ_ASSERT(!mMsgOut);
    mMsgOut = new MboxMsgOutputStream(mDestStream, false);
    // Preserve metadata on the "From " line.
    mMsgOut->SetEnvelopeDetails(envAddr, envDate);
  }

  return NS_OK;
}

// nsIStoreScanListener callback, called after OnStartMessage().
NS_IMETHODIMP MboxCompactor::OnStartRequest(nsIRequest* req) {
  // We've already set up everything in OnStartMessage().
  return NS_OK;
}

// Helper to drain count number of bytes from stream.
static nsresult readAndDiscard(nsIInputStream* stream, uint32_t count) {
  char buf[FILE_IO_BUFFER_SIZE];
  while (count > 0) {
    uint32_t ask = std::min((uint32_t)FILE_IO_BUFFER_SIZE, count);
    uint32_t got;
    nsresult rv = stream->Read(buf, ask, &got);
    NS_ENSURE_SUCCESS(rv, rv);
    count -= got;
  }
  return NS_OK;
}

// Helper to write data to an outputstream, until complete or error.
static nsresult writeSpan(nsIOutputStream* writeable,
                          mozilla::Span<const char> data) {
  while (!data.IsEmpty()) {
    uint32_t n;
    nsresult rv = writeable->Write(data.Elements(), data.Length(), &n);
    NS_ENSURE_SUCCESS(rv, rv);
    data = data.Last(data.Length() - n);
  }
  return NS_OK;
}

// nsIStoreScanListener callback to deliver a chunk of the current message.
NS_IMETHODIMP MboxCompactor::OnDataAvailable(nsIRequest* req,
                                             nsIInputStream* stream,
                                             uint64_t offset, uint32_t count) {
  if (!mMsgOut) {
    // We're discarding this message.
    return readAndDiscard(stream, count);
  }

  // While there is still data available...
  while (count > 0) {
    uint32_t maxReadCount =
        std::min((uint32_t)(mBuffer.Length() - mBufferCount), count);
    uint32_t readCount;
    nsresult rv = stream->Read(mBuffer.Elements() + mBufferCount, maxReadCount,
                               &readCount);
    NS_ENSURE_SUCCESS(rv, rv);

    count -= readCount;
    mBufferCount += readCount;
    if (mBufferCount == mBuffer.Length()) {
      // Buffer is full.
      rv = FlushBuffer();
      NS_ENSURE_SUCCESS(rv, rv);
      MOZ_ASSERT(mBufferCount == 0);  // Buffer is now empty.
    }
  }
  return NS_OK;
}

// nsIStoreScanListener callback called at end of each message.
NS_IMETHODIMP MboxCompactor::OnStopRequest(nsIRequest* req, nsresult status) {
  auto cleanup = mozilla::MakeScopeExit([&] {
    if (mMsgOut) {
      mMsgOut->Close();
      mMsgOut = nullptr;
    }
    mCurToken.Truncate();
    mMsgFlags = 0;
    mMsgKeywords.Truncate();
  });

  if (mMsgOut && NS_SUCCEEDED(status)) {
    // Write out any leftover data.
    nsresult rv = FlushBuffer();
    NS_ENSURE_SUCCESS(rv, rv);

    int64_t msgStart = mMsgOut->StartPos();
    rv = mMsgOut->Finish();  // Commit.
    NS_ENSURE_SUCCESS(rv, rv);
    MOZ_ASSERT(msgStart >= 0);
    // tell the listener
    nsCString newToken = nsPrintfCString("%" PRId64, msgStart);
    rv = mCompactListener->OnMessageRetained(mCurToken, newToken, mNewMsgSize);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

// nsIStoreScanListener callback called when the scan completes.
NS_IMETHODIMP MboxCompactor::OnStopScan(nsresult status) {
  nsresult rv = status;

  MOZ_LOG(gMboxLog, LogLevel::Info,
          ("Finished compacting '%s' status=0x%x.",
           mMboxPath->HumanReadablePath().get(), (uint32_t)status));
  if (NS_SUCCEEDED(rv)) {
    nsCOMPtr<nsISafeOutputStream> safe = do_QueryInterface(mDestStream, &rv);
    if (NS_SUCCEEDED(rv)) {
      rv = safe->Finish();
    } else {
      // How did we get here? This should never happen.
      rv = mDestStream->Close();
    }
  } else if (mDestStream) {
    mDestStream->Close();  // Clean up temporary file.
  }

  int64_t finalSize = 0;
  if (NS_SUCCEEDED(rv)) {
    // nsIFile.fileSize is cached on Windows, but this cache is not correctly
    // invalidated after write (Bug 1022704).
    // So clone it before reading the size again.
    // This dirties the cached values, forcing it to actually ask the
    // filesystem again (see Bug 307815, Bug 456603).
    nsCOMPtr<nsIFile> path;
    rv = mMboxPath->Clone(getter_AddRefs(path));
    if (NS_SUCCEEDED(rv)) {
      rv = path->GetFileSize(&finalSize);
    }
  }

  mCompactListener->OnCompactionComplete(rv, mOriginalMboxFileSize, finalSize);
  return NS_OK;
}

// Flush out the message data held in mBuffer/mBufferCount.
// Also handles on-the-fly patching of X-Mozilla-Headers if that was requested.
// If this succeeds, the buffer will be empty upon return.
nsresult MboxCompactor::FlushBuffer() {
  MOZ_ASSERT(mMsgOut);  // Shouldn't get here if we're skipping msg!
  nsresult rv;
  auto buf = mBuffer.AsSpan().First(mBufferCount);
  // Only do X-Mozilla-* patching for the first chunk, and only if patching
  // has been requested.
  if (mNewMsgSize > 0 || !mPatchXMozillaHeaders) {
    // Just output the buffer verbatim.
    rv = writeSpan(mMsgOut, buf);
    NS_ENSURE_SUCCESS(rv, rv);
    mNewMsgSize += buf.Length();
    mBufferCount = 0;
    return NS_OK;
  }

  // This is the first chunk of a new message and we want to update the
  // X-Mozilla-(Status|Status2|Keys) headers as we go.

  // Sniff for CRs to decide what kind of EOL is in use.
  auto cr = std::find(buf.cbegin(), buf.cend(), '\r');
  nsAutoCString eolSeq;
  if (cr == buf.cend()) {
    eolSeq.Assign("\n"_ns);  // No CR found.
  } else {
    eolSeq.Assign("\r\n"_ns);
  }

  // Read as many headers as we can. We might not have the complete header
  // block our in buffer, but that's OK - the X-Mozilla-* ones should be
  // right at the start).
  nsTArray<HeaderReader::Hdr> headers;
  HeaderReader rdr;
  auto leftover = rdr.Parse(buf, [&](auto const& hdr) -> bool {
    auto const& name = hdr.Name(buf);
    if (!name.EqualsLiteral(HEADER_X_MOZILLA_STATUS) &&
        !name.EqualsLiteral(HEADER_X_MOZILLA_STATUS2) &&
        !name.EqualsLiteral(HEADER_X_MOZILLA_KEYWORDS)) {
      headers.AppendElement(hdr);
    }
    return true;
  });

  // Write out X-Mozilla-* headers first - we'll create these from scratch.
  auto out =
      nsPrintfCString(HEADER_X_MOZILLA_STATUS ": %4.4x", mMsgFlags & 0xFFFF);
  out.Append(eolSeq);
  rv = writeSpan(mMsgOut, out);
  NS_ENSURE_SUCCESS(rv, rv);
  mNewMsgSize += out.Length();

  out = nsPrintfCString(HEADER_X_MOZILLA_STATUS2 ": %8.8x",
                        mMsgFlags & 0xFFFF0000);
  out.Append(eolSeq);
  rv = writeSpan(mMsgOut, out);
  NS_ENSURE_SUCCESS(rv, rv);
  mNewMsgSize += out.Length();

  // The X-Mozilla-Keys header is dynamically modified as users tag/untag
  // messages, so aim to leave some space for in-place edits.
  out = nsPrintfCString(HEADER_X_MOZILLA_KEYWORDS ": %-*s",
                        X_MOZILLA_KEYWORDS_BLANK_LEN, mMsgKeywords.get());
  out.Append(eolSeq);
  rv = writeSpan(mMsgOut, out);
  NS_ENSURE_SUCCESS(rv, rv);
  mNewMsgSize += out.Length();

  // Write out the rest of the headers.
  for (auto const& hdr : headers) {
    auto h = buf.Subspan(hdr.pos, hdr.len);
    rv = writeSpan(mMsgOut, h);
    NS_ENSURE_SUCCESS(rv, rv);
    mNewMsgSize += h.Length();
  }

  // The header parser consumes the blank line. If we've completed parsing
  // we need to output it now.
  // If we haven't parsed all the headers yet, then the blank line will be
  // safely copied verbatim as part of the remaining data.
  if (rdr.IsComplete()) {
    rv = writeSpan(mMsgOut, eolSeq);
    NS_ENSURE_SUCCESS(rv, rv);
    mNewMsgSize += eolSeq.Length();
  }

  // Write out everything else in the buffer verbatim.
  if (leftover.Length() > 0) {
    rv = writeSpan(mMsgOut, leftover);
    NS_ENSURE_SUCCESS(rv, rv);
    mNewMsgSize += leftover.Length();
  }
  mBufferCount = 0;
  return NS_OK;
}
