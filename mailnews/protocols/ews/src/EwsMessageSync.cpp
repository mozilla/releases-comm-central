/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// #include <utility>

#include "EwsMessageSync.h"
#include "EwsFolder.h"
#include "EwsListeners.h"
#include "IEwsClient.h"
#include "IEwsIncomingServer.h"
#include "mozilla/Components.h"
#include "nsAutoSyncState.h"
#include "nsIMsgFolderNotificationService.h"
#include "OfflineStorage.h"  // For LocalDeleteMessages().

#define SYNC_STATE_PROPERTY "ewsSyncStateToken"
constexpr auto kEwsIdProperty = "ewsId";

/**
 * Helper class for orchestrating a message sync operation for an EwsFolder.
 *
 * You can think of it as an object which represents the sync operation as it
 * progresses.
 * It works by asking EwsClient to start a message sync operation.
 * As the operation progresses, EwsClient communicates updates via
 * IEwsMessageSyncListener callbacks. This class implements those callbacks
 * and responds by applying whatever changes need to be made to the local
 * folder, database, whatever.
 * It exists for the duration of the sync operation.
 *
 * This removes most protocol-specific message sync code out of EwsFolder.
 *
 * Architectural aside (potential future directions):
 *
 * While other protocols might employ quite different approaches to
 * synchronising server and local state, the changes such operations need
 * to apply to the folder (and database et al) are actually very generic.
 * So, while the operation implementation is tightly coupled to the protocol,
 * it can be loosely coupled to the folder via protocol-agnostic interfaces.
 * We can use this pattern to strip such operations out of the various
 * folder implementations (nsImapMailFolder et al) leaving a small, shared
 * folder core.
 * The historical folder implementations tend to add all their operation
 * state tracking as member variables of the their folder class. Some
 * folder classes are huge. This vastly complicates the
 * folder code itself and the code flow followed during such operations.
 * Even without going to the logical extreme of sharing a single folder
 * class across all protocols, this pattern could help move complex protocol
 * operations out of folder code and into understandable units, making the
 * code vastly easier to reason with.
 *
 * NOTE: we're using C++ derivation here to implement the
 * IEwsMessageSyncListener callbacks, as opposed to the lambda-based approach
 * used for other EWS operations.
 * Using derivation to implement listener callbacks is often a bad
 * idea:
 * - it exposes implementation details which shouldn't be part of the
 *   public class interface.
 * - it often leads to an obfuscated flow of execution (crossing multiple
 *   class and source file boundaries).
 * - it gets complicated where multiple operations use the same listener
 *   interface, so derived callback implementations have to "demultiplex" and
 *   figure out which in context they are being called.
 *
 * The rationale for using derivation here:
 * - All the callback code is in the same source file as the function call
 *   which initiates the operation so flow of execution is easier to track.
 * - The class itself is never exposed, being hidden away in this .cpp file.
 * - We need a ref-counted object to hold the ongoing state of the operation
 *   (e.g. a list of messages added so far), and the derivation gives us that.
 * - It sidesteps some of the awkwardness and scoping foot-guns around
 *   sharing state across multiple Lambda closures.
 *
 * As this code evolves over time, this rationale should be re-evaluated.
 * This message sync code could be radically rewritten and nothing
 * outside this file needs to know.
 */
class EwsMessageSyncHandler : public IEwsMessageSyncListener,
                              IEwsFallibleOperationListener {
 public:
  NS_DECL_ISUPPORTS

  EwsMessageSyncHandler(
      EwsFolder* folder, std::function<void()> onStart,
      std::function<void(nsresult, nsTArray<nsMsgKey> const&)> onStop)
      : mFolder(folder),
        mOnStart(std::move(onStart)),
        mOnStop(std::move(onStop)) {}

  EwsMessageSyncHandler() = delete;

  /**
   * Go() sets the operation running.
   * If Go() returns a failure code, the sync operation should be deemed to
   * have failed to start.
   * If Go() returns success, the sync operation is up and running.
   */
  nsresult Go() {
    MOZ_ASSERT(mFolder);

    // Most of the listener callbacks will want to poke the database.
    MOZ_TRY(mFolder->GetMsgDatabase(getter_AddRefs(mDB)));

    // We can get the EwsClient via the EwsFolder:
    nsCOMPtr<IEwsClient> ewsClient;
    {
      nsCOMPtr<nsIMsgIncomingServer> server;
      MOZ_TRY(mFolder->GetServer(getter_AddRefs(server)));
      nsCOMPtr<IEwsIncomingServer> ewsServer(do_QueryInterface(server));
      MOZ_TRY(ewsServer->GetProtocolClient(getter_AddRefs(ewsClient)));
    }

    // We need to know the EwsID of this folder on the server.
    nsAutoCString ewsFolderId;
    MOZ_TRY(mFolder->GetEwsId(ewsFolderId));

    // EWS provides us an opaque value which specifies the last version of
    // upstream messages we received. Provide that to simplify sync.
    nsCString syncStateToken;
    nsresult rv =
        mFolder->GetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
    if (NS_FAILED(rv)) {
      syncStateToken = EmptyCString();
    }

    // TODO:
    // We don't really want to call onStart() until SyncMessagesForFolder()
    // returns OK. But currently we don't know for sure that
    // IEwsClient.syncMessagesForFolder() won't call a listener callback
    // _before_ returning, maybe even our onStop() handler!
    // So for now we blindly call onStart() first and do our best to match
    // with onStop() in the event of a failure.
    // This needs a bigger-picture policy approach for listener use in
    // general.
    mOnStart();

    // Start the operation!
    // We pass `this` in as the listener, so the EwsClient will hold a
    // refcount upon this object until the operation is complete.
    rv = ewsClient->SyncMessagesForFolder(this, ewsFolderId, syncStateToken);
    if (NS_FAILED(rv)) {
      // We called onStart() so must call onStop() too.
      mOnStop(rv, {});
      rv = NS_OK;
    }

    return rv;
  }

 protected:
  virtual ~EwsMessageSyncHandler() = default;

  //
  // IEwsMessageSyncListener implementation
  //

  NS_IMETHOD OnMessageCreated(const nsACString& ewsId,
                              nsIMsgDBHdr** newHdr) override {
    // If a message with this EWS ID already exists, bail out.
    RefPtr<nsIMsgDBHdr> existingHeader;
    nsresult rv =
        mDB->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
    NS_ENSURE_SUCCESS(rv, rv);
    if (existingHeader) {
      return NS_ERROR_ILLEGAL_VALUE;
    }

    nsCOMPtr<nsIMsgDBHdr> newHeader;
    rv = mDB->CreateNewHdr(nsMsgKey_None, getter_AddRefs(newHeader));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = newHeader->SetStringProperty(kEwsIdProperty, ewsId);
    NS_ENSURE_SUCCESS(rv, rv);

    newHeader.forget(newHdr);
    return NS_OK;
  };

  NS_IMETHOD OnMessageUpdated(const nsACString& ewsId,
                              nsIMsgDBHdr** hdr) override {
    RefPtr<nsIMsgDBHdr> existingHdr;
    nsresult rv =
        mDB->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHdr));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!existingHdr) {
      return NS_ERROR_NOT_AVAILABLE;
    }

    // The message content might have changed (e.g. if a draft was updated), and
    // there's no way for us to know for sure without re-downloading it. So
    // let's delete its content from the message store so it can be
    // re-downloaded later.
    uint32_t flags;
    rv = existingHdr->GetFlags(&flags);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!(flags & nsMsgMessageFlags::Offline)) {
      // Bail early if there's nothing to remove.
      existingHdr.forget(hdr);
      return NS_OK;
    }

    // Delete the message content from the local store.
    nsCOMPtr<nsIMsgPluggableStore> store;
    rv = mFolder->GetMsgStore(getter_AddRefs(store));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = store->DeleteMessages({existingHdr});
    NS_ENSURE_SUCCESS(rv, rv);

    // Update the flags on the database entry to reflect its content is *not*
    // stored offline anymore. We don't commit right now, but the expectation is
    // that the consumer will call `CommitChanges()` once it's done processing
    // the current change.
    uint32_t unused;
    rv = existingHdr->AndFlags(~nsMsgMessageFlags::Offline, &unused);
    NS_ENSURE_SUCCESS(rv, rv);

    existingHdr.forget(hdr);

    return NS_OK;
  };

  NS_IMETHOD OnReadStatusChanged(const nsACString& ewsId,
                                 bool isRead) override {
    // Get the header for the message with ewsId and update its read flag in the
    // database.
    RefPtr<nsIMsgDBHdr> existingHeader;
    nsresult rv =
        mDB->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
    NS_ENSURE_SUCCESS(rv, rv);
    if (!existingHeader) {
      return NS_ERROR_NOT_AVAILABLE;
    }

    return existingHeader->MarkRead(isRead);
  };

  NS_IMETHOD OnMessageDeleted(const nsACString& ewsId) override {
    RefPtr<nsIMsgDBHdr> existingHeader;
    nsresult rv =
        mDB->GetMsgHdrForEwsItemID(ewsId, getter_AddRefs(existingHeader));
    NS_ENSURE_SUCCESS(rv, rv);

    if (!existingHeader) {
      // If we don't have a header for this message ID, it means we have already
      // deleted it locally. This can happen in legitimate situations, e.g. when
      // syncing the message list after deleting a message from Thunderbird (in
      // which case, the server's sync response will include a `Delete` change
      // for the message we've just deleted).
      return NS_OK;
    }

    // Delete from DB and from the nsIMsgPluggableStore (if present).
    return LocalDeleteMessages(mFolder, {existingHeader});
  };

  NS_IMETHOD OnDetachedHdrPopulated(nsIMsgDBHdr* hdr) override {
    // If New flag is not set, it won't be added to the databases list of
    // new messages (and so won't be filtered/classified). But we'll treat
    // read messages as old.
    uint32_t flags;
    nsresult rv = hdr->GetFlags(&flags);
    NS_ENSURE_SUCCESS(rv, rv);

    if (!(flags & nsMsgMessageFlags::Read)) {
      flags |= nsMsgMessageFlags::New;
      hdr->SetFlags(flags);
      mNewMessages.AppendElement(hdr);
    }

    nsCOMPtr<nsIMsgDBHdr> liveHdr;
    rv = mDB->AttachHdr(hdr, true, getter_AddRefs(liveHdr));
    NS_ENSURE_SUCCESS(rv, rv);

    nsCOMPtr<nsIMsgFolderNotificationService> notifier =
        mozilla::components::FolderNotification::Service();

    // Remember message for filtering at end of sync operation.
    notifier->NotifyMsgAdded(liveHdr);

    return NS_OK;
  };

  NS_IMETHOD OnExistingHdrChanged() override {
    return mDB->Commit(nsMsgDBCommitType::kLargeCommit);
  };

  NS_IMETHOD OnSyncStateTokenChanged(
      const nsACString& syncStateToken) override {
    return mFolder->SetStringProperty(SYNC_STATE_PROPERTY, syncStateToken);
  };

  // Called when the operation succeeds.
  NS_IMETHOD OnSyncComplete() override {
    ReportResult(NS_OK);
    return NS_OK;
  }

  //
  // IEwsFallibleOperationListener implementation
  //

  // Called if sync operation fails.
  NS_IMETHOD OnOperationFailure(nsresult status) override {
    MOZ_ASSERT(NS_FAILED(status));
    ReportResult(status);
    return NS_OK;
  }

 private:
  // Helper to report both success and failure.
  // Even if the operation fails some messages may have already been added
  // to the database and the folder should be told about them.
  void ReportResult(nsresult status) {
    nsTArray<nsMsgKey> keys(mNewMessages.Length());
    for (nsIMsgDBHdr* hdr : mNewMessages) {
      nsMsgKey key;
      hdr->GetMessageKey(&key);
      MOZ_ASSERT(key != nsMsgKey_None);
      keys.AppendElement(key);
    }
    mOnStop(status, keys);
  }

  RefPtr<EwsFolder> mFolder;
  RefPtr<nsIMsgDatabase> mDB;
  nsTArray<RefPtr<nsIMsgDBHdr>> mNewMessages;
  std::function<void()> mOnStart;
  std::function<void(nsresult, nsTArray<nsMsgKey> const&)> mOnStop;
};

NS_IMPL_ISUPPORTS(EwsMessageSyncHandler, IEwsMessageSyncListener,
                  IEwsFallibleOperationListener)

nsresult EwsPerformMessageSync(
    EwsFolder* folder, std::function<void()> onStart,
    std::function<void(nsresult, nsTArray<nsMsgKey> const&)> onStop) {
  RefPtr<EwsMessageSyncHandler> syncer =
      new EwsMessageSyncHandler(folder, onStart, onStop);
  return syncer->Go();
}
