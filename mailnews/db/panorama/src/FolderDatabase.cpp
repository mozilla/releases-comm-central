/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderDatabase.h"

#include "Folder.h"
#include "mozilla/ScopeExit.h"
#include "mozilla/Services.h"
#include "mozIStorageService.h"
#include "nsAppDirectoryServiceDefs.h"
#include "nsCOMPtr.h"
#include "nsIFile.h"
#include "nsIObserverService.h"
#include "xpcpublic.h"

namespace mozilla {
namespace mailnews {

NS_IMPL_ISUPPORTS(FolderDatabase, nsIFolderDatabase, nsIObserver)

nsCOMPtr<mozIStorageConnection> FolderDatabase::sConnection;
nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>>
    FolderDatabase::sStatements;
nsTHashMap<uint64_t, RefPtr<Folder>> FolderDatabase::sFoldersById;

FolderDatabase::FolderDatabase() {
  MOZ_ASSERT(!sConnection, "creating a second FolderDatabase");

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  obs->AddObserver(this, "profile-before-change", false);
}

NS_IMETHODIMP
FolderDatabase::Observe(nsISupports* aSubject, const char* aTopic,
                        const char16_t* aData) {
  if (strcmp(aTopic, "profile-before-change")) {
    return NS_OK;
  }

  for (auto iter = sStatements.Iter(); !iter.Done(); iter.Next()) {
    iter.UserData()->Finalize();
  }
  sStatements.Clear();

  sFoldersById.Clear();

  if (sConnection) {
    sConnection->Close();
  }

  nsCOMPtr<nsIObserverService> obs = mozilla::services::GetObserverService();
  obs->RemoveObserver(this, "profile-before-change");

  return NS_OK;
}

/**
 * Ensures a mozIStorageConnection to panorama.sqlite in the profile folder.
 */
nsresult FolderDatabase::EnsureConnection() {
  if (sConnection) {
    return NS_OK;
  }

  nsCOMPtr<nsIFile> databaseFile;
  nsresult rv = NS_GetSpecialDirectory(NS_APP_USER_PROFILE_50_DIR,
                                       getter_AddRefs(databaseFile));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> file;
  rv = databaseFile->Append(u"panorama.sqlite"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageService> storage =
      do_GetService("@mozilla.org/storage/service;1");
  NS_ENSURE_STATE(storage);

  rv = storage->OpenUnsharedDatabase(databaseFile,
                                     mozIStorageService::CONNECTION_DEFAULT,
                                     getter_AddRefs(sConnection));
  NS_ENSURE_SUCCESS(rv, rv);

  return NS_OK;
}

/**
 * Create and cache an SQL statement.
 */
nsresult FolderDatabase::GetStatement(const nsCString& aName,
                                      const nsCString& aSQL,
                                      mozIStorageStatement** aStmt) {
  NS_ENSURE_ARG_POINTER(aStmt);

  nsresult rv = EnsureConnection();
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<mozIStorageStatement> stmt;
  if (sStatements.Get(aName, &stmt)) {
    NS_IF_ADDREF(*aStmt = stmt);
    return NS_OK;
  }

  rv = sConnection->CreateStatement(aSQL, getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  sStatements.InsertOrUpdate(aName, stmt);
  NS_IF_ADDREF(*aStmt = stmt);

  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::LoadFolders() {
  sFoldersById.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv =
      GetStatement("Folders"_ns,
                   "WITH RECURSIVE parents(id, parent, name, level) AS ("
                   "  VALUES(0, NULL, NULL, 0)"
                   "  UNION ALL "
                   "  SELECT f.id, f.parent, f.name, p.level + 1 AS next_level"
                   "    FROM folders f JOIN parents p ON f.parent=p.id"
                   "    ORDER BY next_level DESC"
                   ")"
                   "SELECT id, parent, name FROM parents LIMIT -1 OFFSET 1"_ns,
                   getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasResult;
  uint64_t id;
  uint64_t parentId;
  uint32_t len;
  nsAutoCString name;
  Folder* parent = nullptr;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    id = stmt->AsInt64(0);
    parentId = stmt->AsInt64(1);
    name = stmt->AsSharedUTF8String(2, &len);
    RefPtr<Folder> current = new Folder(id, name);

    while (parent && parentId != parent->mId) {
      parent = parent->mParent;
    }

    current->mParent = parent;
    if (parent) {
      parent->mChildren.AppendElement(current);
    }
    parent = current;

    sFoldersById.InsertOrUpdate(id, current);
  }
  stmt->Reset();

  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderById(const uint64_t aId,
                                            nsIFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  *aFolder = nullptr;
  RefPtr<Folder> folder;
  if (sFoldersById.Get(aId, &folder)) {
    NS_IF_ADDREF(*aFolder = folder);
  }
  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::GetConnection(mozIStorageConnection** aConnection) {
  if (!xpc::IsInAutomation()) {
    return NS_ERROR_NOT_AVAILABLE;
  }

  NS_ENSURE_ARG_POINTER(aConnection);

  nsresult rv = EnsureConnection();
  NS_ENSURE_SUCCESS(rv, rv);

  NS_IF_ADDREF(*aConnection = sConnection);
  return NS_OK;
}

}  // namespace mailnews
}  // namespace mozilla
