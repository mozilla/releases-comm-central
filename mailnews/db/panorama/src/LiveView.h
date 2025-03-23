/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef LiveView_h__
#define LiveView_h__

#include "js/Context.h"
#include "LiveViewFilters.h"
#include "MessageDatabase.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsCOMPtr.h"
#include "nsILiveView.h"

namespace mozilla::mailnews {

class LiveView : public nsILiveView, public MessageListener {
 public:
  LiveView() : mSortColumn(LiveView::SortColumn::DATE), mSortDescending(true) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSILIVEVIEW

  void OnMessageAdded(Message* message) override;
  void OnMessageRemoved(Message* message) override;

 private:
  virtual ~LiveView() {
    delete mFolderFilter;

    if (mCountStmt) mCountStmt->Finalize();
    if (mCountUnreadStmt) mCountUnreadStmt->Finalize();
    if (mSelectStmt) mSelectStmt->Finalize();
  }

  nsCString GetSQLClause();
  void PrepareStatement(mozIStorageStatement* aStatement);
  bool Matches(Message& aMessage);

  nsAutoCString mClause;
  LiveViewFilter* mFolderFilter = nullptr;

  nsILiveView::SortColumn mSortColumn;
  bool mSortDescending;

  nsCOMPtr<mozIStorageStatement> mCountStmt;
  nsCOMPtr<mozIStorageStatement> mCountUnreadStmt;
  nsCOMPtr<mozIStorageStatement> mSelectStmt;

  JSObject* CreateJSMessage(uint64_t id, uint64_t folderId,
                            const char* messageId, PRTime date,
                            const char* sender, const char* subject,
                            uint64_t flags, const char* tags, JSContext* aCx);
  JSObject* CreateJSMessage(Message* aMessage, JSContext* aCx);

  // The one and only listener for this live view, if set.
  nsCOMPtr<nsILiveViewListener> mListener;
  // The JS context containing `mListener`. Used for creating JS objects to
  // pass to the listener.
  JSContext* mCx;
};

}  // namespace mozilla::mailnews

#endif  // LiveView_h__
