/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "LiveView.h"

#include "DatabaseCore.h"
#include "js/Array.h"
#include "js/Date.h"
#include "jsapi.h"
#include "mozilla/Components.h"
#include "mozilla/dom/Promise.h"
#include "mozilla/Logging.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/RefPtr.h"
#include "mozIStorageError.h"
#include "mozIStorageResultSet.h"
#include "mozIStorageRow.h"
#include "mozIStorageStatementCallback.h"
#include "mozStorageHelper.h"
#include "nsMsgFolderFlags.h"
#include "nsServiceManagerUtils.h"
#include "prtime.h"
#include "xpcpublic.h"

using JS::ConstUTF8CharsZ;
using JS::Heap;
using JS::MutableHandle;
using JS::NewArrayObject;
using JS::NewDateObject;
using JS::ObjectValue;
using JS::Rooted;
using JS::TimeClip;
using JS::Value;
using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::dom::AutoJSAPI;
using mozilla::dom::Promise;
using xpc::CurrentNativeGlobal;

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

NS_IMETHODIMP LiveView::GetGrouping(nsILiveView::Grouping* aGrouping) {
  *aGrouping = mGrouping;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetGrouping(nsILiveView::Grouping aGrouping) {
  mGrouping = aGrouping;
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
  if (mSelectGroupStmt) {
    mSelectGroupStmt->Finalize();
    mSelectGroupStmt = nullptr;
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

class CountMessagesListener final : public mozIStorageStatementCallback {
 public:
  nsMainThreadPtrHandle<Promise> mPromiseHolder;
  int64_t mResult;
  nsAutoCString mErrorMessage;

  explicit CountMessagesListener(JSContext* cx) {
    ErrorResult err;
    RefPtr<Promise> promise = Promise::Create(CurrentNativeGlobal(cx), err);
    mPromiseHolder = new nsMainThreadPtrHolder<Promise>(__func__, promise);
  }

  NS_DECL_ISUPPORTS

  NS_IMETHOD HandleError(mozIStorageError* error) override {
    error->GetMessage(mErrorMessage);
    return NS_OK;
  }
  NS_IMETHOD HandleResult(mozIStorageResultSet* resultSet) override {
    nsCOMPtr<mozIStorageRow> row;
    if (NS_SUCCEEDED(resultSet->GetNextRow(getter_AddRefs(row))) && row) {
      mResult = row->AsInt64(0);
    }
    return NS_OK;
  }
  NS_IMETHOD HandleCompletion(uint16_t reason) override {
    if (reason == mozIStorageStatementCallback::REASON_CANCELED) {
      mPromiseHolder.get()->MaybeRejectWithAbortError("SQL query cancelled.");
    } else if (reason == mozIStorageStatementCallback::REASON_ERROR) {
      mPromiseHolder.get()->MaybeRejectWithUnknownError(
          "SQL query failed: "_ns + mErrorMessage);
    }
    mPromiseHolder.get()->MaybeResolve(mResult);
    return NS_OK;
  }

 private:
  ~CountMessagesListener() {}
};
NS_IMPL_ISUPPORTS(CountMessagesListener, mozIStorageStatementCallback)

NS_IMETHODIMP LiveView::CountMessages(JSContext* cx, Promise** promise) {
  if (!mCountStmt) {
    nsAutoCString sql("SELECT COUNT(");
    if (mGrouping == nsILiveView::THREADED) {
      sql.Append("DISTINCT threadId");
    } else if (mGrouping == nsILiveView::GROUPED_BY_SORT) {
      switch (mSortColumn) {
        case nsILiveView::DATE:
          sql.Append("DISTINCT DATE_GROUP(date)");
          break;
        case nsILiveView::SortColumn::SUBJECT:
          sql.Append("DISTINCT subject COLLATE locale");
          break;
        case nsILiveView::SortColumn::SENDER:
          sql.Append("DISTINCT formattedSender COLLATE locale");
          break;
        case nsILiveView::SortColumn::RECIPIENTS:
          sql.Append("DISTINCT formattedRecipients COLLATE locale");
          break;
        default:
          MOZ_CRASH("Unexpected sort column for GROUPED_BY_SORT");
      }
    } else {
      sql.Append("*");
    }
    sql.Append(") AS count FROM messages WHERE ");
    sql.Append(GetSQLClause());
    MOZ_LOG(gPanoramaLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  mozStorageStatementScoper scoper(mCountStmt);

  PrepareStatement(mCountStmt);
  CountMessagesListener* listener = new CountMessagesListener(cx);
  nsCOMPtr<mozIStoragePendingStatement> unused;
  nsresult rv = mCountStmt->ExecuteAsync(listener, getter_AddRefs(unused));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ADDREF(*promise = listener->mPromiseHolder.get());
  return NS_OK;
}

NS_IMETHODIMP LiveView::CountUnreadMessages(JSContext* cx, Promise** promise) {
  if (!mCountUnreadStmt) {
    nsAutoCString sql("SELECT COUNT(");
    if (mGrouping == nsILiveView::THREADED) {
      sql.Append("DISTINCT threadId");
    } else if (mGrouping == nsILiveView::GROUPED_BY_SORT) {
      switch (mSortColumn) {
        case nsILiveView::DATE:
          sql.Append("DISTINCT DATE_GROUP(date)");
          break;
        case nsILiveView::SortColumn::SUBJECT:
          sql.Append("DISTINCT subject COLLATE locale");
          break;
        case nsILiveView::SortColumn::SENDER:
          sql.Append("DISTINCT formattedSender COLLATE locale");
          break;
        case nsILiveView::SortColumn::RECIPIENTS:
          sql.Append("DISTINCT formattedRecipients COLLATE locale");
          break;
        default:
          MOZ_CRASH("Unexpected sort column for GROUPED_BY_SORT");
      }
    } else {
      sql.Append("*");
    }
    sql.Append(") AS count FROM messages WHERE ");
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
  CountMessagesListener* listener = new CountMessagesListener(cx);
  nsCOMPtr<mozIStoragePendingStatement> unused;
  nsresult rv =
      mCountUnreadStmt->ExecuteAsync(listener, getter_AddRefs(unused));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ADDREF(*promise = listener->mPromiseHolder.get());
  return NS_OK;
}

class SelectMessagesListener final : public mozIStorageStatementCallback {
 public:
  nsMainThreadPtrHandle<Promise> mPromiseHolder;
  nsILiveView::SortColumn mSortColumn;
  nsILiveView::Grouping mGrouping;
  uint32_t mColumnCount;
  Heap<JSObject*> mArr;
  uint32_t mCount;
  nsAutoCString mErrorMessage;

  explicit SelectMessagesListener(JSContext* cx,
                                  nsCOMPtr<mozIStorageStatement> stmt,
                                  nsILiveView::SortColumn sortColumn,
                                  nsILiveView::Grouping grouping)
      : mSortColumn(sortColumn), mGrouping(grouping) {
    ErrorResult err;
    RefPtr<Promise> promise = Promise::Create(CurrentNativeGlobal(cx), err);
    mPromiseHolder = new nsMainThreadPtrHolder<Promise>(__func__, promise);
    stmt->GetColumnCount(&mColumnCount);

    mArr = NewArrayObject(cx, 0);
    mCount = 0;
  }

  NS_DECL_ISUPPORTS

  NS_IMETHOD HandleError(mozIStorageError* error) override {
    error->GetMessage(mErrorMessage);
    return NS_OK;
  }
  NS_IMETHOD HandleResult(mozIStorageResultSet* resultSet) override {
    AUTO_PROFILER_LABEL("SelectMessagesListener::HandleResult", MAILNEWS);
    AutoJSAPI jsapi;
    if (!jsapi.Init(mPromiseHolder.get()->GetParentObject())) {
      mPromiseHolder.get()->MaybeRejectWithUnknownError(
          "Failed to get a JS API object");
      return NS_ERROR_FAILURE;
    }

    JSContext* cx = jsapi.cx();
    Rooted<JSObject*> arr(cx);
    arr = mArr;

    nsCOMPtr<mozIStorageRow> row;
    while (NS_SUCCEEDED(resultSet->GetNextRow(getter_AddRefs(row))) && row) {
      nsMsgKey id = (nsMsgKey)(row->AsInt64(0));
      uint64_t folderId = row->AsInt64(1);
      nsCString messageId;
      row->GetUTF8String(2, messageId);
      PRTime date = (PRTime)(row->AsDouble(3));
      nsCString sender;
      row->GetUTF8String(4, sender);
      nsCString recipients;
      row->GetUTF8String(5, recipients);
      nsCString subject;
      row->GetUTF8String(6, subject);
      uint32_t flags = (uint32_t)(row->AsInt64(7));
      nsCString tags;
      row->GetUTF8String(8, tags);
      nsMsgKey threadId = (nsMsgKey)(row->AsInt64(9));
      nsMsgKey threadParent = (nsMsgKey)(row->AsInt64(10));

      Rooted<JSObject*> obj(cx);
      CreateJSMessage(id, folderId, messageId.get(), date, sender.get(),
                      recipients.get(), subject.get(), flags, tags.get(),
                      threadId, threadParent, cx, obj);

      if (mColumnCount > 11) {
        if (mGrouping == nsILiveView::THREADED ||
            mGrouping == nsILiveView::GROUPED_BY_SORT) {
          uint64_t messageCount = row->AsInt64(11);
          JS_DefineProperty(cx, obj, "messageCount", (double)(messageCount),
                            JSPROP_ENUMERATE);
        }
        if (mGrouping == nsILiveView::GROUPED_BY_SORT &&
            mSortColumn == nsILiveView::DATE) {
          uint64_t dateGroup = row->AsInt64(12);
          JS_DefineProperty(cx, obj, "dateGroup", (double)(dateGroup),
                            JSPROP_ENUMERATE);
        }
      }

      Rooted<Value> message(cx, ObjectValue(*obj));
      JS_DefineElement(cx, arr, mCount++, message, JSPROP_ENUMERATE);
    }
    return NS_OK;
  }
  NS_IMETHOD HandleCompletion(uint16_t reason) override {
    AUTO_PROFILER_LABEL("SelectMessagesListener::HandleCompletion", MAILNEWS);
    if (reason == mozIStorageStatementCallback::REASON_CANCELED) {
      mPromiseHolder.get()->MaybeRejectWithAbortError("SQL query cancelled.");
      return NS_OK;
    }
    if (reason == mozIStorageStatementCallback::REASON_ERROR) {
      mPromiseHolder.get()->MaybeRejectWithUnknownError(
          "SQL query failed: "_ns + mErrorMessage);
      return NS_OK;
    }

    AutoJSAPI jsapi;
    if (!jsapi.Init(mPromiseHolder.get()->GetParentObject())) {
      mPromiseHolder.get()->MaybeRejectWithUnknownError(
          "Failed to get a JS API object");
      return NS_ERROR_FAILURE;
    }

    JSContext* cx = jsapi.cx();
    Rooted<JSObject*> arr(cx, mArr);
    mPromiseHolder.get()->MaybeResolve(arr);
    return NS_OK;
  }

 private:
  ~SelectMessagesListener() {}
};
NS_IMPL_ISUPPORTS(SelectMessagesListener, mozIStorageStatementCallback)

/**
 * Create an object of JS primitives representing a message.
 */
void CreateJSMessage(uint64_t id, uint64_t folderId, const char* messageId,
                     PRTime date, const char* sender, const char* recipients,
                     const char* subject, uint64_t flags, const char* tags,
                     uint64_t threadId, uint64_t threadParent, JSContext* cx,
                     Rooted<JSObject*>& obj) {
  obj.set(JS_NewPlainObject(cx));

  JS_DefineProperty(cx, obj, "id", (double)(id), JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "folderId", (double)(folderId), JSPROP_ENUMERATE);

  Rooted<JSString*> val1(cx);
  if (messageId)
    val1 = JS_NewStringCopyUTF8Z(cx, ConstUTF8CharsZ(messageId));
  else
    val1 = JS_GetEmptyString(cx);
  JS_DefineProperty(cx, obj, "messageId", val1, JSPROP_ENUMERATE);

  Rooted<JSObject*> val2(cx,
                         NewDateObject(cx, TimeClip(date / PR_USEC_PER_MSEC)));
  JS_DefineProperty(cx, obj, "date", val2, JSPROP_ENUMERATE);

  Rooted<JSString*> val3(cx);
  if (sender)
    val3 = JS_NewStringCopyUTF8Z(cx, ConstUTF8CharsZ(sender));
  else
    val3 = JS_GetEmptyString(cx);
  JS_DefineProperty(cx, obj, "sender", val3, JSPROP_ENUMERATE);

  Rooted<JSString*> val4(cx);
  if (recipients)
    val4 = JS_NewStringCopyUTF8Z(cx, ConstUTF8CharsZ(recipients));
  else
    val4 = JS_GetEmptyString(cx);
  JS_DefineProperty(cx, obj, "recipients", val4, JSPROP_ENUMERATE);

  Rooted<JSString*> val5(cx);
  if (subject)
    val5 = JS_NewStringCopyUTF8Z(cx, ConstUTF8CharsZ(subject));
  else
    val5 = JS_GetEmptyString(cx);
  JS_DefineProperty(cx, obj, "subject", val5, JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "flags", (double)(flags), JSPROP_ENUMERATE);

  Rooted<JSString*> val6(cx);
  if (tags)
    val6 = JS_NewStringCopyUTF8Z(cx, ConstUTF8CharsZ(tags));
  else
    val6 = JS_GetEmptyString(cx);
  JS_DefineProperty(cx, obj, "tags", val6, JSPROP_ENUMERATE);

  JS_DefineProperty(cx, obj, "threadId", (double)(threadId), JSPROP_ENUMERATE);
  JS_DefineProperty(cx, obj, "threadParent", (double)(threadParent),
                    JSPROP_ENUMERATE);
}

/**
 * Create an object of JS primitives representing a message.
 */
void CreateJSMessage(Message* aMessage, JSContext* cx, Rooted<JSObject*>& obj) {
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

  CreateJSMessage(aMessage->Key(), aMessage->FolderId(), messageId.get(), date,
                  sender.get(), recipients.get(), subject.get(), flags,
                  tags.get(), (uint64_t)threadId, (uint64_t)threadParent, cx,
                  obj);
}

NS_IMETHODIMP LiveView::SelectMessages(uint64_t limit, uint64_t offset,
                                       JSContext* cx, Promise** promise) {
  if (!mSelectStmt) {
    // FIXME: Address formatting is temporarily disabled.
    nsAutoCString sql(
        "SELECT \
          id, \
          folderId, \
          messageId, \
          date, \
          sender AS formattedSender, \
          recipients AS formattedRecipients, \
          subject, \
          flags, \
          tags, \
          threadId, \
          threadParent");
    if (mGrouping == nsILiveView::THREADED) {
      sql.Append(", COUNT(*) AS messageCount");
      // Get only the newest message in each thread. This is the last column and
      // only exists to tell SQLite what to do, we don't use this data.
      sql.Append(", MAX(date) AS maxDate");
    } else if (mGrouping == nsILiveView::GROUPED_BY_SORT) {
      sql.Append(", COUNT(*) AS messageCount");
      if (mSortColumn == nsILiveView::DATE) {
        sql.Append(", DATE_GROUP(date) AS dateGroup");
      }
    }
    sql.Append(" FROM messages WHERE ");
    sql.Append(GetSQLClause());
    if (mGrouping == nsILiveView::THREADED) {
      sql.Append(" GROUP BY threadId ");
    } else if (mGrouping == nsILiveView::GROUPED_BY_SORT) {
      sql.Append(" GROUP BY ");
      switch (mSortColumn) {
        case nsILiveView::SortColumn::DATE:
          sql.Append("dateGroup ");
          break;
        case nsILiveView::SortColumn::SUBJECT:
          sql.Append("subject ");
          break;
        case nsILiveView::SortColumn::SENDER:
          sql.Append("formattedSender COLLATE locale ");
          break;
        case nsILiveView::SortColumn::RECIPIENTS:
          sql.Append("formattedRecipients COLLATE locale ");
          break;
        default:
          MOZ_CRASH("Unexpected sort column for GROUPED_BY_SORT");
      }
    }
    sql.Append(" ORDER BY ");
    switch (mSortColumn) {
      case nsILiveView::SortColumn::DATE:
        if (mGrouping == nsILiveView::GROUPED_BY_SORT) {
          sql.Append("dateGroup");
        } else {
          sql.Append("date");
        }
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

  PrepareStatement(mSelectStmt);
  mSelectStmt->BindInt64ByName("limit"_ns, limit ? limit : -1);
  mSelectStmt->BindInt64ByName("offset"_ns, offset);

  RefPtr<SelectMessagesListener> listener =
      new SelectMessagesListener(cx, mSelectStmt, mSortColumn, mGrouping);
  nsCOMPtr<mozIStoragePendingStatement> unused;
  nsresult rv = mSelectStmt->ExecuteAsync(listener, getter_AddRefs(unused));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ADDREF(*promise = listener->mPromiseHolder.get());
  return NS_OK;
}

NS_IMETHODIMP LiveView::SelectMessagesInGroup(const nsACString& group,
                                              JSContext* cx,
                                              Promise** promise) {
  if (!mSelectGroupStmt) {
    // FIXME: Address formatting is temporarily disabled.
    nsAutoCString sql(
        "SELECT \
          id, \
          folderId, \
          messageId, \
          date, \
          sender AS formattedSender, \
          recipients AS formattedRecipients, \
          subject, \
          flags, \
          tags, \
          threadId, \
          threadParent \
        FROM messages WHERE ");
    sql.Append(GetSQLClause());
    if (mGrouping == nsILiveView::THREADED) {
      sql.Append(" AND threadId = :group ORDER BY date ASC");
    } else {
      switch (mSortColumn) {
        case nsILiveView::SortColumn::DATE:
          sql.Append(" AND DATE_GROUP(date) = :group ORDER BY date");
          sql.Append(mSortDescending ? " DESC" : " ASC");
          break;
        case nsILiveView::SortColumn::SUBJECT:
          sql.Append(" AND subject = :group COLLATE locale");
          // TODO: Sort order is undefined.
          break;
        case nsILiveView::SortColumn::SENDER:
          sql.Append(" AND formattedSender = :group COLLATE locale");
          // TODO: Sort order is undefined.
          break;
        case nsILiveView::SortColumn::RECIPIENTS:
          sql.Append(" AND formattedRecipients = :group COLLATE locale");
          // TODO: Sort order is undefined.
          break;
        default:
          MOZ_CRASH("Unexpected sort column for GROUPED_BY_SORT");
      }
    }
    MOZ_LOG(gPanoramaLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mSelectGroupStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }
  mozStorageStatementScoper scoper(mSelectGroupStmt);

  PrepareStatement(mSelectGroupStmt);
  if (mGrouping == nsILiveView::THREADED || mSortColumn == nsILiveView::DATE) {
    nsresult rv;
    int64_t groupInt = group.ToInteger(&rv);
    NS_ENSURE_SUCCESS(rv, rv);
    mSelectGroupStmt->BindInt64ByName("group"_ns, groupInt);
  } else {
    mSelectGroupStmt->BindUTF8StringByName("group"_ns, group);
  }

  RefPtr<SelectMessagesListener> listener =
      new SelectMessagesListener(cx, mSelectGroupStmt, mSortColumn, mGrouping);
  nsCOMPtr<mozIStoragePendingStatement> unused;
  nsresult rv =
      mSelectGroupStmt->ExecuteAsync(listener, getter_AddRefs(unused));
  NS_ENSURE_SUCCESS(rv, rv);

  NS_ADDREF(*promise = listener->mPromiseHolder.get());
  return NS_OK;
}

void LiveView::OnMessageAdded(Message* aMessage) {
  if (!mListener || !mCx || !Matches(*aMessage)) {
    return;
  }

  Rooted<JSObject*> obj(mCx);
  CreateJSMessage(aMessage, mCx, obj);
  Rooted<Value> message(mCx, ObjectValue(*obj));
  MutableHandle<Value> handle(&message);
  mListener->OnMessageAdded(handle);
}

void LiveView::OnMessageRemoved(Message* aMessage, uint32_t oldFlags) {
  if (!mListener || !mCx || !Matches(*aMessage)) {
    return;
  }

  Rooted<JSObject*> obj(mCx);
  CreateJSMessage(aMessage, mCx, obj);
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
