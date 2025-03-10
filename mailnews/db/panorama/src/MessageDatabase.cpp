/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MessageDatabase.h"

#include "DatabaseCore.h"
#include "Message.h"
#include "mozilla/Logging.h"
#include "nsMsgMessageFlags.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;

namespace mozilla {
namespace mailnews {

extern LazyLogModule gPanoramaLog;  // Defined by DatabaseCore.

NS_IMPL_ISUPPORTS(MessageDatabase, nsIMessageDatabase)

void MessageDatabase::Startup() {
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("MessageDatabase starting up"));
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("MessageDatabase startup complete"));
}

void MessageDatabase::Shutdown() {
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("MessageDatabase shutting down"));
  mMessageListeners.Clear();
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("MessageDatabase shutdown complete"));
}

NS_IMETHODIMP
MessageDatabase::GetTotalCount(uint64_t* aTotalCount) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("TotalCount"_ns,
                             "SELECT COUNT(*) FROM messages"_ns,
                             getter_AddRefs(stmt));

  *aTotalCount = 0;

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  if (NS_SUCCEEDED(rv) && hasResult) {
    *aTotalCount = stmt->AsInt64(0);
  }
  stmt->Reset();

  return rv;
}

NS_IMETHODIMP MessageDatabase::AddMessage(
    uint64_t aFolderId, const nsACString& aMessageId, PRTime aDate,
    const nsACString& aSender, const nsACString& aSubject, uint64_t aFlags,
    const nsACString& aTags, nsMsgKey* aKey) {
  // TODO: normalise

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("AddMessage"_ns,
                             "INSERT INTO messages ( \
                                folderId, messageId, date, sender, subject, flags, tags \
                              ) VALUES ( \
                                :folderId, :messageId, :date, :sender, :subject, :flags, :tags \
                              ) RETURNING id"_ns,
                             getter_AddRefs(stmt));

  stmt->BindInt64ByName("folderId"_ns, aFolderId);
  stmt->BindStringByName("messageId"_ns, NS_ConvertUTF8toUTF16(aMessageId));
  stmt->BindInt64ByName("date"_ns, aDate);
  stmt->BindStringByName("sender"_ns, NS_ConvertUTF8toUTF16(aSender));
  stmt->BindStringByName("subject"_ns, NS_ConvertUTF8toUTF16(aSubject));
  stmt->BindInt64ByName("flags"_ns, aFlags);
  stmt->BindStringByName("tags"_ns, NS_ConvertUTF8toUTF16(aTags));

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  Message* message = new Message(this);
  message->mId = (nsMsgKey)(stmt->AsInt64(0));
  message->mMessageId = aMessageId;
  message->mDate = aDate;
  message->mSender = aSender;
  message->mSubject = aSubject;
  message->mFolderId = aFolderId;
  message->mFlags = aFlags;
  message->mTags = aTags;

  stmt->Reset();

  nsTObserverArray<MessageListener*>::ForwardIterator iter(mMessageListeners);
  while (iter.HasMore()) {
    MessageListener* messageListener = iter.GetNext();
    messageListener->OnMessageAdded(nullptr, message);
  }

  *aKey = message->mId;
  return NS_OK;
}

NS_IMETHODIMP MessageDatabase::RemoveMessage(nsMsgKey aKey) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("RemoveMessage"_ns,
                             "DELETE FROM messages \
                              WHERE id = :id \
                              RETURNING folderId, messageId, date, sender, subject, flags, tags"_ns,
                             getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, aKey);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  uint32_t len;
  Message* message = new Message(this);
  message->mId = aKey;
  message->mFolderId = stmt->AsInt64(0);
  message->mMessageId = stmt->AsSharedUTF8String(1, &len);
  message->mDate = stmt->AsDouble(2);
  message->mSender = stmt->AsSharedUTF8String(3, &len);
  message->mSubject = stmt->AsSharedUTF8String(4, &len);
  message->mFlags = stmt->AsInt64(5);
  message->mTags = stmt->AsSharedUTF8String(6, &len);

  stmt->Reset();

  nsTObserverArray<MessageListener*>::ForwardIterator iter(mMessageListeners);
  while (iter.HasMore()) {
    MessageListener* messageListener = iter.GetNext();
    messageListener->OnMessageRemoved(nullptr, message);
  }

  return NS_OK;
}

nsresult MessageDatabase::ListAllKeys(uint64_t aFolderId,
                                      nsTArray<nsMsgKey>& aKeys) {
  aKeys.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "ListAllKeys"_ns, "SELECT id FROM messages WHERE folderId = :folderId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, aFolderId);

  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    aKeys.AppendElement((nsMsgKey)(stmt->AsInt64(0)));
  }

  stmt->Reset();
  return NS_OK;
}

nsresult MessageDatabase::GetMessage(nsMsgKey aKey, Message** aMessage) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("GetMessage"_ns,
                             "SELECT "_ns MESSAGE_SQL_FIELDS
                             " FROM messages WHERE id = :id"_ns,
                             getter_AddRefs(stmt));
  stmt->BindInt64ByName("id"_ns, (uint64_t)aKey);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  *aMessage = new Message(this, stmt);
  stmt->Reset();

  return NS_OK;
}

nsresult MessageDatabase::GetMessageFlag(nsMsgKey aKey, uint64_t aFlag,
                                         bool* aHasFlag) {
  Message* message;
  GetMessage(aKey, &message);
  *aHasFlag = message->mFlags & aFlag;
  return NS_OK;
}

nsresult MessageDatabase::SetMessageFlag(nsMsgKey aKey, uint64_t aFlag,
                                         bool aSetFlag) {
  nsCOMPtr<mozIStorageStatement> stmt;
  if (aSetFlag) {
    DatabaseCore::GetStatement(
        "SetMessageFlag"_ns,
        "UPDATE messages SET flags = flags | :flag WHERE id = :id"_ns,
        getter_AddRefs(stmt));
  } else {
    DatabaseCore::GetStatement(
        "MessageClearFlag"_ns,
        "UPDATE messages SET flags = flags & ~:flag WHERE id = :id"_ns,
        getter_AddRefs(stmt));
  }

  stmt->BindInt64ByName("id"_ns, aKey);
  stmt->BindInt64ByName("flag"_ns, aFlag);
  return stmt->Execute();
}

nsresult MessageDatabase::SetMessageFlags(uint64_t aId, uint64_t aFlags) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "SetMessageFlags"_ns,
      "UPDATE messages SET flags = :flags WHERE id = :id"_ns,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, aId);
  stmt->BindInt64ByName("flags"_ns, aFlags);
  return stmt->Execute();
}

nsresult MessageDatabase::MarkAllRead(uint64_t aFolderId,
                                      nsTArray<nsMsgKey>& aMarkedKeys) {
  aMarkedKeys.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "MarkAllRead"_ns,
      "UPDATE messages SET flags = flags | :flag WHERE folderId = :folderId AND flags & :flag = 0 RETURNING id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("flag"_ns, nsMsgMessageFlags::Read);
  stmt->BindInt64ByName("folderId"_ns, aFolderId);

  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    aMarkedKeys.AppendElement((nsMsgKey)(stmt->AsInt64(0)));
  }
  stmt->Reset();

  return NS_OK;
}

NS_IMETHODIMP_(void)
MessageDatabase::AddMessageListener(MessageListener* aListener) {
  mMessageListeners.AppendElement(aListener);
}

NS_IMETHODIMP_(void)
MessageDatabase::RemoveMessageListener(MessageListener* aListener) {
  mMessageListeners.RemoveElement(aListener);
}

}  // namespace mailnews
}  // namespace mozilla
