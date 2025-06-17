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

LazyLogModule gLiveViewLog("panorama");

NS_IMPL_ISUPPORTS(LiveView, nsILiveView)

NS_IMETHODIMP LiveView::InitWithFolder(nsIFolder* aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  if (aFolder->GetFlags() & nsMsgFolderFlags::Virtual) {
    mFolderFilter = new VirtualFolderFilter(aFolder);
  } else {
    mFolderFilter = new SingleFolderFilter(aFolder);
  }
  return NS_OK;
}

NS_IMETHODIMP LiveView::InitWithFolders(
    const nsTArray<RefPtr<nsIFolder>>& aFolders) {
  for (auto folder : aFolders) {
    if (!folder) {
      return NS_ERROR_ILLEGAL_VALUE;
    }
  }

  if (mFolderFilter) {
    NS_WARNING("folder filter already set");
    return NS_ERROR_UNEXPECTED;
  }

  mFolderFilter = new MultiFolderFilter(aFolders);
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

NS_IMETHODIMP LiveView::GetSortColumn(nsILiveView::SortColumn* aSortColumn) {
  *aSortColumn = mSortColumn;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetSortColumn(nsILiveView::SortColumn aSortColumn) {
  mSortColumn = aSortColumn;
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
  return NS_OK;
}

NS_IMETHODIMP LiveView::GetSortDescending(bool* aSortDescending) {
  *aSortDescending = mSortDescending;
  return NS_OK;
}

NS_IMETHODIMP LiveView::SetSortDescending(bool aSortDescending) {
  mSortDescending = aSortDescending;
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
  return NS_OK;
}

/**
 * Create the WHERE part of an SQL query from the current filters.
 */
nsCString LiveView::GetSQLClause() {
  if (mClause.IsEmpty()) {
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
    nsAutoCString sql("SELECT COUNT(*) AS count FROM messages WHERE ");
    sql.Append(GetSQLClause());
    MOZ_LOG(gLiveViewLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  PrepareStatement(mCountStmt);
  bool hasResult;
  mCountStmt->ExecuteStep(&hasResult);
  *aCount = mCountStmt->AsInt64(0);
  mCountStmt->Reset();
  return NS_OK;
}

NS_IMETHODIMP LiveView::CountUnreadMessages(uint64_t* aCount) {
  if (!mCountUnreadStmt) {
    nsAutoCString sql("SELECT COUNT(*) AS count FROM messages WHERE ");
    sql.Append(GetSQLClause());
    sql.Append(" AND ~flags & ");
    sql.AppendInt(nsMsgMessageFlags::Read);
    MOZ_LOG(gLiveViewLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountUnreadStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  PrepareStatement(mCountUnreadStmt);
  bool hasResult;
  mCountUnreadStmt->ExecuteStep(&hasResult);
  *aCount = mCountUnreadStmt->AsInt64(0);
  mCountUnreadStmt->Reset();
  return NS_OK;
}

/**
 * Create an object of JS primitives representing a message.
 */
JSObject* LiveView::CreateJSMessage(uint64_t id, uint64_t folderId,
                                    const char* messageId, PRTime date,
                                    const char* sender, const char* recipients,
                                    const char* subject, uint64_t flags,
                                    const char* tags, JSContext* cx) {
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

  return obj;
}

/**
 * Create an object of JS primitives representing a message.
 */
JSObject* LiveView::CreateJSMessage(Message* aMessage, JSContext* cx) {
  return CreateJSMessage(
      aMessage->mId, aMessage->mFolderId, aMessage->mMessageId.get(),
      aMessage->mDate, aMessage->mSender.get(), aMessage->mRecipients.get(),
      aMessage->mSubject.get(), aMessage->mFlags, aMessage->mTags.get(), cx);
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
          tags \
        FROM messages \
        WHERE ");
    sql.Append(GetSQLClause());
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
    MOZ_LOG(gLiveViewLog, LogLevel::Debug, ("LiveView SQL: %s", sql.get()));
    nsresult rv = DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mSelectStmt));
    NS_ENSURE_SUCCESS(rv, rv);
  }

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

    JSObject* obj = CreateJSMessage(id, folderId, messageId, date, sender,
                                    recipients, subject, flags, tags, aCx);
    Rooted<Value> message(aCx, ObjectValue(*obj));
    JS_DefineElement(aCx, arr, count++, message, JSPROP_ENUMERATE);
  }

  if (NS_WARN_IF(!SetArrayLength(aCx, arr, count))) {
    return NS_ERROR_UNEXPECTED;
  }
  aMessages.set(ObjectValue(*arr));

  mSelectStmt->Reset();
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

void LiveView::OnMessageRemoved(Message* aMessage) {
  if (!mListener || !mCx || !Matches(*aMessage)) {
    return;
  }

  JSObject* obj = CreateJSMessage(aMessage, mCx);
  Rooted<Value> message(mCx, ObjectValue(*obj));
  MutableHandle<Value> handle(&message);
  mListener->OnMessageRemoved(handle);
}

void LiveView::OnMessageFlagsChanged(Message* message, uint64_t oldFlags,
                                     uint64_t newFlags) {}

NS_IMETHODIMP LiveView::SetListener(nsILiveViewListener* aListener,
                                    JSContext* aCx) {
  bool hadListener = mListener;
  mListener = aListener;
  mCx = aCx;

  if (!hadListener && aListener) {
    nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
    nsCOMPtr<nsIMessageDatabase> messages = database->GetMessages();
    messages->AddMessageListener(this);
  }
  return NS_OK;
}

NS_IMETHODIMP LiveView::ClearListener() {
  mListener = nullptr;
  mCx = nullptr;

  nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
  nsCOMPtr<nsIMessageDatabase> messages = database->GetMessages();
  messages->RemoveMessageListener(this);
  return NS_OK;
}

}  // namespace mozilla::mailnews
