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

uint64_t LiveViewFilter::nextUID = 1;

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
      mClause.Append(mFolderFilter->GetSQLClause());
    }
    if (mClause.IsEmpty()) {
      mClause.Assign("1");
    }
  }
  return mClause;
}

/**
 * Fill the parameters in an SQL query from the current filters.
 */
void LiveView::PrepareStatement(mozIStorageStatement* aStatement) {
  if (mFolderFilter) {
    mFolderFilter->PrepareStatement(aStatement);
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
    DatabaseCore::sConnection->CreateStatement(sql, getter_AddRefs(mCountStmt));
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
    DatabaseCore::sConnection->CreateStatement(
        sql, getter_AddRefs(mCountUnreadStmt));
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
                                    const char* sender, const char* subject,
                                    uint64_t flags, const char* tags,
                                    JSContext* aCx) {
  Rooted<JSObject*> obj(aCx, JS_NewPlainObject(aCx));

  JS_DefineProperty(aCx, obj, "id", (double)(id), JSPROP_ENUMERATE);

  JS_DefineProperty(aCx, obj, "folderId", (double)(folderId), JSPROP_ENUMERATE);

  Rooted<Value> val1(aCx, StringValue(JS_NewStringCopyZ(aCx, messageId)));
  JS_DefineProperty(aCx, obj, "messageId", val1, JSPROP_ENUMERATE);

  Rooted<JSObject*> val2(aCx,
                         NewDateObject(aCx, TimeClip(date / PR_USEC_PER_MSEC)));
  JS_DefineProperty(aCx, obj, "date", val2, JSPROP_ENUMERATE);

  Rooted<Value> val3(aCx, StringValue(JS_NewStringCopyZ(aCx, sender)));
  JS_DefineProperty(aCx, obj, "sender", val3, JSPROP_ENUMERATE);

  Rooted<Value> val4(aCx, StringValue(JS_NewStringCopyZ(aCx, subject)));
  JS_DefineProperty(aCx, obj, "subject", val4, JSPROP_ENUMERATE);

  JS_DefineProperty(aCx, obj, "flags", (double)(flags), JSPROP_ENUMERATE);

  Rooted<Value> val5(aCx, StringValue(JS_NewStringCopyZ(aCx, tags)));
  JS_DefineProperty(aCx, obj, "tags", val5, JSPROP_ENUMERATE);

  return obj;
}

/**
 * Create an object of JS primitives representing a message.
 */
JSObject* LiveView::CreateJSMessage(Message* aMessage, JSContext* aCx) {
  return CreateJSMessage(aMessage->mId, aMessage->mFolderId,
                         aMessage->mMessageId.get(), aMessage->mDate,
                         aMessage->mSender.get(), aMessage->mSubject.get(),
                         aMessage->mFlags, aMessage->mTags.get(), aCx);
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
    DatabaseCore::sConnection->CreateStatement(sql,
                                               getter_AddRefs(mSelectStmt));
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
    subject = mSelectStmt->AsSharedUTF8String(5, &len);
    flags = mSelectStmt->AsInt64(6);
    tags = mSelectStmt->AsSharedUTF8String(7, &len);

    JSObject* obj = CreateJSMessage(id, folderId, messageId, date, sender,
                                    subject, flags, tags, aCx);
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
