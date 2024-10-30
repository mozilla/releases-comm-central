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

MOZ_RUNINIT nsCOMPtr<mozIStorageConnection> FolderDatabase::sConnection;
MOZ_RUNINIT nsTHashMap<nsCString, nsCOMPtr<mozIStorageStatement>>
    FolderDatabase::sStatements;
MOZ_RUNINIT nsTHashMap<uint64_t, RefPtr<Folder>> FolderDatabase::sFoldersById;
MOZ_RUNINIT nsTHashMap<nsCString, RefPtr<Folder>>
    FolderDatabase::sFoldersByPath;
MOZ_CONSTINIT FolderComparator FolderDatabase::sComparator;

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
  nsresult rv = GetStatement(
      "Folders"_ns,
      "WITH RECURSIVE parents(id, parent, ordinal, name, flags, level) AS ("
      "  VALUES(0, NULL, NULL, NULL, NULL, 0)"
      "  UNION ALL "
      "  SELECT"
      "    f.id,"
      "    f.parent,"
      "    f.ordinal,"
      "    f.name,"
      "    f.flags,"
      "    p.level + 1 AS next_level"
      "  FROM folders f JOIN parents p ON f.parent=p.id"
      "  ORDER BY next_level DESC"
      ")"
      "SELECT id, parent, ordinal, name, flags FROM parents LIMIT -1 OFFSET 1"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  bool hasResult;
  uint64_t id;
  uint64_t parentId;
  bool ordinalIsNull;
  uint64_t ordinal;
  uint32_t len;
  nsAutoCString name;
  uint64_t flags;
  Folder* root = nullptr;
  Folder* parent = nullptr;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    id = stmt->AsInt64(0);
    parentId = stmt->AsInt64(1);
    ordinalIsNull = stmt->IsNull(2);
    ordinal = stmt->AsInt64(2);
    name = stmt->AsSharedUTF8String(3, &len);
    flags = stmt->AsInt64(4);

    RefPtr<Folder> current = new Folder(id, name, flags);
    if (ordinalIsNull) {
      current->mOrdinal.reset();
    } else {
      current->mOrdinal.emplace(ordinal);
    }

    while (parent && parentId != parent->mId) {
      parent = parent->mParent;
    }
    if (!parent) {
      root = current;
    }

    current->mRoot = root;
    current->mParent = parent;
    if (parent) {
      parent->mChildren.InsertElementSorted(current, sComparator);
    }
    parent = current;

    sFoldersById.InsertOrUpdate(id, current);
    // Could probably optimise this.
    nsAutoCString path;
    current->GetPath(path);
    sFoldersByPath.InsertOrUpdate(path, current);
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

NS_IMETHODIMP FolderDatabase::GetFolderByPath(const nsACString& aPath,
                                              nsIFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  *aFolder = nullptr;
  RefPtr<Folder> folder;
  if (sFoldersByPath.Get(aPath, &folder)) {
    NS_IF_ADDREF(*aFolder = folder);
  }
  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::MoveFolderWithin(nsIFolder* aParent, nsIFolder* aChild,
                                 nsIFolder* aBefore) {
  MOZ_ASSERT(aParent);
  MOZ_ASSERT(aChild);

  Folder* parent = (Folder*)(aParent);
  Folder* child = (Folder*)(aChild);
  if (!parent->mChildren.Contains(child)) {
    NS_WARNING("aChild is not a child of aParent");
    return NS_ERROR_UNEXPECTED;
  }
  if (aChild == aBefore) {
    NS_WARNING("aChild is the same folder as aBefore");
    return NS_ERROR_UNEXPECTED;
  }

  if (!aBefore) {
    parent->mChildren.RemoveElement(child);
    parent->mChildren.AppendElement(child);
    SaveOrdinals(parent->mChildren);
    return NS_OK;
  }

  Folder* before = (Folder*)(aBefore);
  if (!parent->mChildren.Contains(before)) {
    NS_WARNING("aBefore is not a child of aParent");
    return NS_ERROR_UNEXPECTED;
  }

  parent->mChildren.RemoveElement(child);
  parent->mChildren.InsertElementAt(parent->mChildren.IndexOf(before), child);
  SaveOrdinals(parent->mChildren);

  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::MoveFolderTo(nsIFolder* aNewParent, nsIFolder* aChild) {
  MOZ_ASSERT(aNewParent);
  MOZ_ASSERT(aChild);

  Folder* child = (Folder*)(aChild);
  if (!child->mParent) {
    NS_WARNING("cannot move a root folder");
    return NS_ERROR_UNEXPECTED;
  }
  if (child->mParent == aNewParent) {
    return NS_OK;
  }
  if (child == aNewParent) {
    NS_WARNING("aChild cannot be made a child of itself");
    return NS_ERROR_UNEXPECTED;
  }
  bool isDescendant;
  aNewParent->IsDescendantOf(child, &isDescendant);
  if (isDescendant) {
    NS_WARNING("aChild cannot be made a descendant of itself");
    return NS_ERROR_UNEXPECTED;
  }

  Folder* newParent = (Folder*)(aNewParent);
  if (child->mRoot != newParent->mRoot) {
    NS_WARNING("moving to a different root");
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  GetStatement(
      "Reparent"_ns,
      "UPDATE folders SET parent = :parent, ordinal = NULL WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("parent"_ns, newParent->mId);
  stmt->BindInt64ByName("id"_ns, child->mId);
  stmt->Execute();
  stmt->Reset();

  nsAutoCString path;
  child->GetPath(path);
  sFoldersByPath.Remove(path);

  child->mParent->mChildren.RemoveElement(child);
  newParent->mChildren.InsertElementSorted(child, sComparator);
  child->mParent = newParent;
  child->mOrdinal.reset();

  child->GetPath(path);
  sFoldersByPath.InsertOrUpdate(path, child);

  return NS_OK;
}

void FolderDatabase::SaveOrdinals(nsTArray<RefPtr<Folder>>& folders) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv =
      GetStatement("UpdateOrdinals"_ns,
                   "UPDATE folders SET ordinal = :ordinal WHERE id = :id"_ns,
                   getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS_VOID(rv);

  uint64_t ordinal = 1;
  for (auto f : folders) {
    stmt->BindInt64ByName("ordinal"_ns, ordinal);
    stmt->BindInt64ByName("id"_ns, f->mId);
    stmt->Execute();
    stmt->Reset();
    ordinal++;
  }
}

NS_IMETHODIMP
FolderDatabase::UpdateFlags(nsIFolder* aFolder, uint64_t aNewFlags) {
  NS_ENSURE_ARG_POINTER(aFolder);

  Folder* folder = (Folder*)(aFolder);
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = GetStatement(
      "UpdateFlags"_ns, "UPDATE folders SET flags = :flags WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  stmt->BindInt64ByName("flags"_ns, aNewFlags);
  stmt->BindInt64ByName("id"_ns, folder->mId);

  rv = stmt->Execute();
  if (NS_SUCCEEDED(rv)) {
    folder->mFlags = aNewFlags;
  }

  stmt->Reset();
  return rv;
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
