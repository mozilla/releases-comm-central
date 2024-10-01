/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef FolderDatabase_h__
#define FolderDatabase_h__

#include "FolderComparator.h"
#include "mozilla/RefPtr.h"
#include "mozIStorageConnection.h"
#include "mozIStorageStatement.h"
#include "nsIFolderDatabase.h"
#include "nsIObserver.h"
#include "nsTHashMap.h"

namespace mozilla {
namespace mailnews {

class Folder;

class FolderDatabase : public nsIFolderDatabase, nsIObserver {
 public:
  FolderDatabase();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIFOLDERDATABASE
  NS_DECL_NSIOBSERVER

 protected:
  virtual ~FolderDatabase() {};

 private:
  static nsCOMPtr<mozIStorageConnection> sConnection;
  static nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>> sStatements;
  static nsTHashMap<uint64_t, RefPtr<Folder>> sFoldersById;
  static nsTHashMap<nsCString, RefPtr<Folder>> sFoldersByPath;
  static FolderComparator sComparator;

  static nsresult EnsureConnection();
  static nsresult GetStatement(const nsCString& aName, const nsCString& aSQL,
                               mozIStorageStatement** aStmt);

  static void SaveOrdinals(nsTArray<RefPtr<Folder>>& aFolders);
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // FolderDatabase_h__
