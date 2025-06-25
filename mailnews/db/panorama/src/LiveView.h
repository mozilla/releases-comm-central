/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEW_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEW_H_

#include "js/Context.h"
#include "LiveViewFilters.h"
#include "MessageDatabase.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsILiveView.h"
#include "nsIVariant.h"

namespace mozilla::mailnews {

class LiveView : public nsILiveView, public MessageListener {
 public:
  LiveView() : mSortColumn(LiveView::SortColumn::DATE), mSortDescending(true) {
    RefPtr<DatabaseCore> database = DatabaseCore::GetInstanceForService();
    mMessageDatabase = database->mMessageDatabase;
  }

  NS_DECL_ISUPPORTS
  NS_DECL_NSILIVEVIEW

  void OnMessageAdded(Message* message) override;
  void OnMessageRemoved(Message* message) override;
  void OnMessageFlagsChanged(Message* message, uint64_t oldFlags,
                             uint64_t newFlags) override;

 private:
  virtual ~LiveView() {
    delete mFolderFilter;

    if (mCountStmt) mCountStmt->Finalize();
    if (mCountUnreadStmt) mCountUnreadStmt->Finalize();
    if (mSelectStmt) mSelectStmt->Finalize();
  }

  RefPtr<MessageDatabase> mMessageDatabase;

  nsCString GetSQLClause();
  void PrepareStatement(mozIStorageStatement* aStatement);
  bool Matches(Message& aMessage);

  nsAutoCString mClause;
  nsTArray<RefPtr<nsIVariant>> mParams;
  LiveViewFilter* mFolderFilter = nullptr;

  nsILiveView::SortColumn mSortColumn;
  bool mSortDescending;

  nsCOMPtr<mozIStorageStatement> mCountStmt;
  nsCOMPtr<mozIStorageStatement> mCountUnreadStmt;
  nsCOMPtr<mozIStorageStatement> mSelectStmt;

  JSObject* CreateJSMessage(uint64_t id, uint64_t folderId,
                            const char* messageId, PRTime date,
                            const char* sender, const char* recipients,
                            const char* subject, uint64_t flags,
                            const char* tags, JSContext* aCx);
  JSObject* CreateJSMessage(Message* aMessage, JSContext* aCx);

  // The one and only listener for this live view, if set.
  nsCOMPtr<nsILiveViewListener> mListener;
  // The JS context containing `mListener`. Used for creating JS objects to
  // pass to the listener.
  JSContext* mCx;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEW_H_
