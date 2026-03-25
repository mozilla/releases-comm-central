/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

#include "ExchangeMessageCreate.h"
#include "EwsFolder.h"
#include "EwsListeners.h"
#include "IExchangeClient.h"
#include "IEwsIncomingServer.h"
#include "MailHeaderParsing.h"  // For ParseHeaderBlock().
#include "MailStream.h"
#include "mozilla/Buffer.h"
#include "mozilla/Components.h"
#include "nsAutoSyncState.h"
#include "nsMsgDatabase.h"  // For ApplyRawHdrToDbHdr().
#include "nsNetUtil.h"
#include "nsStreamUtils.h"
#include "nsIInputStream.h"
#include "nsIMsgFolderNotificationService.h"
#include "OfflineStorage.h"  // For LocalDeleteMessages().

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"

extern mozilla::LazyLogModule gEwsLog;

/**
 * Helper class to coordinate creating a message on both the remote server
 * and locally.
 * Because of historical oddities, this is also used for copying messages,
 * hence the slightly cumbersome support for taking a source nsIMsgDBHdr to
 * copy from, and the isDraft value...
 */
class MessageCreateHandler : public IExchangeMessageCreateListener {
 public:
  NS_DECL_ISUPPORTS

  // srcStream is a stream containing the raw RFC822 message.
  // srcHdr is optional. When set, it'll copy the properties of srcHdr to the
  // new nsIDBHdr, excluding any properties listed in srcExcludeProperties.
  MessageCreateHandler(EwsFolder* destFolder, nsIInputStream* srcStream,
                       nsIMsgDBHdr* srcHdr,
                       nsTArray<nsCString> const& srcExcludeProperties,
                       bool isRead, bool isDraft,
                       std::function<void(nsresult, nsIMsgDBHdr*)> onComplete)
      : mFolder(destFolder),
        mOnComplete(std::move(onComplete)),
        mRawMsg(srcStream),
        mSrcHdr(srcHdr),
        mSrcExcludeProperties(srcExcludeProperties.Clone()),
        mIsRead(isRead),
        mIsDraft(isDraft) {}

  MessageCreateHandler() = delete;

  /**
   * Go() sets the operation running.
   * If Go() returns a failure code, the operation should be deemed to
   * have failed to start.
   * If Go() returns success, the operation is up and running.
   */
  nsresult Go() {
    MOZ_ASSERT(mFolder);

    // We can get the client via the EwsFolder:
    nsCOMPtr<IExchangeClient> ewsClient;
    {
      nsCOMPtr<nsIMsgIncomingServer> server;
      MOZ_TRY(mFolder->GetServer(getter_AddRefs(server)));
      nsCOMPtr<IEwsIncomingServer> ewsServer(do_QueryInterface(server));
      MOZ_TRY(ewsServer->GetProtocolClient(getter_AddRefs(ewsClient)));
    }

    // We need to know the EwsID of this folder on the server.
    nsAutoCString ewsFolderId;
    MOZ_TRY(mFolder->GetEwsId(ewsFolderId));

    // Clone the stream.
    // We'll use one to stream the message up to the server, holding the
    // other one back for the headers and offline message store.
    nsCOMPtr<nsIInputStream> clonedStream;
    nsCOMPtr<nsIInputStream> replacement;
    MOZ_TRY(NS_CloneInputStream(mRawMsg, getter_AddRefs(clonedStream),
                                getter_AddRefs(replacement)));
    if (replacement) {
      mRawMsg.swap(replacement);
    }

    // Start the remote creation, `passing` this as the listener.
    // OnRemoteCreateFinished() will be called when done.
    return ewsClient->CreateMessage(this, ewsFolderId, mIsDraft, mIsRead,
                                    clonedStream);
  }

  NS_IMETHOD OnRemoteCreateFinished(nsresult status,
                                    nsACString const& serverId) override {
    if (NS_FAILED(status)) {
      mOnComplete(status, nullptr);
      return NS_OK;
    }
    // Using helper function to ease error handling.
    auto result = LocalCreateHelper(serverId);
    if (result.isErr()) {
      // NOTE: if the local creation fails, then we're left with the
      // one on the server and no attempt will be made to roll that back.
      // But that's _probably_ the Right Thing (tm) to do...
      nsresult rv = result.unwrapErr();
      mOnComplete(rv, nullptr);
      return rv;
    }

    mOnComplete(NS_OK, result.unwrap().get());
    return NS_OK;
  }

 protected:
  virtual ~MessageCreateHandler() = default;

 private:
  // Helper - The server-side creation is complete. Now add the message on
  // the local side.
  mozilla::Result<nsCOMPtr<nsIMsgDBHdr>, nsresult> LocalCreateHelper(
      nsACString const& serverId) {
    // Wrap the stream, so we can access the header as well as streaming
    // it to the local messagestore.
    RefPtr<MailStream> msgStream = new MailStream(mRawMsg);

    nsCOMPtr<nsIMsgDatabase> db;
    MOZ_TRY(mFolder->GetMsgDatabase(getter_AddRefs(db)));

    // Create a (detached) nsIMsgDBHdr.
    nsCOMPtr<nsIMsgDBHdr> tmpHdr;
    MOZ_TRY(db->CreateNewHdr(nsMsgKey_None, getter_AddRefs(tmpHdr)));
    bool isLive;
    MOZ_TRY(tmpHdr->GetIsLive(&isLive));
    MOZ_ASSERT(!isLive);

    // Parse the RFC5322 header block and apply to the nsIMsgDBHdr.
    nsCString headerBlock(MOZ_TRY(msgStream->HeaderBlock()));
    auto headerSpan = MOZ_TRY(msgStream->HeaderBlock());
    RawHdr rawHdrData = ParseRawMailHeaders(headerSpan);
    MOZ_TRY(ApplyRawHdrToDbHdr(rawHdrData, tmpHdr));

    // link to EwsId
    MOZ_TRY(tmpHdr->SetStringProperty(kEwsIdProperty, serverId));

    // (optional) Copy over fields from srcHdr.
    if (mSrcHdr) {
      MOZ_TRY(LocalCopyHeaders(mSrcHdr, tmpHdr, mSrcExcludeProperties));
    }

    // Add to DB and commit.
    nsCOMPtr<nsIMsgDBHdr> liveHdr;
    MOZ_TRY(db->AttachHdr(tmpHdr, true, getter_AddRefs(liveHdr)));
    MOZ_TRY(db->Commit(nsMsgDBCommitType::kLargeCommit));

    // Now write the full message to local message store.
    // Ignore failures here - the operation has been successful and the new
    // message is in the DB. Let the standard offline sync code deal with it.
    //
    // TODO: check offline-storage policy here! See
    // https://bugzilla.mozilla.org/show_bug.cgi?id=2026215
    nsresult rv = LocalCopyOfflineMessageContent(mFolder, msgStream, liveHdr);
    if (NS_FAILED(rv)) {
      MOZ_LOG_FMT(
          gEwsLog, mozilla::LogLevel::Warning,
          "MessageCreateHandler - failed writing offline copy (serverId={})",
          serverId);
    }

    return liveHdr;
  }

  // The destination folder the new message will be created in.
  RefPtr<EwsFolder> mFolder;

  // The callback to let the caller know we're done.
  std::function<void(nsresult, nsIMsgDBHdr*)> mOnComplete;

  // Params containing message data... pulled from a bunch of places.

  nsCOMPtr<nsIInputStream> mRawMsg;  // The raw rfc5322 data.

  // Optional hdr to copy properties from.
  nsCOMPtr<nsIMsgDBHdr> mSrcHdr;

  // If mSrcHdr is set, the properties here are excluded from the copy.
  nsTArray<nsCString> mSrcExcludeProperties;
  bool mIsRead;   // Should the new message be marked read?
  bool mIsDraft;  // Nobody really understands this.
};

NS_IMPL_ISUPPORTS(MessageCreateHandler, IExchangeMessageCreateListener)

nsresult ExchangePerformMessageCreate(
    EwsFolder* destFolder, nsIInputStream* srcRaw, bool isRead, bool isDraft,
    std::function<void(nsresult, nsIMsgDBHdr*)> onComplete) {
  MOZ_ASSERT(destFolder);
  MOZ_ASSERT(srcRaw);

  // Creation without copying an existing nsIMsgDBHdr.
  RefPtr<MessageCreateHandler> handler = new MessageCreateHandler(
      destFolder, srcRaw, nullptr, {}, isRead, isDraft, onComplete);
  return handler->Go();
}

nsresult ExchangePerformMessageCreateFromCopy(
    EwsFolder* destFolder, nsIInputStream* srcRaw, nsIMsgDBHdr* srcHdr,
    nsTArray<nsCString> const& srcExcludeProperties, bool isDraft,
    std::function<void(nsresult, nsIMsgDBHdr*)> onComplete) {
  MOZ_ASSERT(destFolder);
  MOZ_ASSERT(srcRaw);
  MOZ_ASSERT(srcHdr);

  bool isRead;
  MOZ_TRY(srcHdr->GetIsRead(&isRead));

  RefPtr<MessageCreateHandler> handler =
      new MessageCreateHandler(destFolder, srcRaw, srcHdr, srcExcludeProperties,
                               isRead, isDraft, onComplete);
  return handler->Go();
}
