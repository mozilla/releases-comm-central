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

using JS::Rooted;

namespace mozilla::mailnews {

class LiveView : public nsILiveView, public MessageListener {
 public:
  LiveView()
      : mSortColumn(nsILiveView::SortColumn::DATE),
        mSortDescending(true),
        mGrouping(nsILiveView::Grouping::UNTHREADED) {}

  NS_DECL_ISUPPORTS
  NS_DECL_NSILIVEVIEW

  void OnMessageAdded(Message* message) override;
  void OnMessageRemoved(Message* message, uint32_t oldFlags) override;
  void OnMessageFlagsChanged(Message* message, uint32_t oldFlags,
                             uint32_t newFlags) override;

 private:
  virtual ~LiveView() {
    delete mFolderFilter;
    ResetStatements();
  }

  MessageDatabase& MessageDB() const {
    return *DatabaseCore::sInstance->mMessageDatabase;
  }

  void ResetStatements();
  nsCString GetSQLClause();
  void PrepareStatement(mozIStorageStatement* aStatement);
  bool Matches(Message& aMessage);

  nsAutoCString mClause;
  nsTArray<RefPtr<nsIVariant>> mParams;
  LiveViewFilter* mFolderFilter = nullptr;

  nsILiveView::SortColumn mSortColumn;
  bool mSortDescending;
  nsILiveView::Grouping mGrouping;

  nsCOMPtr<mozIStorageStatement> mCountStmt;
  nsCOMPtr<mozIStorageStatement> mCountUnreadStmt;
  nsCOMPtr<mozIStorageStatement> mSelectStmt;
  nsCOMPtr<mozIStorageStatement> mSelectGroupStmt;

  // The one and only listener for this live view, if set.
  nsCOMPtr<nsILiveViewListener> mListener;
  // The JS context containing `mListener`. Used for creating JS objects to
  // pass to the listener.
  JSContext* mCx;
};

void CreateJSMessage(uint64_t id, uint64_t folderId, const char* messageId,
                     PRTime date, const char* sender, const char* recipients,
                     const char* subject, uint64_t flags, const char* tags,
                     uint64_t threadId, uint64_t threadParent, JSContext* aCx,
                     Rooted<JSObject*>&);
void CreateJSMessage(Message* aMessage, JSContext* aCx, Rooted<JSObject*>&);

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_LIVEVIEW_H_
