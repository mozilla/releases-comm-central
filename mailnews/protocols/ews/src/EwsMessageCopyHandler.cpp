/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "EwsMessageCopyHandler.h"

#include "CopyMessageStreamListener.h"
#include "nsIInputStream.h"
#include "nsIMsgCopyService.h"
#include "nsIMsgMessageService.h"
#include "nsISeekableStream.h"
#include "nsIStringStream.h"
#include "nsMsgUtils.h"
#include "nsNetUtil.h"

#define ID_PROPERTY "ewsId"

///////////////////////////////////////////////////////////////////////////////
// Definition of `MessageCreateCallbacks`, which implements
// `IEWSMessageCreateCallbacks` and is used with an EWS client to signal
// progress when creating a new message on an EWS server.
///////////////////////////////////////////////////////////////////////////////

class MessageCreateCallbacks : public IEwsMessageCreateCallbacks {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEWSMESSAGECREATECALLBACKS

  MessageCreateCallbacks(EwsFolder* folder, nsISeekableStream* msgInputStream,
                         MessageCopyHandler* copyHandler)
      : mFolder(folder),
        mMsgInputStream(msgInputStream),
        mCopyHandler(copyHandler) {}

 protected:
  virtual ~MessageCreateCallbacks() = default;

 private:
  nsresult CopyHdrProperties(nsIMsgDBHdr* srcHdr, nsIMsgDBHdr* dstHdr,
                             bool isMove);

  // The folder in which the message should be created.
  RefPtr<EwsFolder> mFolder;

  // A seekable input stream that contains the message's content.
  RefPtr<nsISeekableStream> mMsgInputStream;

  // A copy handler, if we're copying from another folder. If this is set to
  // `Some(...)`, then `mFileCopyListener` is set to `Nothing()`.
  RefPtr<MessageCopyHandler> mCopyHandler;
};

NS_IMPL_ISUPPORTS(MessageCreateCallbacks, IEwsMessageCreateCallbacks)

nsresult MessageCreateCallbacks::CopyHdrProperties(nsIMsgDBHdr* srcHdr,
                                                   nsIMsgDBHdr* dstHdr,
                                                   bool isMove) {
  nsresult rv;
  nsCOMPtr<nsIPrefBranch> prefBranch(
      do_GetService(NS_PREFSERVICE_CONTRACTID, &rv));
  NS_ENSURE_SUCCESS(rv, rv);

  // These preferences exist so that extensions can control which properties
  // are preserved in the database when a message is moved or copied. All
  // properties are preserved except those listed in these preferences.
  nsCString dontPreserve;
  if (isMove) {
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnMove",
                            dontPreserve);
  } else {
    prefBranch->GetCharPref("mailnews.database.summary.dontPreserveOnCopy",
                            dontPreserve);
  }

  // We'll add spaces at beginning and end so we can search for
  // space-name-space, in order to avoid accidental partial matches.
  nsCString dontPreserveEx(" "_ns);
  dontPreserveEx.Append(dontPreserve);
  dontPreserveEx.Append(' ');

  // Never preserve the store properties, since message stores are per-folder
  // currently.
  dontPreserveEx.Append(" storeToken msgOffset ");

  // The "source" message might be coming from another EWS server, either
  // directly or indirectly (e.g. we don't currently strip the EWS ID when
  // copying to a non-EWS folder). We've created a new item for the destination
  // message with its own ID, and we don't want to overwrite it with the old
  // one.
  dontPreserveEx.Append(' ');
  dontPreserveEx.Append(ID_PROPERTY);
  dontPreserveEx.Append(' ');

  nsTArray<nsCString> properties;
  MOZ_TRY(srcHdr->GetProperties(properties));

  for (const auto& property : properties) {
    nsAutoCString propertyEx(" "_ns);
    propertyEx.Append(property);
    propertyEx.Append(' ');
    if (dontPreserveEx.Find(propertyEx) != kNotFound) {
      continue;
    }

    nsCString propertyValue;
    MOZ_TRY(srcHdr->GetStringProperty(property.get(), propertyValue));
    MOZ_TRY(dstHdr->SetStringProperty(property.get(), propertyValue));
  }

  uint32_t oldFlags, newFlags;
  MOZ_TRY(srcHdr->GetFlags(&oldFlags));
  MOZ_TRY(dstHdr->GetFlags(&newFlags));

  // Regardless of whether flags have been copied to the new header, we want to
  // ensure the values for some of them are carried over from the old one.
  uint32_t carryOver = nsMsgMessageFlags::New | nsMsgMessageFlags::Read |
                       nsMsgMessageFlags::HasRe;

  // The first half of this OR operation represents the values of the flags that
  // are *not* part of `carryOver`, which `parseMsgState` has identified and we
  // want to preserve. The second half represents the values of the flags
  // defined by `carryOver` in the original message, which we want to, well,
  // carry over onto the new header (and overwrite any value the parser has
  // found for them).
  dstHdr->SetFlags((newFlags & ~carryOver) | (oldFlags & carryOver));

  return NS_OK;
}

NS_IMETHODIMP MessageCreateCallbacks::OnRemoteCreateSuccessful(
    const nsACString& ewsId, nsIMsgDBHdr** newHdr) {
  // Rewind the message stream to the start, because at this point the stream
  // has already been read in its entirety in order to create the message on the
  // remote server.
  MOZ_TRY(mMsgInputStream->Seek(0, nsISeekableStream::NS_SEEK_SET));

  nsCOMPtr<nsIMsgPluggableStore> store;
  nsresult rv = mFolder->GetMsgStore(getter_AddRefs(store));
  NS_ENSURE_SUCCESS(rv, rv);

  // Create a new output stream to the folder's message store.
  nsCOMPtr<nsIOutputStream> outStream;
  rv = store->GetNewMsgOutputStream2(mFolder, getter_AddRefs(outStream));
  NS_ENSURE_SUCCESS(rv, rv);

  auto outGuard = mozilla::MakeScopeExit(
      [&] { store->DiscardNewMessage2(mFolder, outStream); });

  // Stream the message content to the store.
  nsCOMPtr<nsIInputStream> inputStream =
      do_QueryInterface(mMsgInputStream, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  uint64_t bytesCopied;
  rv = SyncCopyStream(inputStream, outStream, bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  nsAutoCString storeToken;
  rv = store->FinishNewMessage2(mFolder, outStream, storeToken);
  NS_ENSURE_SUCCESS(rv, rv);
  outGuard.release();

  // Create a new `nsIMsgDBHdr` in the database for this message.
  nsCOMPtr<nsIMsgDatabase> msgDB;
  rv = mFolder->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgDBHdr> hdr;
  rv = msgDB->CreateNewHdr(nsMsgKey_None, getter_AddRefs(hdr));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = hdr->SetStoreToken(storeToken);
  NS_ENSURE_SUCCESS(rv, rv);

  // Update some of the header's metadata, such as the size, the offline flag
  // and the EWS ID.
  rv = hdr->SetMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = hdr->SetOfflineMessageSize(bytesCopied);
  NS_ENSURE_SUCCESS(rv, rv);

  uint32_t unused;
  rv = hdr->OrFlags(nsMsgMessageFlags::Offline, &unused);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = hdr->SetStringProperty(ID_PROPERTY, ewsId);
  NS_ENSURE_SUCCESS(rv, rv);

  // Return the newly-created header so that the consumer can update it with
  // metadata from the message headers before adding it to the message database.
  hdr.forget(newHdr);

  return NS_OK;
}

NS_IMETHODIMP MessageCreateCallbacks::CommitHeader(nsIMsgDBHdr* hdr) {
  if (auto currHdr = mCopyHandler->GetCurrentMessageHeader()) {
    // If there's a source message header (which is always the case when copying
    // from another folder, but never when copying from a file), then copy some
    // of its properties onto the new one.
    bool isMove = mCopyHandler->GetIsMove();
    nsCOMPtr<nsIMsgDBHdr> srcHdr = currHdr.value();
    MOZ_TRY(CopyHdrProperties(srcHdr, hdr, isMove));
  }

  nsCOMPtr<nsIMsgDatabase> msgDB;
  nsresult rv = mFolder->GetMsgDatabase(getter_AddRefs(msgDB));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgDB->AddNewHdrToDB(hdr, true);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = msgDB->Commit(nsMsgDBCommitType::kLargeCommit);
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

NS_IMETHODIMP MessageCreateCallbacks::SetMessageKey(nsMsgKey aKey) {
  return mCopyHandler->SetMessageKey(aKey);
}

NS_IMETHODIMP MessageCreateCallbacks::OnStopCreate(nsresult status) {
  return mCopyHandler->OnCreateFinished(status);
}

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
  if (!aCopySucceeded) {
    // If we encountered a failure, bail now.
    return OnCopyCompleted(NS_ERROR_FAILURE);
  }

  return CreateRemoteMessage();
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
  if (mCurIndex == 0 && mCopyServiceListener) {
    // This is the first item of the batch (or we're copying a message from a
    // file, in which case there's only one message to copy and `mCurIndex` is
    // always `0`), so we signal the start of the operation to the listener.
    mCopyServiceListener->OnStartCopy();
  }

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

    // We've already got the message's content, so we can directly skip to
    // creating the message on the server.
    return CreateRemoteMessage();
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

  if (mCopyServiceListener) {
    mCopyServiceListener->OnStopCopy(status);
  }

  nsresult rv;
  nsCOMPtr<nsIMsgCopyService> copyService =
      do_GetService("@mozilla.org/messenger/messagecopyservice;1", &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsISupports> srcSupports;
  if (mSrcFile) {
    srcSupports = do_QueryInterface(mSrcFile.value());
  } else if (mSrcFolder) {
    srcSupports = do_QueryInterface(mSrcFolder.value());
  } else {
    NS_ERROR("OnCopyCompleted: Attempting to copy from an invalid source");
    return NS_ERROR_UNEXPECTED;
  }

  return copyService->NotifyCompletion(srcSupports, mDstFolder, status);
}

// Protected methods on `MessageCopyHandler`, intended to be called by its
// friend class `MessageCreateCallbacks`.

nsresult MessageCopyHandler::OnCreateFinished(nsresult status) {
  // If we encountered a failure, bail now. Additionally, if we're copying from
  // a file, we also want to end the process now, since we're always copying a
  // single message in this case.
  if (NS_FAILED(status) || mSrcFile) {
    return OnCopyCompleted(status);
  }

  if (!mSrcFolder) {
    // If we don't have a source folder by this point, something has gone wrong,
    // so we end the operation now. In theory this cannot happen, because the
    // only alternative should be that we're copying from a file, in which case
    // we should have already returned, but this also guards against the copy
    // handler somehow getting into an undefined state.
    return OnCopyCompleted(NS_ERROR_UNEXPECTED);
  }

  if (mIsMove) {
    // Safety: `RefPtr`'s `=` operator increments the reference counter itself,
    // so we don't need to use `NS_ADDREF` here.
    RefPtr<nsIMsgDBHdr> curHdr = mHeaders[mCurIndex];

    // It's a bit weird that we set the `listener` argument (of type
    // `nsIMsgCopyServiceListener`) to `nullptr` considering we're in the middle
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

bool MessageCopyHandler::GetIsMove() { return mIsMove; }

mozilla::Maybe<RefPtr<nsIMsgDBHdr>>
MessageCopyHandler::GetCurrentMessageHeader() {
  if (mSrcFolder) {
    return mozilla::Some(mHeaders[mCurIndex]);
  }

  return mozilla::Nothing();
}

nsresult MessageCopyHandler::SetMessageKey(nsMsgKey aKey) {
  if (mCopyServiceListener) {
    mCopyServiceListener->SetMessageKey(aKey);
  }

  return NS_OK;
}

// Additional private methods on `MessageCopyHandler`, intended for internal
// use.

nsresult MessageCopyHandler::CreateRemoteMessage() {
  nsresult rv;
  bool isRead = false;
  nsCOMPtr<nsIInputStream> inputStream;

  // Get a stream containing the file's content, according to its source.
  if (mSrcFolder) {
    // If we're copying from a folder, the message content was streamed from the
    // relevant message service into `mBuffer`, so we create an input stream
    // from this buffer.
    nsCOMPtr<nsIStringInputStream> stream =
        do_CreateInstance("@mozilla.org/io/string-input-stream;1", &rv);
    NS_ENSURE_SUCCESS(rv, rv);
    MOZ_TRY(stream->SetByteStringData(mBuffer));

    inputStream = stream;

    // Make sure we apply the correct read flag onto the new message.
    RefPtr<nsIMsgDBHdr> curHeader = mHeaders[mCurIndex];
    MOZ_TRY(curHeader->GetIsRead(&isRead));
  } else if (mSrcFile) {
    // If we're copying from a file, open an input stream with the file's
    // content.
    nsCOMPtr<nsIFile> file = mSrcFile.value();
    rv = NS_NewLocalFileInputStream(getter_AddRefs(inputStream), file);
    NS_ENSURE_SUCCESS(rv, rv);

    // When creating a message from a file, we're saving to either the Sent
    // folder (in which case we mark the message as read) or to the Draft folder
    // (in which case we mark the message as unread).
    isRead = !mIsDraft;
  } else {
    return NS_ERROR_UNEXPECTED;
  }

  // Both the implementation of `nsIStringInputStream` and the output of
  // `NS_NewLocalFileInputStream` implement `nsISeekableStream`, so QI'ing
  // should be fine here.
  nsCOMPtr<nsISeekableStream> seekable = do_QueryInterface(inputStream, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  RefPtr<MessageCreateCallbacks> callbacks =
      new MessageCreateCallbacks(mDstFolder, seekable, this);

  return mClient->CreateMessage(mDstFolderId, mIsDraft, isRead, inputStream,
                                callbacks);
}
