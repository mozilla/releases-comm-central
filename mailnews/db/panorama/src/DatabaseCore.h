/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef DatabaseCore_h__
#define DatabaseCore_h__

#include "FolderDatabase.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsIDatabaseCore.h"
#include "nsIObserver.h"
#include "nsTHashMap.h"

namespace mozilla {
namespace mailnews {

class DatabaseCore : public nsIDatabaseCore, public nsIObserver {
 public:
  DatabaseCore();

  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIDATABASECORE
  NS_DECL_NSIOBSERVER

 protected:
  virtual ~DatabaseCore() {};

 private:
  friend class FolderDatabase;

  static nsresult GetStatement(const nsCString& aName, const nsCString& aSQL,
                               mozIStorageStatement** aStmt);

 private:
  static nsCOMPtr<mozIStorageConnection> sConnection;
  static nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>> sStatements;

  static nsresult EnsureConnection();

  RefPtr<FolderDatabase> mFolderDatabase;
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // DatabaseCore_h__
