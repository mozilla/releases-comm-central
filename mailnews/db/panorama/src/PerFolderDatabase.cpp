/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PerFolderDatabase.h"

#include "DatabaseCore.h"
#include "MailNewsTypes.h"
#include "Message.h"
#include "MessageDatabase.h"
#include "mozilla/RefPtr.h"
#include "nsIDBChangeListener.h"
#include "nsIMsgDBView.h"
#include "nsMsgMessageFlags.h"
#include "nsServiceManagerUtils.h"
#include "Thread.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(PerFolderDatabase, nsIDBChangeAnnouncer, nsIMsgDatabase)

// MessageListener:

void PerFolderDatabase::OnMessageAdded(Message* message) {
  if (message->mFolderId == mFolderId) {
    NotifyHdrAddedAll(message, nsMsgKey_None, message->mFlags, nullptr);
  }
}

void PerFolderDatabase::OnMessageRemoved(Message* message) {
  if (message->mFolderId == mFolderId) {
    NotifyHdrDeletedAll(message, nsMsgKey_None, message->mFlags, nullptr);
  }
}

void PerFolderDatabase::OnMessageFlagsChanged(Message* message,
                                              uint64_t oldFlags,
                                              uint64_t newFlags) {
  if (message->mFolderId == mFolderId) {
    NotifyHdrChangeAll(message, oldFlags, newFlags, nullptr);
  }
}

// nsIDBChangeAnnouncer:

NS_IMETHODIMP PerFolderDatabase::AddListener(nsIDBChangeListener* listener) {
  mListeners.AppendElementUnlessExists(listener);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::RemoveListener(nsIDBChangeListener* listener) {
  mListeners.RemoveElement(listener);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrChangeAll(
    nsIMsgDBHdr* hdrChanged, uint32_t oldFlags, uint32_t newFlags,
    nsIDBChangeListener* instigator) {
  for (RefPtr<nsIDBChangeListener> listener : mListeners.EndLimitedRange()) {
    listener->OnHdrFlagsChanged(hdrChanged, oldFlags, newFlags, instigator);
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrAddedAll(
    nsIMsgDBHdr* hdrAdded, nsMsgKey parentKey, int32_t flags,
    nsIDBChangeListener* instigator) {
  for (RefPtr<nsIDBChangeListener> listener : mListeners.EndLimitedRange()) {
    listener->OnHdrAdded(hdrAdded, parentKey, flags, instigator);
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrDeletedAll(
    nsIMsgDBHdr* hdrDeleted, nsMsgKey parentKey, int32_t flags,
    nsIDBChangeListener* instigator) {
  for (RefPtr<nsIDBChangeListener> listener : mListeners.EndLimitedRange()) {
    listener->OnHdrDeleted(hdrDeleted, parentKey, flags, instigator);
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::NotifyParentChangedAll(
    nsMsgKey keyReparented, nsMsgKey oldParent, nsMsgKey newParent,
    nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyReadChanged(
    nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyJunkScoreChanged(
    nsIDBChangeListener* aInstigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyAnnouncerGoingAway(void) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

// nsIMsgDatabase:

NS_IMETHODIMP PerFolderDatabase::OpenFromFile(nsIFile* aFolderName) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::Close(bool aForceCommit) { return NS_OK; }
NS_IMETHODIMP PerFolderDatabase::Commit(nsMsgDBCommit aCommitType) {
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::ForceClosed() { return NS_OK; }
NS_IMETHODIMP PerFolderDatabase::ClearCachedHdrs() {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ResetHdrCacheSize(uint32_t size) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetDBFolderInfo(
    nsIDBFolderInfo** aDBFolderInfo) {
  NS_IF_ADDREF(*aDBFolderInfo = new FolderInfo(
                   mFolderDatabase, mMessageDatabase, this, mFolderId));
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetDatabaseSize(int64_t* databaseSize) {
  *databaseSize = 0;
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetFolder(nsIMsgFolder** aFolder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetLastUseTime(PRTime* aLastUseTime) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetLastUseTime(PRTime aLastUseTime) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForKey(nsMsgKey key,
                                                 nsIMsgDBHdr** msgHdr) {
  NS_ENSURE_ARG_POINTER(msgHdr);

  RefPtr<Message> message;
  nsresult rv = mMessageDatabase->GetMessage(key, getter_AddRefs(message));
  if (NS_FAILED(rv) || message->mFolderId != mFolderId) {
    return NS_ERROR_ILLEGAL_VALUE;
  }
  NS_IF_ADDREF(*msgHdr = message);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForMessageID(const char* messageID,
                                                       nsIMsgDBHdr** msgHdr) {
  NS_ENSURE_ARG_POINTER(msgHdr);

  RefPtr<Message> message;
  nsresult rv = mMessageDatabase->GetMessageForMessageID(
      mFolderId, nsCString(messageID), getter_AddRefs(message));
  if (NS_FAILED(rv)) {
    return NS_ERROR_ILLEGAL_VALUE;
  }
  NS_IF_ADDREF(*msgHdr = message);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForGMMsgID(
    const char* aGmailMessageID, nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForEwsItemID(const nsACString& itemID,
                                                       nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ContainsKey(nsMsgKey aKey, bool* aContains) {
  RefPtr<Message> message;
  nsresult rv = mMessageDatabase->GetMessage(aKey, getter_AddRefs(message));
  *aContains = NS_SUCCEEDED(rv) && message->mFolderId == mFolderId;
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgKeysForUIDs(
    const nsTArray<uint32_t>& uids, nsTArray<nsMsgKey>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgUIDsForKeys(
    const nsTArray<nsMsgKey>& keys, nsTArray<uint32_t>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ContainsUID(uint32_t uid, bool* aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForUID(uint32_t uid,
                                                 nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::CreateNewHdr(nsMsgKey aKey,
                                              nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::AddNewHdrToDB(nsIMsgDBHdr* newHdr,
                                               bool notify) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::CopyHdrFromExistingHdr(
    nsMsgKey key, nsIMsgDBHdr* existingHdr, bool addHdrToDB,
    nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::AddMsgHdr(RawHdr* msg, bool notify,
                                           nsIMsgDBHdr** newHdr) {
  MOZ_ASSERT(newHdr);
  nsMsgKey key;
  nsresult rv = mMessageDatabase->AddMessage(
      mFolderId, msg->messageId, msg->date, msg->sender, msg->recipients,
      msg->ccList, msg->bccList, msg->subject, msg->flags, msg->keywords, &key);
  NS_ENSURE_SUCCESS(rv, rv);
  MOZ_ASSERT(key != nsMsgKey_None);

  // We do have enough info here to construct the header without
  // doing another DB query, but let's keep it simple.
  // (even better if the header only contained folderid and msgKey,
  // anyway, and no data fields).
  RefPtr<Message> newMsg;
  rv = mMessageDatabase->GetMessage(key, getter_AddRefs(newMsg));
  newMsg.forget(newHdr);
  return rv;
}
NS_IMETHODIMP PerFolderDatabase::ListAllKeys(nsTArray<nsMsgKey>& aKeys) {
  return mMessageDatabase->ListAllKeys(mFolderId, aKeys);
}
NS_IMETHODIMP PerFolderDatabase::EnumerateMessages(
    nsIMsgEnumerator** aEnumerator) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv =
      DatabaseCore::GetStatement("GetAllMessages"_ns,
                                 "SELECT "_ns MESSAGE_SQL_FIELDS
                                 " FROM messages WHERE folderId = :folderId"_ns,
                                 getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmtClone;
  rv = stmt->Clone(getter_AddRefs(stmtClone));
  NS_ENSURE_SUCCESS(rv, rv);

  stmtClone->BindInt64ByName("folderId"_ns, mFolderId);

  RefPtr<MessageEnumerator> enumerator =
      new MessageEnumerator(mMessageDatabase, stmtClone);
  enumerator.forget(aEnumerator);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::ReverseEnumerateMessages(
    nsIMsgEnumerator** aEnumerator) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetAllMessagesReverse"_ns,
      "SELECT "_ns MESSAGE_SQL_FIELDS
      " FROM messages WHERE folderId = :folderId ORDER BY id DESC"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmtClone;
  rv = stmt->Clone(getter_AddRefs(stmtClone));
  NS_ENSURE_SUCCESS(rv, rv);

  stmtClone->BindInt64ByName("folderId"_ns, mFolderId);

  RefPtr<MessageEnumerator> enumerator =
      new MessageEnumerator(mMessageDatabase, stmtClone);
  enumerator.forget(aEnumerator);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::EnumerateThreads(
    nsIMsgThreadEnumerator** aEnumerator) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv =
      DatabaseCore::GetStatement("GetAllMessages"_ns,
                                 "SELECT "_ns MESSAGE_SQL_FIELDS
                                 " FROM messages WHERE folderId = :folderId"_ns,
                                 getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmtClone;
  rv = stmt->Clone(getter_AddRefs(stmtClone));
  NS_ENSURE_SUCCESS(rv, rv);

  stmtClone->BindInt64ByName("folderId"_ns, mFolderId);

  RefPtr<ThreadEnumerator> enumerator =
      new ThreadEnumerator(mMessageDatabase, stmtClone);
  enumerator.forget(aEnumerator);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetFilterEnumerator(
    const nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms, bool reverse,
    nsIMsgEnumerator** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SyncCounts() {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetThreadContainingMsgHdr(
    nsIMsgDBHdr* msgHdr, nsIMsgThread** thread) {
  NS_ENSURE_ARG(msgHdr);
  NS_ENSURE_ARG_POINTER(thread);

  Message* message = (Message*)(msgHdr);
  NS_ADDREF(*thread = new Thread(message));
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::MarkNotNew(nsMsgKey aKey,
                                            nsIDBChangeListener* aInstigator) {
  mNewList.RemoveElement(aKey);
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::New, false);
}
NS_IMETHODIMP PerFolderDatabase::MarkMDNNeeded(
    nsMsgKey aKey, bool aNeeded, nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(
      aKey, nsMsgMessageFlags::MDNReportNeeded, aNeeded);
}
NS_IMETHODIMP PerFolderDatabase::MarkMDNSent(nsMsgKey aKey, bool aSent,
                                             nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(
      aKey, nsMsgMessageFlags::MDNReportSent, aSent);
}
NS_IMETHODIMP PerFolderDatabase::MarkRead(nsMsgKey aKey, bool aRead,
                                          nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Read, aRead);
}
NS_IMETHODIMP PerFolderDatabase::MarkMarked(nsMsgKey aKey, bool aMarked,
                                            nsIDBChangeListener* instigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Marked,
                                          aMarked);
}
NS_IMETHODIMP PerFolderDatabase::MarkReplied(nsMsgKey aKey, bool aReplied,
                                             nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Replied,
                                          aReplied);
}
NS_IMETHODIMP PerFolderDatabase::MarkForwarded(
    nsMsgKey aKey, bool aForwarded, nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Forwarded,
                                          aForwarded);
}
NS_IMETHODIMP PerFolderDatabase::MarkRedirected(
    nsMsgKey aKey, bool aRedirected, nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Redirected,
                                          aRedirected);
}
NS_IMETHODIMP PerFolderDatabase::MarkHasAttachments(
    nsMsgKey aKey, bool aHasAttachments, nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Attachment,
                                          aHasAttachments);
}
NS_IMETHODIMP PerFolderDatabase::MarkOffline(nsMsgKey aKey, bool aOffline,
                                             nsIDBChangeListener* instigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Offline,
                                          aOffline);
}
NS_IMETHODIMP PerFolderDatabase::MarkImapDeleted(
    nsMsgKey aKey, bool aDeleted, nsIDBChangeListener* instigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::IMAPDeleted,
                                          aDeleted);
}
NS_IMETHODIMP PerFolderDatabase::MarkThreadRead(
    nsIMsgThread* thread, nsIDBChangeListener* aInstigator,
    nsTArray<nsMsgKey>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::MarkThreadIgnored(
    nsIMsgThread* thread, nsMsgKey threadKey, bool bIgnored,
    nsIDBChangeListener* aInstigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::MarkThreadWatched(
    nsIMsgThread* thread, nsMsgKey threadKey, bool bWatched,
    nsIDBChangeListener* aInstigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::MarkKilled(nsMsgKey aKey, bool aIgnored,
                                            nsIDBChangeListener* aInstigator) {
  return mMessageDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Ignored,
                                          aIgnored);
}
NS_IMETHODIMP PerFolderDatabase::IsRead(nsMsgKey aKey, bool* aRead) {
  return mMessageDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Read, aRead);
}
NS_IMETHODIMP PerFolderDatabase::IsIgnored(nsMsgKey aKey, bool* aIgnored) {
  return mMessageDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Ignored,
                                          aIgnored);
}
NS_IMETHODIMP PerFolderDatabase::IsWatched(nsMsgKey aKey, bool* aWatched) {
  return mMessageDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Watched,
                                          aWatched);
}
NS_IMETHODIMP PerFolderDatabase::IsMarked(nsMsgKey aKey, bool* aMarked) {
  return mMessageDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Marked,
                                          aMarked);
}
NS_IMETHODIMP PerFolderDatabase::HasAttachments(nsMsgKey aKey,
                                                bool* aAttachments) {
  return mMessageDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Attachment,
                                          aAttachments);
}
NS_IMETHODIMP PerFolderDatabase::IsMDNSent(nsMsgKey aKey, bool* aMDNSent) {
  return mMessageDatabase->GetMessageFlag(
      aKey, nsMsgMessageFlags::MDNReportSent, aMDNSent);
}
NS_IMETHODIMP PerFolderDatabase::MarkAllRead(nsTArray<nsMsgKey>& aMarkedKeys) {
  return mMessageDatabase->MarkAllRead(mFolderId, aMarkedKeys);
}
NS_IMETHODIMP PerFolderDatabase::DeleteMessages(
    const nsTArray<nsMsgKey>& nsMsgKeys, nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::DeleteMessage(nsMsgKey aKey,
                                               nsIDBChangeListener* instigator,
                                               bool commit) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::DeleteHeader(nsIMsgDBHdr* msgHdr,
                                              nsIDBChangeListener* instigator,
                                              bool commit, bool notify) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::RemoveHeaderMdbRow(nsIMsgDBHdr* msgHdr) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::UndoDelete(nsIMsgDBHdr* msgHdr) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetStringProperty(
    nsMsgKey key, const char* propertyName, const nsACString& propertyValue) {
  return mMessageDatabase->SetMessageProperty(key, nsCString(propertyName),
                                              propertyValue);
}
NS_IMETHODIMP PerFolderDatabase::SetStringPropertyByHdr(
    nsIMsgDBHdr* msgHdr, const char* propertyName,
    const nsACString& propertyValue) {
  return msgHdr->SetStringProperty(propertyName, propertyValue);
}
NS_IMETHODIMP PerFolderDatabase::SetUint32PropertyByHdr(
    nsIMsgDBHdr* msgHdr, const char* propertyName, uint32_t propertyValue) {
  return msgHdr->SetUint32Property(propertyName, propertyValue);
}
NS_IMETHODIMP PerFolderDatabase::GetFirstNew(nsMsgKey* aFirstNew) {
  if (mNewList.IsEmpty()) {
    *aFirstNew = nsMsgKey_None;
  } else {
    *aFirstNew = mNewList[0];
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgRetentionSettings(
    nsIMsgRetentionSettings** aMsgRetentionSettings) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetMsgRetentionSettings(
    nsIMsgRetentionSettings* aMsgRetentionSettings) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ApplyRetentionSettings(
    nsIMsgRetentionSettings* aMsgRetentionSettings, bool aDeleteViaFolder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgDownloadSettings(
    nsIMsgDownloadSettings** aMsgDownloadSettings) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetMsgDownloadSettings(
    nsIMsgDownloadSettings* aMsgDownloadSettings) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::HasNew(bool* aHasNew) {
  *aHasNew = !mNewList.IsEmpty();
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::SortNewKeysIfNeeded() {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ClearNewList(bool aNotify) {
  mNewList.Clear();
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::AddToNewList(nsMsgKey aKey) {
  if (!mNewList.Contains(aKey)) {
    mNewList.AppendElement(aKey);
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetSummaryValid(bool* summaryValid) {
  *summaryValid = true;
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::SetSummaryValid(bool aSummaryValid) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ListAllOfflineMsgs(
    nsTArray<nsMsgKey>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetAttributeOnPendingHdr(
    nsIMsgDBHdr* pendingHdr, const char* property, const char* propertyVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetUint32AttributeOnPendingHdr(
    nsIMsgDBHdr* pendingHdr, const char* property, uint32_t propertyVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetUint64AttributeOnPendingHdr(
    nsIMsgDBHdr* aPendingHdr, const char* aProperty, uint64_t aPropertyVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::UpdatePendingAttributes(nsIMsgDBHdr* aNewHdr) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetLowWaterArticleNum(
    nsMsgKey* aLowWaterArticleNum) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetHighWaterArticleNum(
    nsMsgKey* aHighWaterArticleNum) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetNextPseudoMsgKey(
    nsMsgKey* aNextPseudoMsgKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetNextPseudoMsgKey(
    nsMsgKey aNextPseudoMsgKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetNextFakeOfflineMsgKey(
    nsMsgKey* aNextFakeOfflineMsgKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::CreateCollationKey(
    const nsAString& sourceString, nsTArray<uint8_t>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::CompareCollationKeys(
    const nsTArray<uint8_t>& key1, const nsTArray<uint8_t>& key2,
    int32_t* aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetDefaultViewFlags(
    nsMsgViewFlagsTypeValue* viewFlags) {
  NS_ENSURE_ARG_POINTER(viewFlags);

  Preferences::GetInt(mIsNewsFolder ? "mailnews.default_news_view_flags"
                                    : "mailnews.default_view_flags",
                      viewFlags);
  if (*viewFlags < nsMsgViewFlagsType::kNone ||
      *viewFlags >
          (nsMsgViewFlagsType::kThreadedDisplay |
           nsMsgViewFlagsType::kShowIgnored | nsMsgViewFlagsType::kUnreadOnly |
           nsMsgViewFlagsType::kExpandAll | nsMsgViewFlagsType::kGroupBySort)) {
    *viewFlags = nsMsgViewFlagsType::kNone;
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetDefaultSortType(
    nsMsgViewSortTypeValue* sortType) {
  NS_ENSURE_ARG_POINTER(sortType);

  Preferences::GetInt(mIsNewsFolder ? "mailnews.default_news_sort_type"
                                    : "mailnews.default_sort_type",
                      sortType);
  if (*sortType < nsMsgViewSortType::byDate ||
      *sortType > nsMsgViewSortType::byCorrespondent ||
      *sortType == nsMsgViewSortType::byCustom) {
    *sortType = nsMsgViewSortType::byDate;
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetDefaultSortOrder(
    nsMsgViewSortOrderValue* sortOrder) {
  NS_ENSURE_ARG_POINTER(sortOrder);

  Preferences::GetInt(mIsNewsFolder ? "mailnews.default_news_sort_order"
                                    : "mailnews.default_sort_order",
                      sortOrder);
  if (*sortOrder != nsMsgViewSortOrder::descending) {
    *sortOrder = nsMsgViewSortOrder::ascending;
  }
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrCacheSize(
    uint32_t* aMsgHdrCacheSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetMsgHdrCacheSize(uint32_t aMsgHdrCacheSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetNewList(nsTArray<nsMsgKey>& aNewList) {
  aNewList = mNewList.Clone();
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetCachedHits(
    const nsACString& aSearchFolderUri, nsIMsgEnumerator** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::RefreshCache(
    const nsACString& aSearchFolderUri, const nsTArray<nsMsgKey>& aNewHits,
    nsTArray<nsMsgKey>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::UpdateHdrInCache(
    const nsACString& aSearchFolderUri, nsIMsgDBHdr* aHdr, bool aAdd) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::HdrIsInCache(
    const nsACString& aSearchFolderUri, nsIMsgDBHdr* aHdr, bool* aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

MessageEnumerator::MessageEnumerator(MessageDatabase* aDatabase,
                                     mozIStorageStatement* aStmt)
    : mMessageDatabase(aDatabase), mStmt(aStmt) {
  mStmt->ExecuteStep(&mHasNext);
}

NS_IMETHODIMP MessageEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  NS_ENSURE_ARG_POINTER(aItem);
  *aItem = nullptr;

  if (!mHasNext) {
    return NS_ERROR_FAILURE;
  }

  RefPtr<Message> message = new Message(mMessageDatabase, mStmt);
  message.forget(aItem);
  mStmt->ExecuteStep(&mHasNext);
  return NS_OK;
}

NS_IMETHODIMP MessageEnumerator::HasMoreElements(bool* aHasNext) {
  NS_ENSURE_ARG_POINTER(aHasNext);

  *aHasNext = mHasNext;
  return NS_OK;
}

ThreadEnumerator::ThreadEnumerator(MessageDatabase* messageDatabase,
                                   mozIStorageStatement* stmt)
    : mMessageDatabase(messageDatabase), mStmt(stmt) {
  mStmt->ExecuteStep(&mHasNext);
}

NS_IMETHODIMP ThreadEnumerator::GetNext(nsIMsgThread** item) {
  NS_ENSURE_ARG_POINTER(item);
  *item = nullptr;

  if (!mHasNext) {
    return NS_ERROR_FAILURE;
  }

  RefPtr<Message> message = new Message(mMessageDatabase, mStmt);
  RefPtr<Thread> thread = new Thread(message);
  thread.forget(item);
  mStmt->ExecuteStep(&mHasNext);
  return NS_OK;
}

NS_IMETHODIMP ThreadEnumerator::HasMoreElements(bool* hasNext) {
  NS_ENSURE_ARG_POINTER(hasNext);

  *hasNext = mHasNext;
  return NS_OK;
}

NS_IMPL_ISUPPORTS(FolderInfo, nsIDBFolderInfo)

FolderInfo::FolderInfo(FolderDatabase* folderDatabase,
                       MessageDatabase* messageDatabase,
                       PerFolderDatabase* perFolderDatabase,
                       uint64_t folderId) {
  mFolderDatabase = folderDatabase;
  mMessageDatabase = messageDatabase;
  mPerFolderDatabase = perFolderDatabase;
  mFolderDatabase->GetFolderById(folderId, getter_AddRefs(mFolder));
}

NS_IMETHODIMP FolderInfo::GetFlags(int32_t* aFlags) {
  *aFlags = mFolder->GetFlags();
  return NS_OK;
}
NS_IMETHODIMP FolderInfo::SetFlags(int32_t aFlags) {
  return mFolderDatabase->UpdateFlags(mFolder, aFlags);
}
NS_IMETHODIMP FolderInfo::OrFlags(int32_t aFlags, int32_t* aOutFlags) {
  nsresult rv =
      mFolderDatabase->UpdateFlags(mFolder, mFolder->GetFlags() | aFlags);
  *aOutFlags = mFolder->GetFlags();
  return rv;
}
NS_IMETHODIMP FolderInfo::AndFlags(int32_t aFlags, int32_t* aOutFlags) {
  nsresult rv =
      mFolderDatabase->UpdateFlags(mFolder, mFolder->GetFlags() & aFlags);
  *aOutFlags = mFolder->GetFlags();
  return rv;
}
NS_IMETHODIMP FolderInfo::OnKeyAdded(nsMsgKey aNewKey) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetHighWater(nsMsgKey* aHighWater) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetHighWater(nsMsgKey aHighWater) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetExpiredMark(nsMsgKey* aExpiredMark) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetExpiredMark(nsMsgKey aExpiredMark) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetFolderSize(int64_t* aFolderSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetFolderSize(int64_t aFolderSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetFolderDate(uint32_t* aFolderDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetFolderDate(uint32_t aFolderDate) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::ChangeNumUnreadMessages(int32_t aDelta) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::ChangeNumMessages(int32_t aDelta) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetNumUnreadMessages(int32_t* aNumUnreadMessages) {
  uint64_t out;
  nsresult rv = mMessageDatabase->GetNumUnread(mFolder->GetId(), &out);
  *aNumUnreadMessages = (int32_t)out;
  return rv;
}
NS_IMETHODIMP FolderInfo::SetNumUnreadMessages(int32_t aNumUnreadMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetNumMessages(int32_t* aNumMessages) {
  uint64_t out;
  nsresult rv = mMessageDatabase->GetNumMessages(mFolder->GetId(), &out);
  *aNumMessages = (int32_t)out;
  return rv;
}
NS_IMETHODIMP FolderInfo::SetNumMessages(int32_t aNumMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetExpungedBytes(int64_t* aExpungedBytes) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetExpungedBytes(int64_t aExpungedBytes) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetImapUidValidity(int32_t* aImapUidValidity) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetImapUidValidity(int32_t aImapUidValidity) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetVersion(uint32_t* aVersion) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetVersion(uint32_t aVersion) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetImapTotalPendingMessages(
    int32_t* aImapTotalPendingMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetImapTotalPendingMessages(
    int32_t aImapTotalPendingMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetImapUnreadPendingMessages(
    int32_t* aImapUnreadPendingMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetImapUnreadPendingMessages(
    int32_t aImapUnreadPendingMessages) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetUserSortOrder(uint32_t* userSortOrder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetUserSortOrder(uint32_t userSortOrder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetViewType(nsMsgViewTypeValue* viewType) {
  *viewType = nsMsgViewType::eShowAllThreads;
  return NS_OK;
}
NS_IMETHODIMP FolderInfo::SetViewType(nsMsgViewTypeValue aViewType) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetViewFlags(nsMsgViewFlagsTypeValue* viewFlags) {
  nsMsgViewFlagsTypeValue defaultViewFlags;
  mPerFolderDatabase->GetDefaultViewFlags(&defaultViewFlags);
  return GetUint32Property("viewFlags", defaultViewFlags, (uint32_t*)viewFlags);
}
NS_IMETHODIMP FolderInfo::SetViewFlags(nsMsgViewFlagsTypeValue viewFlags) {
  return SetUint32Property("viewFlags", viewFlags);
}
NS_IMETHODIMP FolderInfo::GetSortType(nsMsgViewSortTypeValue* sortType) {
  nsMsgViewSortTypeValue defaultSortType;
  mPerFolderDatabase->GetDefaultSortType(&defaultSortType);
  return GetUint32Property("sortType", defaultSortType, (uint32_t*)sortType);
}
NS_IMETHODIMP FolderInfo::SetSortType(nsMsgViewSortTypeValue sortType) {
  return SetUint32Property("sortType", sortType);
}
NS_IMETHODIMP FolderInfo::GetSortOrder(nsMsgViewSortOrderValue* sortOrder) {
  nsMsgViewSortOrderValue defaultSortOrder;
  mPerFolderDatabase->GetDefaultSortOrder(&defaultSortOrder);
  return GetUint32Property("sortOrder", defaultSortOrder, (uint32_t*)sortOrder);
}
NS_IMETHODIMP FolderInfo::SetSortOrder(nsMsgViewSortOrderValue sortOrder) {
  return SetUint32Property("sortOrder", sortOrder);
}
NS_IMETHODIMP FolderInfo::ChangeExpungedBytes(int32_t aDelta) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetCharProperty(const char* propertyName,
                                          nsACString& propertyValue) {
  return mFolderDatabase->GetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), propertyValue);
}
NS_IMETHODIMP FolderInfo::SetCharProperty(const char* propertyName,
                                          const nsACString& propertyValue) {
  return mFolderDatabase->SetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), propertyValue);
}
NS_IMETHODIMP FolderInfo::GetUint32Property(const char* propertyName,
                                            uint32_t defaultValue,
                                            uint32_t* propertyValue) {
  *propertyValue = defaultValue;
  return mFolderDatabase->GetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), (int64_t*)propertyValue);
}
NS_IMETHODIMP FolderInfo::SetUint32Property(const char* propertyName,
                                            uint32_t propertyValue) {
  return mFolderDatabase->SetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), (int64_t)propertyValue);
}
NS_IMETHODIMP FolderInfo::GetInt64Property(const char* propertyName,
                                           int64_t defaultValue,
                                           int64_t* propertyValue) {
  *propertyValue = defaultValue;
  return mFolderDatabase->GetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), propertyValue);
}
NS_IMETHODIMP FolderInfo::SetInt64Property(const char* propertyName,
                                           int64_t propertyValue) {
  return mFolderDatabase->SetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), propertyValue);
}
NS_IMETHODIMP FolderInfo::GetBooleanProperty(const char* propertyName,
                                             bool defaultValue,
                                             bool* propertyValue) {
  *propertyValue = defaultValue;
  return mFolderDatabase->GetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), (int64_t*)propertyValue);
}
NS_IMETHODIMP FolderInfo::SetBooleanProperty(const char* propertyName,
                                             bool propertyValue) {
  return mFolderDatabase->SetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), (int64_t)propertyValue);
}
NS_IMETHODIMP FolderInfo::GetProperty(const char* propertyName,
                                      nsAString& propertyValue) {
  nsAutoCString value;
  nsresult rv = mFolderDatabase->GetFolderProperty(
      mFolder->GetId(), nsCString(propertyName), value);
  NS_ENSURE_SUCCESS(rv, rv);
  propertyValue.Assign(NS_ConvertUTF8toUTF16(value));
  return NS_OK;
}
NS_IMETHODIMP FolderInfo::SetProperty(const char* propertyName,
                                      const nsAString& propertyValue) {
  return mFolderDatabase->SetFolderProperty(
      mFolder->GetId(), nsCString(propertyName),
      NS_ConvertUTF16toUTF8(propertyValue));
}
NS_IMETHODIMP FolderInfo::GetTransferInfo(nsIPropertyBag2** _retval) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::InitFromTransferInfo(nsIPropertyBag2* transferInfo) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetLocale(nsAString& aLocale) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetLocale(const nsAString& aLocale) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetMailboxName(nsACString& aMailboxName) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetMailboxName(const nsACString& aMailboxName) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetKnownArtsSet(char** aKnownArtsSet) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::SetKnownArtsSet(const char* aKnownArtsSet) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP FolderInfo::GetFolderName(nsACString& aFolderName) {
  return mFolder->GetName(aFolderName);
}
NS_IMETHODIMP FolderInfo::SetFolderName(const nsACString& aFolderName) {
  return mFolderDatabase->UpdateName(mFolder, aFolderName);
}

}  // namespace mozilla::mailnews
