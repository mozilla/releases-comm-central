#include "MailNewsTypes.h"
#include "msgCore.h"
#include "nsIInputStream.h"
#include "nsIInputStreamPump.h"
#include "nsIMsgPluggableStore.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "MboxMsgInputStream.h"
#include "MboxScanner.h"
#include "mozilla/Logging.h"
#include "mozilla/ScopeExit.h"

NS_IMPL_ISUPPORTS(MboxScanner, nsIStreamListener)

nsresult MboxScanner::BeginScan(nsIFile* mboxFile,
                                nsIStoreScanListener* scanListener) {
  MOZ_ASSERT(scanListener);
  MOZ_ASSERT(!mKungFuDeathGrip);
  MOZ_ASSERT(!mScanListener);
  nsresult rv;

  int64_t fileSize;
  rv = mboxFile->GetFileSize(&fileSize);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!fileSize) {
    // Dispatch the following calls to the main thread, because
    // according to the documentation of nsIMsgPluggableStore.asyncScan,
    // "No listener callbacks will be invoked before asyncScan() returns"
    nsCOMPtr<nsIStoreScanListener> refListener = scanListener;
    NS_DispatchToMainThread(
        NS_NewRunnableFunction("Notify scanListener", [refListener] {
          refListener->OnStartScan();
          refListener->OnStopScan(NS_OK);
        }));
    return NS_OK;
  }

  mScanListener = scanListener;

  // Open the raw mbox file for reading.
  nsCOMPtr<nsIInputStream> raw;
  rv = NS_NewLocalFileInputStream(getter_AddRefs(raw), mboxFile);
  NS_ENSURE_SUCCESS(rv, rv);

  // Start reading first message async.
  // Note: The pump doesn't close the stream when complete.
  // This is important because we want to use Continue() to move on to
  // the next message.
  RefPtr<MboxMsgInputStream> mboxStream = new MboxMsgInputStream(raw, 0);
  mMboxStream = mboxStream;
  nsCOMPtr<nsIInputStreamPump> pump;
  rv = NS_NewInputStreamPump(getter_AddRefs(pump), mboxStream.forget());

  NS_ENSURE_SUCCESS(rv, rv);
  mPump = pump;

  // Stream the first message asynchronously, using ourselves as listener.
  // Our OnStartRequest/OnDataAvailable/OnStopRequest handlers will sort
  // out streaming subsequent messages, and invoke the callbacks in the
  // nsIStoreScanListener we're feeding messages to.
  //
  // NOTE for future simplification: rather than streaming individual
  // messages via MboxMsgInputStream() here and chaining up subsequent
  // messages as we go, maybe it'd be simpler to just stream the entire
  // mbox in raw form?
  // Then, in our OnDataAvailable handler we could feed the data directly
  // into an MboxParser and drain it into the nsIStoreScanListener methods.
  // This would avoid the extra abstraction of MboxMsgInputStream.
  // To do that, MboxParser (currently internal to MboxMsgInputStream)
  // would have to be tidied up and made public.
  rv = mPump->AsyncRead(this);
  NS_ENSURE_SUCCESS(rv, rv);

  // We're up and running. Hold ourself in existence until scan is complete.
  mKungFuDeathGrip = this;
  return NS_OK;
}

NS_IMETHODIMP MboxScanner::OnStartRequest(nsIRequest* req) {
  nsresult rv;
  uint64_t msgOffset = mMboxStream->MsgOffset();
  if (msgOffset == 0) {
    rv = mScanListener->OnStartScan();
    if (NS_FAILED(rv)) {
      return rv;  // This will cancel the request.
    }

    if (mMboxStream->IsNullMessage()) {
      // Because we already checked for empty files earlier, the stream
      // contains invalid data.
      mMboxStream->Close();
      mMboxStream = nullptr;
      return NS_ERROR_FAILURE;
    }
  }

  nsAutoCString token;
  token.AppendInt(msgOffset);
  rv = mScanListener->OnStartMessage(token, mMboxStream->EnvAddr(),
                                     mMboxStream->EnvDate());
  if (NS_FAILED(rv)) {
    return rv;
  }

  return mScanListener->OnStartRequest(req);
}

NS_IMETHODIMP MboxScanner::OnDataAvailable(nsIRequest* req,
                                           nsIInputStream* stream,
                                           uint64_t offset, uint32_t count) {
  if (!mMboxStream) {
    // It was an empty mbox, so don't call scanlistener.
    return NS_OK;
  }
  return mScanListener->OnDataAvailable(req, stream, offset, count);
}

NS_IMETHODIMP MboxScanner::OnStopRequest(nsIRequest* req, nsresult status) {
  if (mMboxStream) {
    nsresult rv = mScanListener->OnStopRequest(req, status);
    if (NS_SUCCEEDED(status) && NS_FAILED(rv)) {
      status = rv;  // Listener requested abort.
    }

    bool more = false;
    if (NS_SUCCEEDED(status)) {
      // Kick off the next message, if any.
      nsresult rv = mMboxStream->Continue(more);
      if (NS_SUCCEEDED(rv) && more) {
        RefPtr<MboxMsgInputStream> stream = mMboxStream;
        nsresult rv =
            NS_NewInputStreamPump(getter_AddRefs(mPump), stream.forget());
        if (NS_SUCCEEDED(rv)) {
          rv = mPump->AsyncRead(this);
        }
      }
      if (NS_FAILED(rv)) {
        // Stop here, and make sure OnStopScan() hears about the fail.
        more = false;
        status = rv;
      }
    }

    // If we're not starting a new message, close the mbox.
    if (!more) {
      mMboxStream->Close();
      mMboxStream = nullptr;
    }
  }

  // If we're not starting another message, we're done!
  // `status` indicates if the operation as a whole finished or failed.
  if (!mMboxStream) {
    // Tell the listener the overall operation is now done.
    mScanListener->OnStopScan(status);
    // Time to evaporate.
    mKungFuDeathGrip = nullptr;
  }
  return NS_OK;
}
