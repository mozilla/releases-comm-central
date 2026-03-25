/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMessageCopyHandler.h"

#include "CopyMessageStreamListener.h"
#include "EwsListeners.h"
#include "ExchangeMessageCreate.h"
#include "nsIInputStream.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgFolderNotificationService.h"
#include "nsIMsgMessageService.h"
#include "nsISeekableStream.h"
#include "nsIStringStream.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"
#include "OfflineStorage.h"
#include "mozilla/Components.h"

///////////////////////////////////////////////////////////////////////////////
// Definition of `MessageCopyHandler`, which handles a single copy operation
// (either from a file or another folder). See `EwsMessageCopyHandler.h` for
// more documentation.
///////////////////////////////////////////////////////////////////////////////

NS_IMPL_ISUPPORTS(MessageCopyHandler, nsICopyMessageListener)

// `nsICopyMessageListener` methods, which are only called when copying from a
// folder. These methods are called by a message service (proxied through
// `CopyMessageStreamListener`) as part of streaming a message's content.

NS_IMETHODIMP MessageCopyHandler::BeginCopy() {
  // Ensure the buffer is empty.
  mBuffer.Truncate();
  return NS_OK;
}

NS_IMETHODIMP MessageCopyHandler::StartMessage() {
  // `StartMessage` and `EndMessage` are only called by protocol-specific code
  // to send notifications from the relevant `nsMsgProtocol` child class to the
  // relevant folder class. We don't use this pattern for EWS, so we don't need
  // to implement these methods.
  NS_ERROR("Unexpected call to MessageCopyHandler::StartMessage");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP MessageCopyHandler::CopyData(nsIInputStream* aIStream,
                                           int32_t aLength) {
  char buffer[aLength];
  uint32_t bytesRead;
  MOZ_TRY(aIStream->Read(buffer, aLength, &bytesRead));

  if (bytesRead != (uint32_t)aLength) {
    NS_WARNING(nsPrintfCString(
                   "mismatch between data length and read length: %d != %d",
                   bytesRead, aLength)
                   .get());
  }

  mBuffer.Append(buffer, bytesRead);

  return NS_OK;
}

NS_IMETHODIMP MessageCopyHandler::EndMessage(nsMsgKey key) {
  // `StartMessage` and `EndMessage` are only called by protocol-specific code
  // to send notifications from the relevant `nsMsgProtocol` child class to the
  // relevant folder class. We don't use this pattern for EWS, so we don't need
  // to implement these methods.
  NS_ERROR("Unexpected call to MessageCopyHandler::EndMessage");
  return NS_ERROR_NOT_IMPLEMENTED;
}

NS_IMETHODIMP MessageCopyHandler::EndCopy(bool aCopySucceeded) {
  MOZ_ASSERT(mSrcFolder && !mSrcFile);
  if (!aCopySucceeded) {
    // If we encountered a failure, bail now.
    return OnCopyCompleted(NS_ERROR_FAILURE);
  }
  nsresult rv;

  // At this point the entire source message is in mBuffer.
  // Now we want to create it in the dest folder, both locally and remotely.
  nsCOMPtr<nsIStringInputStream> stream =
      do_CreateInstance("@mozilla.org/io/string-input-stream;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  MOZ_TRY(stream->SetByteStringData(mBuffer));

  // Make sure we apply the correct read flag onto the new message.
  RefPtr<nsIMsgDBHdr> curHeader = mHeaders[mCurIndex];

  nsCString dontPreserve;
  if (mIsMove) {
    mozilla::Preferences::GetCString(
        "mailnews.database.summary.dontPreserveOnMove", dontPreserve);
  } else {
    mozilla::Preferences::GetCString(
        "mailnews.database.summary.dontPreserveOnCopy", dontPreserve);
  }

  return ExchangePerformMessageCreateFromCopy(
      mDstFolder, stream, curHeader, StringFields(dontPreserve), mIsDraft,
      [self = RefPtr(this)](nsresult status, nsIMsgDBHdr* newHdr) {
        self->OnCreateFinished(status, newHdr);
      });
}

NS_IMETHODIMP MessageCopyHandler::EndMove(bool aMoveSucceeded) {
  // We handle move success/failure in `OnCreateFinished` so that we don't
  // delete the message until we know the message has been created in the
  // destination folder. The only caller of `EndMove` seems to be
  // `CopyMessageStreamListener::EndCopy`, which passes the same success/failure
  // boolean it also provides to `EndCopy`, so we're not likely to accidentally
  // miss a failure by stubbing this method out.
  return NS_OK;
}

// Additional public methods on `MessageCopyHandler`.

nsresult MessageCopyHandler::StartCopyingNextMessage() {
  if (mCopyServiceListener && mHeaders.Length() > 1) {
    // This is one of multiple messages, so inform the listener which message
    // we're currently on.
    mCopyServiceListener->OnProgress(mCurIndex + 1, mHeaders.Length());
  }

  if (mSrcFolder) {
    // Identify the relevant message service for the message we want to copy,
    // and ask it to stream the message's content to us.
    nsCString uri;
    MOZ_TRY(mSrcFolder.value()->GetUriForMsg(mHeaders[mCurIndex], uri));

    nsCOMPtr<nsIMsgMessageService> messageService;
    MOZ_TRY(GetMessageServiceFromURI(uri, getter_AddRefs(messageService)));

    // Wrap the current handler in a `CopyMessageStreamListener` so that
    // `nsIMsgMessageService::CopyMessage()` can use it as an
    // `nsIStreamListener`.
    RefPtr<CopyMessageStreamListener> copyListener =
        new CopyMessageStreamListener(this, mIsMove);

    // We'll buffer up the message in mBuffer before we proceed, see
    // BeginCopy()/CopyData()/EndCopy().
    return messageService->CopyMessage(uri, copyListener, mIsMove, nullptr,
                                       mWindow);
  }

  if (mSrcFile) {
    // When creating a message from a file, we expect this to be one part of a
    // larger operation (such as saving a draft message). As such,
    // `mCopyServiceListener` must be non-null so we can signal completion of
    // the copy operation. This isn't necessarily the case when copying from a
    // folder, where the copy may be the only action being performed.
    NS_ENSURE_ARG_POINTER(mCopyServiceListener);

    // We've already got the message's content, so no need to CopyMessage()
    // from elsewhere.
    nsCOMPtr<nsIInputStream> srcRaw;
    nsCOMPtr<nsIFile> file(mSrcFile.value());
    nsresult rv = NS_NewLocalFileInputStream(getter_AddRefs(srcRaw), file);
    NS_ENSURE_SUCCESS(rv, rv);

    // When creating a message from a file, we're saving to either the Sent
    // folder (in which case we mark the message as read) or to the Draft folder
    // (in which case we mark the message as unread).
    bool isRead = !mIsDraft;

    return ExchangePerformMessageCreate(
        mDstFolder, srcRaw, isRead, mIsDraft,
        [self = RefPtr(this)](nsresult status, nsIMsgDBHdr* newHdr) {
          self->OnCreateFinished(status, newHdr);
        });
  }

  // We're in an undefined state where we're copying from neither a folder nor a
  // file. This should never happen.
  NS_ERROR("StartCopyingNextMessage: Attempting a copy from an invalid source");
  return NS_ERROR_UNEXPECTED;
}

nsresult MessageCopyHandler::OnCopyCompleted(nsresult status) {
  // TODO: Refresh size on disk once we start keeping track of the size of EWS
  // folders on disk (via `mFolderSize` and `GetSizeOnDisk()`).

  // If we're moving a message from a folder, notify the source folder about the
  // outcome.
  if (mIsMove && mSrcFolder) {
    if (NS_SUCCEEDED(status)) {
      mSrcFolder.value()->NotifyFolderEvent(kDeleteOrMoveMsgCompleted);
    } else {
      mSrcFolder.value()->NotifyFolderEvent(kDeleteOrMoveMsgFailed);
    }
  }

  if (mSrcFolder) {
    nsCOMPtr<nsIMsgFolderNotificationService> notifier =
        mozilla::components::FolderNotification::Service();
    notifier->NotifyMsgsMoveCopyCompleted(mIsMove, mHeaders, mDstFolder,
                                          mDstHdr);
  }

  nsCOMPtr<nsIMsgCopyService> copyService =
      mozilla::components::Copy::Service();
  nsCOMPtr<nsISupports> srcSupports;
  if (mSrcFile) {
    srcSupports = do_QueryInterface(mSrcFile.value());
  } else if (mSrcFolder) {
    srcSupports = do_QueryInterface(mSrcFolder.value());
  } else {
    NS_ERROR("OnCopyCompleted: Attempting to copy from an invalid source");
    return NS_ERROR_UNEXPECTED;
  }

  // We do not need to call `mCopyServiceListener->OnStopCopy()` in this
  // method because it is called in `nsMsgCopyService::NotifyCompletion`.
  return copyService->NotifyCompletion(srcSupports, mDstFolder, status);
}

// Helper method used to wrap things up after a message has been created.
// For copies, it's just a matter of notifying any listener then going on
// to the next message to copy, if any.
// For moves, here's where we kick off deletion of the source message.
nsresult MessageCopyHandler::OnCreateFinished(nsresult status,
                                              nsIMsgDBHdr* newHdr) {
  // NOTE: SetMessageKey() needs to die.
  // It's required for old-style IMAP where the UID from the server is used
  // as the messageKey, but that really needs to change (see Bug 1806770).
  // It shouldn't be needed at all for EWS, but some of the unit tests rely
  // upon it (e.g. test_item_operations.js).
  if (NS_SUCCEEDED(status) && mCopyServiceListener) {
    nsMsgKey key;
    newHdr->GetMessageKey(&key);
    mCopyServiceListener->SetMessageKey(key);
  }

  // If we encountered a failure, bail now. Additionally, if we're copying from
  // a file, we also want to end the process now, since we're always copying a
  // single message in this case.
  if (NS_FAILED(status) || mSrcFile) {
    return OnCopyCompleted(status);
  }

  mDstHdr.AppendElement(newHdr);

  if (!mSrcFolder) {
    // If we don't have a source folder by this point, something has gone wrong,
    // so we end the operation now. In theory this cannot happen, because the
    // only alternative should be that we're copying from a file, in which case
    // we should have already returned, but this also guards against the copy
    // handler somehow getting into an undefined state.
    return OnCopyCompleted(NS_ERROR_UNEXPECTED);
  }

  if (mIsMove) {
    RefPtr<nsIMsgDBHdr> curHdr = mHeaders[mCurIndex];

    // It's a bit weird that we pass `nullptr` as the `listener` argument
    // (type `nsIMsgCopyServiceListener`), considering we're in the middle
    // of a copy. It looks like this argument is almost never set (and never
    // during a copy), except for `AttachmentDeleter::DeleteOriginalMessage`
    // which doesn't seem to do anything when the listener is called.
    MOZ_TRY(mSrcFolder.value()->DeleteMessages({curHdr}, mWindow, true, true,
                                               nullptr, false));
  }

  mCurIndex++;
  if (mCurIndex == mHeaders.Length()) {
    // We've reached the end of our queue.
    return OnCopyCompleted(NS_OK);
  }

  return StartCopyingNextMessage();
}
