/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MessageDatabase.h"

#include "DatabaseCore.h"
#include "DatabaseUtils.h"
#include "Message.h"
#include "mozilla/ErrorResult.h"
#include "mozilla/Logging.h"
#include "mozilla/ResultExtensions.h"
#include "mozilla/Try.h"
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

  // TODO: we've already got all the data, so all the SQL really needs to return
  // is the key.
  uint32_t len;
  CachedMsg cached;
  cached.key = (nsMsgKey)stmt->AsInt64(0);
  cached.folderId = stmt->AsInt64(1);
  cached.threadId = (nsMsgKey)stmt->AsInt64(2);
  cached.threadParent = (nsMsgKey)stmt->AsInt64(3);
  cached.messageId = stmt->AsSharedUTF8String(4, &len);
  cached.date = (PRTime)stmt->AsInt64(5);
  cached.sender = stmt->AsSharedUTF8String(6, &len);
  cached.recipients = stmt->AsSharedUTF8String(7, &len);
  cached.ccList = stmt->AsSharedUTF8String(8, &len);
  cached.bccList = stmt->AsSharedUTF8String(9, &len);
  cached.subject = stmt->AsSharedUTF8String(10, &len);
  cached.flags = (uint32_t)stmt->AsInt64(11);
  cached.tags = stmt->AsSharedUTF8String(12, &len);
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
  stmt->BindInt64ByName("id"_ns, cached.key);
  stmt->BindInt64ByName("threadId"_ns, cached.key);
  stmt->BindInt64ByName("threadParent"_ns, 0);
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Reflect UpdateThreadInfo in the cached data.
  cached.threadId = cached.key;
  cached.threadParent = 0;

  // Add to cache.
  if (!mMsgCache.put(cached.key, cached)) {
    return NS_ERROR_FAILURE;
  }

  RefPtr<Message> message = new Message(cached.key);
  for (MessageListener* listener : mMessageListeners.EndLimitedRange()) {
    listener->OnMessageAdded(message);
  }

  *aKey = cached.key;
  return NS_OK;
}

nsresult MessageDatabase::GetMessage(nsMsgKey key, Message** message) {
  RefPtr<Message> m = new Message(key);
  m.forget(message);
  return NS_OK;
}

nsresult MessageDatabase::MessageExists(nsMsgKey key, bool& exists) {
  if (mMsgCache.has(key)) {
    exists = true;
    return NS_OK;
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("MessageExists"_ns,
                             "SELECT 1 FROM messages WHERE id = :id"_ns,
                             getter_AddRefs(stmt));
  NS_ENSURE_STATE(stmt);
  stmt->BindInt64ByName("id"_ns, key);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  stmt->Reset();
  exists = hasResult;
  return NS_OK;
}

NS_IMETHODIMP MessageDatabase::RemoveMessage(nsMsgKey key) {
  MOZ_ASSERT(key != nsMsgKey_None);

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("RemoveMessage_properties"_ns,
                             "DELETE FROM message_properties WHERE id = :id"_ns,
                             getter_AddRefs(stmt));
  stmt->BindInt64ByName("id"_ns, (int64_t)key);
  nsresult rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);
  stmt = nullptr;

  DatabaseCore::GetStatement(
      "RemoveMessage"_ns,
      "DELETE FROM messages WHERE id = :id RETURNING "_ns MESSAGE_SQL_FIELDS,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, key);

  bool hasResult;
  rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }
  uint32_t oldFlags = (uint32_t)stmt->AsInt64(11);
  stmt->Reset();

  // TODO: remove from cache. Left in until we sort out the notification issues.

  // TODO: sort this out. It's problematic if listeners want to access data from
  // deleted message.
  RefPtr<Message> message = new Message(key);
  for (MessageListener* listener : mMessageListeners.EndLimitedRange()) {
    listener->OnMessageRemoved(message, oldFlags);
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

// Populate a CachedMsg entry from the database.
nsresult MessageDatabase::FetchMsg(nsMsgKey key, CachedMsg& cached) {
  // TODO: Likely we'll eventually need to collect from multiple tables, either
  // with JOINs or multiple queries.
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("FetchCachedMsg"_ns,
                             "SELECT "_ns MESSAGE_SQL_FIELDS
                             " FROM messages WHERE id = :id"_ns,
                             getter_AddRefs(stmt));
  stmt->BindInt64ByName("id"_ns, (uint64_t)key);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  uint32_t len;
  cached.key = (nsMsgKey)stmt->AsInt64(0);
  cached.folderId = stmt->AsInt64(1);
  cached.threadId = (nsMsgKey)stmt->AsInt64(2);
  cached.threadParent = (nsMsgKey)stmt->AsInt64(3);
  cached.messageId = stmt->AsSharedUTF8String(4, &len);
  cached.date = (PRTime)stmt->AsInt64(5);
  cached.sender = stmt->AsSharedUTF8String(6, &len);
  cached.recipients = stmt->AsSharedUTF8String(7, &len);
  cached.ccList = stmt->AsSharedUTF8String(8, &len);
  cached.bccList = stmt->AsSharedUTF8String(9, &len);
  cached.subject = stmt->AsSharedUTF8String(10, &len);
  cached.flags = (uint32_t)stmt->AsInt64(11);
  cached.tags = stmt->AsSharedUTF8String(12, &len);
  stmt->Reset();

  return NS_OK;
}

Result<MessageDatabase::CachedMsg*, nsresult> MessageDatabase::EnsureCached(
    nsMsgKey key) {
  auto p = mMsgCache.lookupForAdd(key);
  if (!p) {
    TrimCache();
    CachedMsg msg;
    nsresult rv = FetchMsg(key, msg);
    if (NS_FAILED(rv)) {
      return Err(rv);
    }
    if (!mMsgCache.add(p, key, msg)) {
      return Err(NS_ERROR_FAILURE);
    }
  }
  return &p->value();
}

void MessageDatabase::TrimCache() {
  // Standin cache policy:
  // Grow to maxEntries, then discard an abitrary 25%.
  // Could be waaaay more clever here, but let do some real-world
  // profiling before getting cute.
  constexpr uint32_t maxEntries = 512;  // (roughly 256KB).
  if (mMsgCache.count() < maxEntries) {
    return;
  }
  // Throw away 25%. Don't care which.
  uint32_t n = maxEntries / 4;
  for (auto it = mMsgCache.modIter(); !it.done(); it.next()) {
    if (!n) {
      break;
    }
    it.remove();
    --n;
  }
}

nsresult MessageDatabase::GetMessageForMessageID(uint64_t aFolderId,
                                                 const nsACString& aMessageId,
                                                 Message** aMessage) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "GetMessageByMessageId"_ns,
      "SELECT id"_ns
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
  nsMsgKey key = (nsMsgKey)stmt->AsInt64(0);
  stmt->Reset();

  RefPtr<Message> message = new Message(key);
  message.forget(aMessage);

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

  // Update affected cache entries.
  for (nsMsgKey key : aMarkedKeys) {
    auto p = mMsgCache.lookup(key);
    if (p) {
      p->value().flags |= nsMsgMessageFlags::Read;
    }
  }

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

nsresult MessageDatabase::GetMessagePropertyNames(nsMsgKey key,
                                                  nsTArray<nsCString>& names) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetMessageProperties"_ns,
      "SELECT name FROM message_properties WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, key);

  names.Clear();
  bool hasResult;
  uint32_t len;
  nsAutoCString name;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    name = stmt->AsSharedUTF8String(0, &len);
    names.AppendElement(name);
  }
  stmt->Reset();

  return NS_OK;
}

nsresult MessageDatabase::GetMessageProperty(nsMsgKey aKey,
                                             const nsACString& aName,
                                             nsACString& aValue) {
  MOZ_ASSERT(!aName.EqualsLiteral("keywords"));  // Use GetMessageTags().

  // TODO: might want to cache selected properties.
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
  return NS_OK;
}

nsresult MessageDatabase::GetMessageProperty(nsMsgKey key,
                                             const nsACString& name,
                                             uint32_t& value) {
  // TODO: might want to cache selected properties.
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetMessageProperty"_ns,
      "SELECT value FROM message_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, key);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));

  value = 0;
  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    value = (uint32_t)stmt->AsInt64(0);
  }
  stmt->Reset();
  return NS_OK;
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
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);
  // TODO: might want to cache selected properties.
  return NS_OK;
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
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);
  // TODO: might want to cache selected properties.
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

// Message functions

nsresult MessageDatabase::GetMessageFlags(nsMsgKey key, uint32_t& flags) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  flags = cached->flags;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageFlag(nsMsgKey key, uint32_t flag,
                                         bool& value) {
  uint32_t flags;
  MOZ_TRY(GetMessageFlags(key, flags));
  value = (flags & flag) ? true : false;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageOfflineMessageSize(nsMsgKey key,
                                                       uint64_t& size) {
  uint32_t tmp;
  MOZ_TRY(GetMessageProperty(key, "offlineMessageSize"_ns, tmp));
  size = tmp;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageDate(nsMsgKey key, PRTime& date) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  date = cached->date;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageSize(nsMsgKey key, uint64_t& size) {
  uint32_t tmp;
  MOZ_TRY(GetMessageProperty(key, "messageSize"_ns, tmp));
  size = tmp;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageLineCount(nsMsgKey key, uint32_t& count) {
  uint32_t tmp;
  MOZ_TRY(GetMessageProperty(key, "lineCount"_ns, tmp));
  count = tmp;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageStoreToken(nsMsgKey key,
                                               nsACString& token) {
  return GetMessageProperty(key, "storeToken"_ns, token);
}

nsresult MessageDatabase::GetMessageMessageId(nsMsgKey key,
                                              nsACString& messageId) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  messageId.Assign(cached->messageId);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageCcList(nsMsgKey key, nsACString& ccList) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  ccList.Assign(cached->ccList);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageBccList(nsMsgKey key, nsACString& bccList) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  bccList.Assign(cached->bccList);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageSender(nsMsgKey key, nsACString& sender) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  sender.Assign(cached->sender);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageSubject(nsMsgKey key, nsACString& subject) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  subject.Assign(cached->subject);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageRecipients(nsMsgKey key,
                                               nsACString& recipients) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  recipients.Assign(cached->recipients);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageTags(nsMsgKey key, nsACString& tags) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  tags.Assign(cached->tags);
  return NS_OK;
}

nsresult MessageDatabase::GetMessageUidOnServer(nsMsgKey key,
                                                uint32_t& uidOnServer) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

nsresult MessageDatabase::GetMessageThreadId(nsMsgKey key, nsMsgKey& threadId) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  threadId = cached->threadId;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageThreadParent(nsMsgKey key,
                                                 nsMsgKey& threadParent) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  threadParent = cached->threadParent;
  return NS_OK;
}

nsresult MessageDatabase::GetMessageFolderId(nsMsgKey key, uint64_t& folderId) {
  CachedMsg* cached;
  MOZ_TRY_VAR(cached, EnsureCached(key));
  folderId = cached->folderId;
  return NS_OK;
}

nsresult MessageDatabase::SetMessageFlags(nsMsgKey key, uint32_t newFlags) {
  uint32_t oldFlags;
  MOZ_TRY(GetMessageFlags(key, oldFlags));

  // Update in DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageFlags"_ns,
        "UPDATE messages SET flags = :flags WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindInt64ByName("flags"_ns, (int64_t)newFlags);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().flags = newFlags;
  }

  // Notify.
  RefPtr<Message> message = new Message(key);
  for (MessageListener* listener : mMessageListeners.EndLimitedRange()) {
    listener->OnMessageFlagsChanged(message, oldFlags, newFlags);
  }
  return NS_OK;
}

nsresult MessageDatabase::SetMessageFlag(nsMsgKey key, uint32_t flag,
                                         bool value) {
  uint32_t flags;
  MOZ_TRY(GetMessageFlags(key, flags));
  if (value) {
    flags |= flag;
  } else {
    flags &= ~flag;
  }
  return SetMessageFlags(key, flags);
}

nsresult MessageDatabase::SetMessageOfflineMessageSize(nsMsgKey key,
                                                       uint64_t size) {
  return SetMessageProperty(key, "offlineMessageSize"_ns, (uint32_t)size);
}

nsresult MessageDatabase::SetMessageDate(nsMsgKey key, PRTime date) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageDate"_ns,
        "UPDATE messages SET date = :date WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindInt64ByName("date"_ns, (int64_t)date);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().date = date;
  }
  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageSize(nsMsgKey key, uint64_t size) {
  return SetMessageProperty(key, "messageSize"_ns, (uint32_t)size);
}

nsresult MessageDatabase::SetMessageLineCount(nsMsgKey key, uint32_t count) {
  return SetMessageProperty(key, "lineCount"_ns, (uint32_t)count);
}

nsresult MessageDatabase::SetMessageStoreToken(nsMsgKey key,
                                               const nsACString& token) {
  return SetMessageProperty(key, "storeToken"_ns, token);
}

nsresult MessageDatabase::SetMessageMessageId(nsMsgKey key,
                                              const nsACString& messageId) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageMessageId"_ns,
        "UPDATE messages SET messageId = :messageId WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("messageId"_ns, messageId);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().messageId = messageId;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageCcList(nsMsgKey key,
                                           const nsACString& ccList) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageCcList"_ns,
        "UPDATE messages SET ccList = :ccList WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("ccList"_ns, ccList);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().ccList = ccList;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageBccList(nsMsgKey key,
                                            const nsACString& bccList) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageBccList"_ns,
        "UPDATE messages SET bccList = :bccList WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("bccList"_ns, bccList);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().bccList = bccList;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageSender(nsMsgKey key,
                                           const nsACString& sender) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageSender"_ns,
        "UPDATE messages SET sender = :sender WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("sender"_ns, sender);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().sender = sender;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageSubject(nsMsgKey key,
                                            const nsACString& subject) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageSubject"_ns,
        "UPDATE messages SET subject = :subject WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("subject"_ns, subject);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().subject = subject;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageRecipients(nsMsgKey key,
                                               const nsACString& recipients) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageRecipients"_ns,
        "UPDATE messages SET recipients = :recipients WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("recipients"_ns, recipients);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().recipients = recipients;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageTags(nsMsgKey key, nsACString const& tags) {
  // Update DB.
  {
    nsCOMPtr<mozIStorageStatement> stmt;
    DatabaseCore::GetStatement(
        "SetMessageTags"_ns,
        "UPDATE messages SET tags = :tags WHERE id = :id"_ns,
        getter_AddRefs(stmt));

    stmt->BindInt64ByName("id"_ns, key);
    stmt->BindUTF8StringByName("tags"_ns, tags);
    nsresult rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // Update cache.
  auto p = mMsgCache.lookup(key);
  if (p) {
    p->value().tags = tags;
  }

  // TODO: notifications.
  return NS_OK;
}

nsresult MessageDatabase::SetMessageUidOnServer(nsMsgKey key,
                                                uint32_t uidOnServer) {
  return NS_ERROR_NOT_IMPLEMENTED;
}

}  // namespace mozilla::mailnews
