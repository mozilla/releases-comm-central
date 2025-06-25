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
    const nsACString& aSender, const nsACString& aRecipients,
    const nsACString& aCcList, const nsACString& aBccList,
    const nsACString& aSubject, uint64_t aFlags, const nsACString& aTags,
    nsMsgKey* aKey) {
  nsCOMPtr<mozIStorageStatement> stmt;
  // Duplicate statement! Also in FolderMigrator::SetupAndRun.
  DatabaseCore::GetStatement("AddMessage"_ns,
                             "INSERT INTO messages ( \
                                folderId, messageId, date, sender, recipients, ccList, bccList, subject, flags, tags \
                              ) VALUES ( \
                                :folderId, :messageId, :date, :sender, :recipients, :ccList, :bccList, :subject, :flags, :tags \
                              ) RETURNING "_ns MESSAGE_SQL_FIELDS,
                             getter_AddRefs(stmt));

  stmt->BindInt64ByName("folderId"_ns, aFolderId);
  stmt->BindUTF8StringByName("messageId"_ns,
                             DatabaseUtils::Normalize(aMessageId));
  stmt->BindInt64ByName("date"_ns, aDate);
  stmt->BindUTF8StringByName("sender"_ns, DatabaseUtils::Normalize(aSender));
  stmt->BindUTF8StringByName("recipients"_ns,
                             DatabaseUtils::Normalize(aRecipients));
  stmt->BindUTF8StringByName("ccList"_ns, DatabaseUtils::Normalize(aCcList));
  stmt->BindUTF8StringByName("bccList"_ns, DatabaseUtils::Normalize(aBccList));
  stmt->BindUTF8StringByName("subject"_ns, DatabaseUtils::Normalize(aSubject));
  stmt->BindInt64ByName("flags"_ns, aFlags);
  stmt->BindUTF8StringByName("tags"_ns, DatabaseUtils::Normalize(aTags));

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  RefPtr<Message> message = new Message(stmt);
  stmt->Reset();

  // Update the thread columns on the newly inserted row. We're assuming the
  // message being added is at the root of a thread, which uses the row's id
  // value as threadId, so we can't do this in one insert query. At some point
  // in the future we'll handle messages with a known parent differently and
  // avoid this second query.

  // Duplicate statement! Also in FolderMigrator::HandleCompletion.
  DatabaseCore::GetStatement(
      "UpdateThreadInfo"_ns,
      "UPDATE messages SET threadId = :threadId, threadParent = :threadParent WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("id"_ns, message->mId);
  stmt->BindInt64ByName("threadId"_ns, message->mId);
  stmt->BindInt64ByName("threadParent"_ns, 0);
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  for (RefPtr<MessageListener> messageListener :
       mMessageListeners.EndLimitedRange()) {
    messageListener->OnMessageAdded(message);
  }

  *aKey = message->mId;
  return NS_OK;
}

NS_IMETHODIMP MessageDatabase::RemoveMessage(nsMsgKey aKey) {
  MOZ_ASSERT(aKey != nsMsgKey_None);

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("RemoveMessage_properties"_ns,
                             "DELETE FROM message_properties WHERE id = :id"_ns,
                             getter_AddRefs(stmt));
  stmt->BindInt64ByName("id"_ns, (int64_t)aKey);
  nsresult rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);
  stmt = nullptr;

  DatabaseCore::GetStatement(
      "RemoveMessage"_ns,
      "DELETE FROM messages WHERE id = :id RETURNING "_ns MESSAGE_SQL_FIELDS,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, aKey);

  bool hasResult;
  rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  RefPtr<Message> message = new Message(stmt);
  stmt->Reset();

  for (RefPtr<MessageListener> messageListener :
       mMessageListeners.EndLimitedRange()) {
    messageListener->OnMessageRemoved(message);
  }

  return NS_OK;
}

nsresult MessageDatabase::ListAllKeys(uint64_t folderId,
                                      nsTArray<nsMsgKey>& keys) {
  keys.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "ListAllKeys"_ns, "SELECT id FROM messages WHERE folderId = :folderId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, folderId);

  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    keys.AppendElement((nsMsgKey)(stmt->AsInt64(0)));
  }

  stmt->Reset();
  return NS_OK;
}

nsresult MessageDatabase::ListThreadKeys(uint64_t folderId, uint64_t parent,
                                         uint64_t threadId,
                                         nsTArray<nsMsgKey>& keys) {
  keys.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "ListThreadKeys"_ns,
      "WITH RECURSIVE parents("
      "  id, parent, level, folderId"
      ") AS ("
      "  VALUES(:parent, 0, 0, :folderId)"
      "  UNION ALL"
      "  SELECT"
      "    m.id, m.threadParent, p.level + 1 AS next_level, m.folderId"
      "  FROM"
      "    messages m, parents p ON m.threadParent = p.id"
      "  WHERE threadId = :threadId"
      "  ORDER BY next_level DESC, m.id"
      ")"
      "SELECT id FROM parents WHERE id > 0 AND folderId = :folderId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("parent"_ns, parent);
  stmt->BindInt64ByName("threadId"_ns, threadId);

  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    keys.AppendElement((nsMsgKey)(stmt->AsInt64(0)));
  }

  stmt->Reset();
  return NS_OK;
}

nsresult MessageDatabase::GetThreadMaxDate(uint64_t folderId, uint64_t threadId,
                                           uint64_t* maxDate) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "GetThreadMaxDate"_ns,
      "SELECT MAX(date) AS maxDate FROM messages WHERE folderId = :folderId AND threadId = :threadId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("threadId"_ns, threadId);

  *maxDate = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *maxDate = (uint64_t)stmt->AsInt64(0);
  }
  stmt->Reset();
  return NS_OK;
}

nsresult MessageDatabase::CountThreadKeys(uint64_t folderId, uint64_t threadId,
                                          uint64_t* numMessages) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "CountThreadKeys"_ns,
      "SELECT COUNT(*) AS numMessages FROM messages WHERE folderId = :folderId AND threadId = :threadId"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("threadId"_ns, threadId);

  *numMessages = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *numMessages = (uint64_t)stmt->AsInt64(0);
  }
  stmt->Reset();
  return NS_OK;
}

nsresult MessageDatabase::ListThreadChildKeys(uint64_t folderId,
                                              uint64_t parent,
                                              nsTArray<nsMsgKey>& keys) {
  keys.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "ListThreadChildKeys"_ns,
      "SELECT id FROM messages WHERE folderId = :folderId AND threadParent = :parent"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("parent"_ns, parent);

  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    keys.AppendElement((nsMsgKey)(stmt->AsInt64(0)));
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

  RefPtr<Message> message = new Message(stmt);
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

  RefPtr<Message> message = new Message(stmt);
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

nsresult MessageDatabase::SetMessageFlag(nsMsgKey key, uint64_t flag,
                                         bool setFlag) {
  RefPtr<Message> message;
  nsresult rv = GetMessage(key, getter_AddRefs(message));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmt;
  if (setFlag) {
    return SetMessageFlagsInternal(message, message->mFlags | flag);
  } else {
    return SetMessageFlagsInternal(message, message->mFlags & ~flag);
  }
}

nsresult MessageDatabase::SetMessageFlags(nsMsgKey key, uint64_t newFlags) {
  RefPtr<Message> message;
  nsresult rv = GetMessage(key, getter_AddRefs(message));
  NS_ENSURE_SUCCESS(rv, rv);

  return SetMessageFlagsInternal(message, newFlags);
}

nsresult MessageDatabase::SetMessageFlagsInternal(Message* message,
                                                  uint64_t newFlags) {
  uint64_t oldFlags = message->mFlags;
  if (newFlags == oldFlags) {
    return NS_OK;
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "SetMessageFlags"_ns,
      "UPDATE messages SET flags = :flags WHERE id = :id"_ns,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, message->mId);
  stmt->BindInt64ByName("flags"_ns, newFlags);
  nsresult rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  message->mFlags = newFlags;

  for (RefPtr<MessageListener> messageListener :
       mMessageListeners.EndLimitedRange()) {
    messageListener->OnMessageFlagsChanged(message, oldFlags, newFlags);
  }
  return NS_OK;
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

nsresult MessageDatabase::GetNumMessages(uint64_t folderId,
                                         uint64_t* numMessages) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetNumMessages"_ns,
      "SELECT COUNT(*) AS numMessages FROM messages WHERE folderId = :folderId"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("folderId"_ns, folderId);

  *numMessages = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *numMessages = (uint64_t)stmt->AsInt64(0);
  }
  stmt->Reset();

  return rv;
}

nsresult MessageDatabase::GetNumUnread(uint64_t folderId, uint64_t* numUnread) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetNumUnread"_ns,
      "SELECT COUNT(*) AS numUnread FROM messages WHERE folderId = :folderId AND flags & :flag = 0"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("flag"_ns, nsMsgMessageFlags::Read);

  *numUnread = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *numUnread = (uint64_t)stmt->AsInt64(0);
  }
  stmt->Reset();

  return rv;
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
  MOZ_ASSERT(!aName.EqualsLiteral("keywords"));  // Use GetMessageTags().

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
    *aValue = (uint32_t)stmt->AsInt64(0);
  }
  stmt->Reset();

  return rv;
}

nsresult MessageDatabase::SetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             const nsACString& aValue) {
  MOZ_ASSERT(!aName.EqualsLiteral("keywords"));  // Use SetMessageTags().

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

nsresult MessageDatabase::GetMessageTags(nsMsgKey aKey, nsACString& aValue) {
  RefPtr<Message> message;
  MOZ_TRY(GetMessage(aKey, getter_AddRefs(message)));
  aValue.Assign(message->mTags);
  return NS_OK;
}

nsresult MessageDatabase::SetMessageTags(nsMsgKey aKey,
                                         nsACString const& aValue) {
  RefPtr<Message> message;
  MOZ_TRY(GetMessage(aKey, getter_AddRefs(message)));

  if (aValue == message->mTags) {
    return NS_OK;
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "SetMessageTags"_ns, "UPDATE messages SET tags = :tags WHERE id = :id"_ns,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, message->mId);
  stmt->BindUTF8StringByName("tags"_ns, aValue);
  nsresult rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  message->mTags = aValue;

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

}  // namespace mozilla::mailnews
