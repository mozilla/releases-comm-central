/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DatabaseCore_h__
#define DatabaseCore_h__

#include "FolderDatabase.h"
#include "MessageDatabase.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsIDatabaseCore.h"
#include "nsIObserver.h"
#include "nsTHashMap.h"

namespace mozilla {
namespace mailnews {

class DatabaseCore : public nsIDatabaseCore,
                     public nsIObserver,
                     public MessageListener {
 public:
  DatabaseCore();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDATABASECORE
  NS_DECL_NSIOBSERVER

  // MessageListener functions.
  void OnMessageAdded(Folder* folder, Message* message) override;
  void OnMessageRemoved(Folder* folder, Message* message) override;

 protected:
  virtual ~DatabaseCore() {};

 private:
  friend class FolderDatabase;
  friend class MessageDatabase;

  static nsresult GetStatement(const nsCString& aName, const nsCString& aSQL,
                               mozIStorageStatement** aStmt);

 private:
  friend class LiveView;

  static nsCOMPtr<mozIStorageConnection> sConnection;

 private:
  static nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>> sStatements;

  static nsresult EnsureConnection();

  RefPtr<FolderDatabase> mFolderDatabase;
  RefPtr<MessageDatabase> mMessageDatabase;
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // DatabaseCore_h__
