/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "MessageDatabase.h"

#include "DatabaseCore.h"
#include "mozilla/Logging.h"

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
    const nsACString& aMessageId, PRTime aDate, const nsACString& aSender,
    const nsACString& aSubject, uint64_t aFolderId, uint64_t aFlags,
    const nsACString& aTags, uint64_t* aId) {
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

  Message m;
  m.id = stmt->AsInt64(0);
  m.messageId = aMessageId;
  m.date = aDate;
  m.sender = aSender;
  m.subject = aSubject;
  m.folderId = aFolderId;
  m.flags = aFlags;
  m.tags = aTags;

  stmt->Reset();

  nsTObserverArray<MessageListener*>::ForwardIterator iter(mMessageListeners);
  while (iter.HasMore()) {
    MessageListener* messageListener = iter.GetNext();
    messageListener->OnMessageAdded(nullptr, &m);
  }

  *aId = m.id;
  return NS_OK;
}

NS_IMETHODIMP MessageDatabase::RemoveMessage(uint64_t aId) {
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("RemoveMessage"_ns,
                             "DELETE FROM messages \
                              WHERE id = :id \
                              RETURNING folderId, messageId, date, sender, subject, flags, tags"_ns,
                             getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, aId);

  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  uint32_t len;
  Message m;
  m.id = aId;
  m.folderId = stmt->AsInt64(0);
  m.messageId = stmt->AsSharedUTF8String(1, &len);
  m.date = stmt->AsDouble(2);
  m.sender = stmt->AsSharedUTF8String(3, &len);
  m.subject = stmt->AsSharedUTF8String(4, &len);
  m.flags = stmt->AsInt64(5);
  m.tags = stmt->AsSharedUTF8String(6, &len);

  stmt->Reset();

  nsTObserverArray<MessageListener*>::ForwardIterator iter(mMessageListeners);
  while (iter.HasMore()) {
    MessageListener* messageListener = iter.GetNext();
    messageListener->OnMessageRemoved(nullptr, &m);
  }

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
