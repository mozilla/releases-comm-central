/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MessageDatabase.h"

#include "DatabaseCore.h"
#include "DatabaseUtils.h"
#include "Message.h"
#include "mozilla/Logging.h"
#include "nsMsgMessageFlags.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;

namespace mozilla::mailnews {

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
  stmt->BindUTF8StringByName("messageId"_ns, aMessageId);
  stmt->BindInt64ByName("date"_ns, aDate);
  stmt->BindUTF8StringByName("sender"_ns, aSender);
  stmt->BindUTF8StringByName("subject"_ns, aSubject);
  stmt->BindInt64ByName("flags"_ns, aFlags);
  stmt->BindUTF8StringByName("tags"_ns, aTags);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  RefPtr<Message> message = new Message(this);
  message->mId = (nsMsgKey)(stmt->AsInt64(0));
  message->mFolderId = aFolderId;
  message->mMessageId = aMessageId;
  message->mDate = aDate;
  message->mSender = aSender;
  message->mSubject = aSubject;
  message->mFlags = aFlags;
  message->mTags = aTags;

  stmt->Reset();

  for (RefPtr<MessageListener> messageListener :
       mMessageListeners.EndLimitedRange()) {
    messageListener->OnMessageAdded(message);
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
  RefPtr<Message> message = new Message(this);
  message->mId = aKey;
  message->mFolderId = stmt->AsInt64(0);
  message->mMessageId = stmt->AsSharedUTF8String(1, &len);
  message->mDate = stmt->AsDouble(2);
  message->mSender = stmt->AsSharedUTF8String(3, &len);
  message->mSubject = stmt->AsSharedUTF8String(4, &len);
  message->mFlags = stmt->AsInt64(5);
  message->mTags = stmt->AsSharedUTF8String(6, &len);

  stmt->Reset();

  for (RefPtr<MessageListener> messageListener :
       mMessageListeners.EndLimitedRange()) {
    messageListener->OnMessageRemoved(message);
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
  DatabaseCore::GetStatement("GetMessageByKey"_ns,
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

  RefPtr<Message> message = new Message(this, stmt);
  message.forget(aMessage);
  stmt->Reset();

  return NS_OK;
}

nsresult MessageDatabase::GetMessageForMessageID(uint64_t aFolderId,
                                                 const nsACString& aMessageId,
                                                 Message** aMessage) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "GetMessageByMessageId"_ns,
      "SELECT "_ns MESSAGE_SQL_FIELDS
      " FROM messages WHERE folderId = :folderId AND messageId = :messageId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, aFolderId);
  stmt->BindUTF8StringByName("messageId"_ns, aMessageId);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  RefPtr<Message> message = new Message(this, stmt);
  message.forget(aMessage);
  stmt->Reset();

  return NS_OK;
}

nsresult MessageDatabase::GetMessageFlag(nsMsgKey aKey, uint64_t aFlag,
                                         bool* aHasFlag) {
  RefPtr<Message> message;
  GetMessage(aKey, getter_AddRefs(message));
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

nsresult MessageDatabase::GetMessageProperties(
    nsMsgKey aKey, nsTArray<nsCString>& aProperties) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetMessageProperties"_ns,
      "SELECT name FROM message_properties WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, aKey);

  aProperties.Clear();
  bool hasResult;
  uint32_t len;
  nsAutoCString name;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    name = stmt->AsSharedUTF8String(0, &len);
    aProperties.AppendElement(name);
  }
  stmt->Reset();

  return NS_OK;
}

nsresult MessageDatabase::GetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             nsACString& aValue) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetMessageProperty"_ns,
      "SELECT value FROM message_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, aKey);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(aName));

  aValue.Truncate();
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    uint32_t len;
    aValue = stmt->AsSharedUTF8String(0, &len);
  }
  stmt->Reset();

  return rv;
}

nsresult MessageDatabase::GetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             uint32_t* aValue) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetMessageProperty"_ns,
      "SELECT value FROM message_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, aKey);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(aName));

  *aValue = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *aValue = stmt->AsInt64(0);  // Strange cast, can't do much about it.
  }
  stmt->Reset();

  return rv;
}

nsresult MessageDatabase::SetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             const nsACString& aValue) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "SetMessageProperty"_ns,
      "REPLACE INTO message_properties (id, name, value) VALUES (:id, :name, :value)"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, aKey);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(aName));
  stmt->BindUTF8StringByName("value"_ns, aValue);
  return stmt->Execute();
}

nsresult MessageDatabase::SetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             uint32_t aValue) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "SetMessageProperty"_ns,
      "REPLACE INTO message_properties (id, name, value) VALUES (:id, :name, :value)"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, aKey);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(aName));
  stmt->BindInt64ByName("value"_ns, aValue);
  return stmt->Execute();
}

NS_IMETHODIMP_(void)
MessageDatabase::AddMessageListener(MessageListener* aListener) {
  mMessageListeners.AppendElement(aListener);
}

NS_IMETHODIMP_(void)
MessageDatabase::RemoveMessageListener(MessageListener* aListener) {
  mMessageListeners.RemoveElement(aListener);
}

}  // namespace mozilla::mailnews
