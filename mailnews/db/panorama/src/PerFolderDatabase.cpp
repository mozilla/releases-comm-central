/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "PerFolderDatabase.h"

#include "DatabaseCore.h"
#include "Message.h"
#include "MessageDatabase.h"
#include "nsMsgMessageFlags.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(PerFolderDatabase, nsIDBChangeAnnouncer, nsIMsgDatabase)

NS_IMETHODIMP PerFolderDatabase::AddListener(nsIDBChangeListener* listener) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::RemoveListener(nsIDBChangeListener* listener) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrChangeAll(
    nsIMsgDBHdr* aHdrChanged, uint32_t aOldFlags, uint32_t aNewFlags,
    nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrAddedAll(
    nsIMsgDBHdr* aHdrAdded, nsMsgKey parentKey, int32_t flags,
    nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::NotifyHdrDeletedAll(
    nsIMsgDBHdr* aHdrDeleted, nsMsgKey parentKey, int32_t flags,
    nsIDBChangeListener* instigator) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetDatabaseSize(int64_t* aDatabaseSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForKey(nsMsgKey aKey,
                                                 nsIMsgDBHdr** aMsgHdr) {
  Message* message;
  nsresult rv = mDatabase->GetMessage(aKey, &message);
  if (NS_FAILED(rv) || message->mFolderId != mFolderId) {
    return NS_ERROR_ILLEGAL_VALUE;
  }
  NS_IF_ADDREF(*aMsgHdr = message);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrForMessageID(const char* messageID,
                                                       nsIMsgDBHdr** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
  Message* message;
  nsresult rv = mDatabase->GetMessage(aKey, &message);
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
NS_IMETHODIMP PerFolderDatabase::ListAllKeys(nsTArray<nsMsgKey>& aKeys) {
  return mDatabase->ListAllKeys(mFolderId, aKeys);
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

  MessageEnumerator* enumerator = new MessageEnumerator(mDatabase, stmtClone);
  NS_IF_ADDREF(*aEnumerator = enumerator);
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

  MessageEnumerator* enumerator = new MessageEnumerator(mDatabase, stmtClone);
  NS_IF_ADDREF(*aEnumerator = enumerator);
  return NS_OK;
}
NS_IMETHODIMP PerFolderDatabase::EnumerateThreads(
    nsIMsgThreadEnumerator** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
    nsIMsgDBHdr* msgHdr, nsIMsgThread** aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::MarkNotNew(nsMsgKey aKey,
                                            nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::New, false);
}
NS_IMETHODIMP PerFolderDatabase::MarkMDNNeeded(
    nsMsgKey aKey, bool aNeeded, nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::MDNReportNeeded,
                                   aNeeded);
}
NS_IMETHODIMP PerFolderDatabase::MarkMDNSent(nsMsgKey aKey, bool aSent,
                                             nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::MDNReportSent,
                                   aSent);
}
NS_IMETHODIMP PerFolderDatabase::MarkRead(nsMsgKey aKey, bool aRead,
                                          nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Read, aRead);
}
NS_IMETHODIMP PerFolderDatabase::MarkMarked(nsMsgKey aKey, bool aMarked,
                                            nsIDBChangeListener* instigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Marked, aMarked);
}
NS_IMETHODIMP PerFolderDatabase::MarkReplied(nsMsgKey aKey, bool aReplied,
                                             nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Replied, aReplied);
}
NS_IMETHODIMP PerFolderDatabase::MarkForwarded(
    nsMsgKey aKey, bool aForwarded, nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Forwarded,
                                   aForwarded);
}
NS_IMETHODIMP PerFolderDatabase::MarkRedirected(
    nsMsgKey aKey, bool aRedirected, nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Redirected,
                                   aRedirected);
}
NS_IMETHODIMP PerFolderDatabase::MarkHasAttachments(
    nsMsgKey aKey, bool aHasAttachments, nsIDBChangeListener* aInstigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Attachment,
                                   aHasAttachments);
}
NS_IMETHODIMP PerFolderDatabase::MarkOffline(nsMsgKey aKey, bool aOffline,
                                             nsIDBChangeListener* instigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Offline, aOffline);
}
NS_IMETHODIMP PerFolderDatabase::MarkImapDeleted(
    nsMsgKey aKey, bool aDeleted, nsIDBChangeListener* instigator) {
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::IMAPDeleted,
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
  return mDatabase->SetMessageFlag(aKey, nsMsgMessageFlags::Ignored, aIgnored);
}
NS_IMETHODIMP PerFolderDatabase::IsRead(nsMsgKey aKey, bool* aRead) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Read, aRead);
}
NS_IMETHODIMP PerFolderDatabase::IsIgnored(nsMsgKey aKey, bool* aIgnored) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Ignored, aIgnored);
}
NS_IMETHODIMP PerFolderDatabase::IsWatched(nsMsgKey aKey, bool* aWatched) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Watched, aWatched);
}
NS_IMETHODIMP PerFolderDatabase::IsMarked(nsMsgKey aKey, bool* aMarked) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Marked, aMarked);
}
NS_IMETHODIMP PerFolderDatabase::HasAttachments(nsMsgKey aKey,
                                                bool* aAttachments) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::Attachment,
                                   aAttachments);
}
NS_IMETHODIMP PerFolderDatabase::IsMDNSent(nsMsgKey aKey, bool* aMDNSent) {
  return mDatabase->GetMessageFlag(aKey, nsMsgMessageFlags::MDNReportSent,
                                   aMDNSent);
}
NS_IMETHODIMP PerFolderDatabase::MarkAllRead(nsTArray<nsMsgKey>& aMarkedKeys) {
  return mDatabase->MarkAllRead(mFolderId, aMarkedKeys);
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
NS_IMETHODIMP PerFolderDatabase::SetStringProperty(nsMsgKey aKey,
                                                   const char* aProperty,
                                                   const nsACString& aValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetStringPropertyByHdr(
    nsIMsgDBHdr* msgHdr, const char* aProperty, const nsACString& aValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetUint32PropertyByHdr(nsIMsgDBHdr* aMsgHdr,
                                                        const char* aProperty,
                                                        uint32_t aValue) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetFirstNew(nsMsgKey* aFirstNew) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
NS_IMETHODIMP PerFolderDatabase::HasNew(bool* aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SortNewKeysIfNeeded() {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::ClearNewList(bool notify) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::AddToNewList(nsMsgKey key) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetSummaryValid(bool* aSummaryValid) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
    nsMsgViewFlagsTypeValue* aDefaultViewFlags) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetDefaultSortType(
    nsMsgViewSortTypeValue* aDefaultSortType) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetDefaultSortOrder(
    nsMsgViewSortOrderValue* aDefaultSortOrder) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetMsgHdrCacheSize(
    uint32_t* aMsgHdrCacheSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::SetMsgHdrCacheSize(uint32_t aMsgHdrCacheSize) {
  return NS_ERROR_NOT_IMPLEMENTED;
}
NS_IMETHODIMP PerFolderDatabase::GetNewList(nsTArray<nsMsgKey>& aRetVal) {
  return NS_ERROR_NOT_IMPLEMENTED;
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
    : mDatabase(aDatabase), mStmt(aStmt) {
  mStmt->ExecuteStep(&mHasNext);
}

NS_IMETHODIMP MessageEnumerator::GetNext(nsIMsgDBHdr** aItem) {
  NS_ENSURE_ARG_POINTER(aItem);
  *aItem = nullptr;

  if (!mHasNext) {
    return NS_ERROR_FAILURE;
  }

  NS_IF_ADDREF(*aItem = new Message(mDatabase, mStmt));
  mStmt->ExecuteStep(&mHasNext);
  return NS_OK;
}

NS_IMETHODIMP MessageEnumerator::HasMoreElements(bool* aHasNext) {
  NS_ENSURE_ARG_POINTER(aHasNext);

  *aHasNext = mHasNext;
  return NS_OK;
}

}  // namespace mozilla::mailnews
