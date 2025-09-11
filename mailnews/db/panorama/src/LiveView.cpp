/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "LiveView.h"

#include "DatabaseCore.h"
#include "js/Array.h"
#include "js/Date.h"
#include "jsapi.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/RefPtr.h"
#include "mozStorageHelper.h"
#include "nsMsgFolderFlags.h"
#include "nsServiceManagerUtils.h"
#include "prtime.h"
#include "xpcpublic.h"

using JS::MutableHandle;
using JS::NewArrayObject;
using JS::NewDateObject;
using JS::ObjectValue;
using JS::Rooted;
using JS::SetArrayLength;
using JS::StringValue;
using JS::TimeClip;
using JS::Value;
using mozilla::LazyLogModule;
using mozilla::LogLevel;

namespace mozilla::mailnews {

extern LazyLogModule gPanoramaLog;  // Defined by DatabaseCore.

NS_IMPL_ISUPPORTS(LiveView, nsILiveView)

NS_IMETHODIMP LiveView::InitWithFolder(uint64_t folderId) {
  if (folderId == 0) {
    NS_WARNING("Can't Init LiveView with 0 folderId");
    return NS_ERROR_INVALID_ARG;
  }
  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  // TODO: LiveView should have access to concrete DB classes.
  nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
  nsCOMPtr<nsIFolderDatabase> folderDB = database->GetFolderDB();
  uint32_t folderFlags;
  MOZ_TRY(folderDB->GetFolderFlags(folderId, &folderFlags));

  if (folderFlags & nsMsgFolderFlags::Virtual) {
    mFolderFilter = new VirtualFolderFilter(folderId);
  } else {
    mFolderFilter = new SingleFolderFilter(folderId);
  }
  return NS_OK;
}

NS_IMETHODIMP LiveView::InitWithFolders(nsTArray<uint64_t> const& folderIds) {
  if (folderIds.IsEmpty() || folderIds.Contains((uint64_t)0)) {
    NS_WARNING("Can't Init LiveView with 0 folderId in list");
    return NS_ERROR_INVALID_ARG;
  }
  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  mFolderFilter = new MultiFolderFilter(folderIds);
  return NS_OK;
}

NS_IMETHODIMP LiveView::InitWithTag(const nsACString& aTag) {
  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  mFolderFilter = new TaggedMessagesFilter(aTag, true);
  return NS_OK;
}

NS_IMETHODIMP LiveView::InitWithConversation(uint64_t aConversationId) {
  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  mFolderFilter = new ConversationFilter(aConversationId);
  // Conversation view is always in date-ascending order.
  mSortColumn = nsILiveView::SortColumn::DATE;
  mSortDescending = false;
  return NS_OK;
}

NS_IMETHODIMP LiveView::GetThreadsOnly(bool* threadsOnly) {
  *threadsOnly = mThreadsOnly;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetThreadsOnly(bool threadsOnly) {
  mThreadsOnly = threadsOnly;
  ResetStatements();
  return NS_OK;
}

NS_IMETHODIMP LiveView::GetSortColumn(nsILiveView::SortColumn* aSortColumn) {
  *aSortColumn = mSortColumn;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetSortColumn(nsILiveView::SortColumn aSortColumn) {
  mSortColumn = aSortColumn;
  ResetStatements();
  return NS_OK;
}

NS_IMETHODIMP LiveView::GetSortDescending(bool* aSortDescending) {
  *aSortDescending = mSortDescending;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetSortDescending(bool aSortDescending) {
  mSortDescending = aSortDescending;
  ResetStatements();
  return NS_OK;
}

void LiveView::ResetStatements() {
  if (mCountStmt) {
    mCountStmt->Finalize();
    mCountStmt = nullptr;
  }
  if (mCountUnreadStmt) {
    mCountUnreadStmt->Finalize();
    mCountUnreadStmt = nullptr;
  }
  if (mSelectStmt) {
    mSelectStmt->Finalize();
    mSelectStmt = nullptr;
  }
}

/**
 * Create the WHERE part of an SQL query from the current filters.
 */
nsCString LiveView::GetSQLClause() {
  if (mClause.IsEmpty()) {
    mParams.Clear();
    if (mFolderFilter) {
      mClause.Append(mFolderFilter->mSQLClause);
      mParams.AppendElements(mFolderFilter->mSQLParams);
    }
    if (mClause.IsEmpty()) {
      mClause.Assign("1");
    }
  }
  return mClause;
}

NS_IMETHODIMP LiveView::GetSqlClauseForTests(nsACString& sqlClauseForTests) {
  if (!xpc::IsInAutomation()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  sqlClauseForTests = GetSQLClause();
  return NS_OK;
}

NS_IMETHODIMP LiveView::GetSqlParamsForTests(
    nsTArray<RefPtr<nsIVariant>>& sqlParamsForTests) {
  if (!xpc::IsInAutomation()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  sqlParamsForTests = mParams.Clone();
  return NS_OK;
}

/**
 * Fill the parameters in an SQL query from the current filters.
 */
void LiveView::PrepareStatement(mozIStorageStatement* statement) {
  for (size_t i = 0; i < mParams.Length(); i++) {
    statement->BindByIndex(i, mParams[i]);
  }
}

/**
 * Test if `aMessage` matches the current filters.
 */
bool LiveView::Matches(Message& aMessage) {
  if (mFolderFilter && !(mFolderFilter->Matches(aMessage))) {
    return false;
  }
  return true;
}

NS_IMETHODIMP LiveView::CountMessages(uint64_t* aCount) {
  if (!mCountStmt) {
    nsAutoCString sql;
    if (mThreadsOnly) {
      sql = "SELECT COUNT(DISTINCT threadId) AS count FROM messages WHERE ";
    } else {
      sql = "SELECT COUNT(*) AS count FROM messages WHERE ";
    }
    sql.Append(GetSQLClause());
    MOZ_LOG(gPanoramaLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  mozStorageStatementScoper scoper(mCountStmt);

  PrepareStatement(mCountStmt);
  bool hasResult;
  nsresult rv = mCountStmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  *aCount = mCountStmt->AsInt64(0);
  return NS_OK;
}

NS_IMETHODIMP LiveView::CountUnreadMessages(uint64_t* aCount) {
  if (!mCountUnreadStmt) {
    nsAutoCString sql;
    if (mThreadsOnly) {
      sql = "SELECT COUNT(DISTINCT threadId) AS count FROM messages WHERE ";
    } else {
      sql = "SELECT COUNT(*) AS count FROM messages WHERE ";
    }
    sql.Append(GetSQLClause());
    sql.Append(" AND ~flags & ");
    sql.AppendInt(nsMsgMessageFlags::Read);
    MOZ_LOG(gPanoramaLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountUnreadStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  mozStorageStatementScoper scoper(mCountUnreadStmt);

  PrepareStatement(mCountUnreadStmt);
  bool hasResult;
  nsresult rv = mCountUnreadStmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  *aCount = mCountUnreadStmt->AsInt64(0);
  return NS_OK;
}

/**
 * Create an object of JS primitives representing a message.
 */
JSObject* LiveView::CreateJSMessage(uint64_t id, uint64_t folderId,
                                    const char* messageId, PRTime date,
                                    const char* sender, const char* recipients,
                                    const char* subject, uint64_t flags,
                                    const char* tags, uint64_t threadId,
                                    uint64_t threadParent, JSContext* cx) {
  Rooted<JSObject*> obj(cx, JS_NewPlainObject(cx));

  JS_DefineProperty(cx, obj, "id", (double)(id), JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "folderId", (double)(folderId), JSPROP_ENUMERATE);

  Rooted<Value> val1(cx, StringValue(JS_NewStringCopyZ(cx, messageId)));
  JS_DefineProperty(cx, obj, "messageId", val1, JSPROP_ENUMERATE);

  Rooted<JSObject*> val2(cx,
                         NewDateObject(cx, TimeClip(date / PR_USEC_PER_MSEC)));
  JS_DefineProperty(cx, obj, "date", val2, JSPROP_ENUMERATE);

  Rooted<Value> val3(cx, StringValue(JS_NewStringCopyZ(cx, sender)));
  JS_DefineProperty(cx, obj, "sender", val3, JSPROP_ENUMERATE);

  Rooted<Value> val4(cx, StringValue(JS_NewStringCopyZ(cx, recipients)));
  JS_DefineProperty(cx, obj, "recipients", val4, JSPROP_ENUMERATE);

  Rooted<Value> val5(cx, StringValue(JS_NewStringCopyZ(cx, subject)));
  JS_DefineProperty(cx, obj, "subject", val5, JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "flags", (double)(flags), JSPROP_ENUMERATE);

  Rooted<Value> val6(cx, StringValue(JS_NewStringCopyZ(cx, tags)));
  JS_DefineProperty(cx, obj, "tags", val6, JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "threadId", (double)(threadId), JSPROP_ENUMERATE);
  JS_DefineProperty(cx, obj, "threadParent", (double)(threadParent),
                    JSPROP_ENUMERATE);

  return obj;
}

/**
 * Create an object of JS primitives representing a message.
 */
JSObject* LiveView::CreateJSMessage(Message* aMessage, JSContext* cx) {
  // Yes. This is a bit clunky for now.
  nsAutoCString messageId;
  PRTime date;
  nsAutoCString sender;
  nsAutoCString recipients;
  nsAutoCString subject;
  uint32_t flags;
  nsAutoCString tags;
  nsMsgKey threadId;
  nsMsgKey threadParent;

  aMessage->GetMessageId(messageId);
  aMessage->GetDate(&date);
  aMessage->GetAuthor(sender);
  aMessage->GetRecipients(recipients);
  aMessage->GetSubject(subject);
  aMessage->GetFlags(&flags);
  aMessage->GetStringProperty("keywords", tags);
  aMessage->GetThreadId(&threadId);
  aMessage->GetThreadParent(&threadParent);

  return CreateJSMessage(aMessage->Key(), aMessage->FolderId(), messageId.get(),
                         date, sender.get(), recipients.get(), subject.get(),
                         flags, tags.get(), (uint64_t)threadId,
                         (uint64_t)threadParent, cx);
}

NS_IMETHODIMP LiveView::SelectMessages(uint64_t aLimit, uint64_t aOffset,
                                       JSContext* aCx,
                                       MutableHandle<Value> aMessages) {
  if (!mSelectStmt) {
    nsAutoCString sql(
        "SELECT \
          id, \
          folderId, \
          messageId, \
          date, \
          ADDRESS_FORMAT(sender) AS formattedSender, \
          ADDRESS_FORMAT(recipients) AS formattedRecipients, \
          subject, \
          flags, \
          tags, \
          threadId, \
          threadParent");
    if (mThreadsOnly) {
      // Get only the newest message in each thread. This is the last column and
      // only exists to tell SQLite what to do, we don't use this data.
      sql.Append(", MAX(date)");
    }
    sql.Append(" FROM messages WHERE ");
    sql.Append(GetSQLClause());
    if (mThreadsOnly) {
      sql.Append(" GROUP BY threadId ");
    }
    sql.Append(" ORDER BY ");
    switch (mSortColumn) {
      case nsILiveView::SortColumn::DATE:
        sql.Append("date");
        break;
      case nsILiveView::SortColumn::SUBJECT:
        sql.Append("subject COLLATE locale");
        break;
      case nsILiveView::SortColumn::SENDER:
        sql.Append("formattedSender COLLATE locale");
        break;
      case nsILiveView::SortColumn::RECIPIENTS:
        sql.Append("formattedRecipients COLLATE locale");
        break;
      case nsILiveView::SortColumn::READ_FLAG:
        // Unread messages should be first when sorted in ascending order.
        sql.Append("flags & ");
        sql.AppendInt(nsMsgMessageFlags::Read);
        break;
      case nsILiveView::SortColumn::MARKED_FLAG:
        // Twisted logic alert:
        // Marked messages should be first when sorted in ascending order.
        // The ~ flips the flags so marked = 0, unmarked = 1, and we
        // don't have to mess with the ascending/descending logic.
        sql.Append("~flags & ");
        sql.AppendInt(nsMsgMessageFlags::Marked);
        break;
    }
    sql.Append(mSortDescending ? " DESC" : " ASC");
    sql.Append(" LIMIT :limit OFFSET :offset");
    MOZ_LOG(gPanoramaLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mSelectStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  mozStorageStatementScoper scoper(mSelectStmt);

  PrepareStatement(mSelectStmt);
  mSelectStmt->BindInt64ByName("limit"_ns, aLimit ? aLimit : -1);
  mSelectStmt->BindInt64ByName("offset"_ns, aOffset);

  Rooted<JSObject*> arr(aCx, NewArrayObject(aCx, 100));
  uint32_t count = 0;

  bool hasResult;
  uint32_t len;
  double id;
  const char* messageId;
  double date;
  const char* sender;
  const char* recipients;
  const char* subject;
  double folderId;
  double flags;
  const char* tags;
  double threadId;
  double threadParent;

  while (NS_SUCCEEDED(mSelectStmt->ExecuteStep(&hasResult)) && hasResult) {
    id = mSelectStmt->AsInt64(0);
    folderId = mSelectStmt->AsInt64(1);
    messageId = mSelectStmt->AsSharedUTF8String(2, &len);
    date = mSelectStmt->AsDouble(3);
    sender = mSelectStmt->AsSharedUTF8String(4, &len);
    recipients = mSelectStmt->AsSharedUTF8String(5, &len);
    subject = mSelectStmt->AsSharedUTF8String(6, &len);
    flags = mSelectStmt->AsInt64(7);
    tags = mSelectStmt->AsSharedUTF8String(8, &len);
    threadId = mSelectStmt->AsInt64(9);
    threadParent = mSelectStmt->AsInt64(10);

    JSObject* obj =
        CreateJSMessage(id, folderId, messageId, date, sender, recipients,
                        subject, flags, tags, threadId, threadParent, aCx);
    Rooted<Value> message(aCx, ObjectValue(*obj));
    JS_DefineElement(aCx, arr, count++, message, JSPROP_ENUMERATE);
  }

  if (NS_WARN_IF(!SetArrayLength(aCx, arr, count))) {
    return NS_ERROR_UNEXPECTED;
  }
  aMessages.set(ObjectValue(*arr));

  return NS_OK;
}

void LiveView::OnMessageAdded(Message* aMessage) {
  if (!mListener || !mCx || !Matches(*aMessage)) {
    return;
  }

  JSObject* obj = CreateJSMessage(aMessage, mCx);
  Rooted<Value> message(mCx, ObjectValue(*obj));
  MutableHandle<Value> handle(&message);
  mListener->OnMessageAdded(handle);
}

void LiveView::OnMessageRemoved(Message* aMessage, uint32_t oldFlags) {
  if (!mListener || !mCx || !Matches(*aMessage)) {
    return;
  }

  JSObject* obj = CreateJSMessage(aMessage, mCx);
  Rooted<Value> message(mCx, ObjectValue(*obj));
  MutableHandle<Value> handle(&message);
  mListener->OnMessageRemoved(handle);
}

void LiveView::OnMessageFlagsChanged(Message* message, uint32_t oldFlags,
                                     uint32_t newFlags) {}

NS_IMETHODIMP LiveView::SetListener(nsILiveViewListener* aListener,
                                    JSContext* aCx) {
  bool hadListener = mListener;
  mListener = aListener;
  mCx = aCx;

  if (!hadListener && aListener) {
    MessageDB().AddMessageListener(this);
  }
  return NS_OK;
}

NS_IMETHODIMP LiveView::ClearListener() {
  mListener = nullptr;
  mCx = nullptr;

  MessageDB().RemoveMessageListener(this);
  return NS_OK;
}

}  // namespace mozilla::mailnews
