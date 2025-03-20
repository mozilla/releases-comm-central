/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderDatabase.h"

#include "DatabaseCore.h"
#include "DatabaseUtils.h"
#include "Folder.h"
#include "FolderCollector.h"
#include "FolderComparator.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozilla/ScopeExit.h"
#include "nsCOMPtr.h"
#include "nsIFolder.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgFolderCache.h"
#include "nsIMsgIncomingServer.h"
#include "nsThreadUtils.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::MarkerOptions;
using mozilla::MarkerTiming;

namespace mozilla::mailnews {

extern LazyLogModule gPanoramaLog;  // Defined by DatabaseCore.

NS_IMPL_ISUPPORTS(FolderDatabase, nsIFolderDatabase)

/**
 * Initialization functions. Initialization occurs mostly off the main thread
 * and the Promise returned by `Startup` resolves when it is complete.
 * Code MUST NOT attempt to access folders before then. Folder notifications
 * are not emitted during initialization.
 */

nsresult FolderDatabase::Startup() {
  MOZ_ASSERT(NS_IsMainThread(), "loadfolders must happen on the main thread");

  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("FolderDatabase starting up"));
  PROFILER_MARKER_UNTYPED("FolderDatabase::LoadFolders", OTHER,
                          MarkerOptions(MarkerTiming::IntervalStart()));

  InternalLoadFolders();

  PROFILER_MARKER_UNTYPED("FolderDatabase::LoadFolders", OTHER,
                          MarkerOptions(MarkerTiming::IntervalEnd()));
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("FolderDatabase startup complete"));

  return NS_OK;
}

/**
 * Reads from the database into `Folder` objects, and creates the hierarchy.
 */
nsresult FolderDatabase::InternalLoadFolders() {
  mFoldersById.Clear();

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
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
      parent->mChildren.InsertElementSorted(current, mComparator);
    }
    parent = current;

    mFoldersById.InsertOrUpdate(id, current);
    // Could probably optimise this.
    mFoldersByPath.InsertOrUpdate(current->GetPath(), current);
  }
  stmt->Reset();

  return NS_OK;
}

/**
 * Shutdown.
 */

void FolderDatabase::Shutdown() {
  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("FolderDatabase shutting down"));

  // Break the reference cycles. This is much tidier than using the cycle
  // collection macros, especially as Folder is declared threadsafe.
  for (auto iter = mFoldersById.Iter(); !iter.Done(); iter.Next()) {
    iter.UserData()->mRoot = nullptr;
    iter.UserData()->mParent = nullptr;
    iter.UserData()->mChildren.Clear();
  }

  mFoldersById.Clear();
  mFoldersByPath.Clear();

  MOZ_LOG(gPanoramaLog, LogLevel::Info, ("FolderDatabase shutdown complete"));
}

/**
 * Lookup functions.
 */

NS_IMETHODIMP FolderDatabase::GetFolderById(const uint64_t aId,
                                            nsIFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  *aFolder = nullptr;
  RefPtr<Folder> folder;
  if (mFoldersById.Get(aId, &folder)) {
    NS_IF_ADDREF(*aFolder = folder);
  }
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderByPath(const nsACString& aPath,
                                              nsIFolder** aFolder) {
  NS_ENSURE_ARG_POINTER(aFolder);

  *aFolder = nullptr;
  RefPtr<Folder> folder;
  if (mFoldersByPath.Get(DatabaseUtils::Normalize(aPath), &folder)) {
    NS_IF_ADDREF(*aFolder = folder);
  }
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderForMsgFolder(nsIMsgFolder* aMsgFolder,
                                                    nsIFolder** aFolder) {
  NS_ENSURE_ARG(aMsgFolder);
  NS_ENSURE_ARG_POINTER(aFolder);

  nsresult rv;

  // If we're at the root, get the corresponding nsIFolder from the database.
  bool isServer;
  aMsgFolder->GetIsServer(&isServer);
  if (isServer) {
    nsCOMPtr<nsIMsgIncomingServer> incomingServer;
    rv = aMsgFolder->GetServer(getter_AddRefs(incomingServer));
    NS_ENSURE_SUCCESS(rv, rv);
    nsAutoCString serverKey;
    rv = incomingServer->GetKey(serverKey);
    NS_ENSURE_SUCCESS(rv, rv);

    rv = GetFolderByPath(serverKey, aFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  // Traverse up the ancestors until we get to the root.
  nsCOMPtr<nsIMsgFolder> msgParent;
  rv = aMsgFolder->GetParent(getter_AddRefs(msgParent));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIFolder> parent;
  rv = GetFolderForMsgFolder(msgParent, getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!parent) {
    return NS_ERROR_FAILURE;
  }

  // Get the subfolder with the name we're looking for.
  nsAutoCString msgName;
  rv = aMsgFolder->GetName(msgName);
  NS_ENSURE_SUCCESS(rv, rv);

  return parent->GetChildNamed(msgName, aFolder);
}

NS_IMETHODIMP FolderDatabase::GetMsgFolderForFolder(nsIFolder* aFolder,
                                                    nsIMsgFolder** aMsgFolder) {
  NS_ENSURE_ARG(aFolder);
  NS_ENSURE_ARG_POINTER(aMsgFolder);

  nsresult rv;

  // If we're at the root, get the corresponding nsIMsgFolder from the
  // account manager.
  bool isServer;
  aFolder->GetIsServer(&isServer);
  if (isServer) {
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        components::AccountManager::Service();

    nsCOMPtr<nsIMsgIncomingServer> incomingServer;
    rv = accountManager->GetIncomingServer(aFolder->GetName(),
                                           getter_AddRefs(incomingServer));
    NS_ENSURE_SUCCESS(rv, rv);

    rv = incomingServer->GetRootFolder(aMsgFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  // Traverse up the ancestors until we get to the root.
  nsCOMPtr<nsIFolder> parent;
  rv = aFolder->GetParent(getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<nsIMsgFolder> msgParent;
  rv = GetMsgFolderForFolder(parent, getter_AddRefs(msgParent));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!msgParent) {
    return NS_ERROR_FAILURE;
  }

  // Get the subfolder with the name we're looking for.
  nsAutoCString msgName;
  rv = aFolder->GetName(msgName);
  NS_ENSURE_SUCCESS(rv, rv);

  return msgParent->GetChildNamed(msgName, aMsgFolder);
}

/**
 * Modification functions.
 */

NS_IMETHODIMP FolderDatabase::InsertRoot(const nsACString& aServerKey,
                                         nsIFolder** aRoot) {
  NS_ENSURE_ARG_POINTER(aRoot);

  // `aServerKey` is almost certainly ASCII, but normalize it and be sure.
  nsCString normalKey = DatabaseUtils::Normalize(aServerKey);
  GetFolderByPath(normalKey, aRoot);
  if (*aRoot) {
    MOZ_LOG(gPanoramaLog, LogLevel::Info,
            ("InsertRoot found existing root '%s'\n", normalKey.get()));
    return NS_OK;
  }

  return InternalInsertFolder(nullptr, normalKey, aRoot);
}

NS_IMETHODIMP FolderDatabase::InsertFolder(nsIFolder* aParent,
                                           const nsACString& aName,
                                           nsIFolder** aChild) {
  NS_ENSURE_ARG(aParent);
  NS_ENSURE_ARG_POINTER(aChild);

  Folder* parent = (Folder*)(aParent);
  nsCString normalName = DatabaseUtils::Normalize(aName);
  for (auto child : parent->mChildren) {
    if (child->mName.Equals(normalName)) {
      NS_IF_ADDREF(*aChild = child);
      MOZ_LOG(gPanoramaLog, LogLevel::Info,
              ("InsertFolder found existing folder '%s'\n",
               child->GetPath().get()));
      return NS_OK;
    }
  }

  return InternalInsertFolder(aParent, aName, aChild);
}

/**
 * Common function for inserting a folder row and creating a Folder object
 * for it. This will fail if a folder with the given parent and name already
 * exists, so the calling function needs to check.
 *
 * `aName` must already be normalized.
 */
nsresult FolderDatabase::InternalInsertFolder(nsIFolder* aParent,
                                              const nsACString& aName,
                                              nsIFolder** aChild) {
  NS_ENSURE_ARG_POINTER(aChild);

  Folder* parent = (Folder*)(aParent);

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement(
      "InsertFolder"_ns,
      "INSERT INTO folders (parent, name) VALUES (:parent, :name) RETURNING id, flags"_ns,
      getter_AddRefs(stmt));

  stmt->BindInt64ByName("parent"_ns, parent ? parent->mId : 0);
  stmt->BindUTF8StringByName("name"_ns, aName);
  bool hasResult;
  nsresult rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    stmt->Reset();
    return NS_ERROR_UNEXPECTED;
  }

  uint64_t id = stmt->AsInt64(0);
  uint64_t flags = stmt->AsInt64(1);
  stmt->Reset();

  RefPtr<Folder> child = new Folder(id, nsCString(aName), flags);
  child->mParent = parent;

  if (parent) {
    child->mRoot = parent->mRoot;
    parent->mChildren.InsertElementSorted(child, mComparator);
  } else {
    child->mRoot = child;
  }

  mFoldersById.InsertOrUpdate(id, child);
  mFoldersByPath.InsertOrUpdate(child->GetPath(), child);

  MOZ_LOG(gPanoramaLog, LogLevel::Info,
          ("InternalInsertFolder created new folder '%s' (id=%" PRIu64 ")\n",
           child->GetPath().get(), id));

  NS_IF_ADDREF(*aChild = child);
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::DeleteFolder(nsIFolder* aFolder) {
  if (aFolder->GetIsServer()) {
    NS_WARNING("using DeleteFolder on a root folder is forbidden");
    return NS_ERROR_UNEXPECTED;
  }

  InternalDeleteFolder(aFolder);

  return NS_OK;
}

nsresult FolderDatabase::InternalDeleteFolder(nsIFolder* aFolder) {
  Folder* folder = (Folder*)(aFolder);
  for (auto child : folder->mChildren.Clone()) {
    InternalDeleteFolder(child);
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("DeleteFolder"_ns,
                             "DELETE FROM folders WHERE id = :id"_ns,
                             getter_AddRefs(stmt));

  stmt->BindInt64ByName("id"_ns, aFolder->GetId());
  stmt->Execute();

  nsCString path = folder->GetPath();
  mFoldersById.Remove(folder->mId);
  mFoldersByPath.Remove(path);

  RefPtr<Folder> parent = folder->mParent;
  if (parent) {
    parent->mChildren.RemoveElement(folder);
  }
  folder->mRoot = nullptr;
  folder->mParent = nullptr;

  MOZ_LOG(gPanoramaLog, LogLevel::Info,
          ("DeleteFolder removed folder '%s' (id=%" PRIu64 ")", path.get(),
           folder->mId));

  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::Reconcile(
    nsIFolder* aParent, const nsTArray<nsCString>& aChildNames) {
  NS_ENSURE_ARG(aParent);

  Folder* parent = (Folder*)(aParent);
  nsTArray<nsCString> childNames = aChildNames.Clone();

  for (auto child : parent->mChildren.Clone()) {
    if (!childNames.RemoveElement(child->mName)) {
      DeleteFolder(child);
    }
  }

  for (auto childName : childNames) {
    nsCOMPtr<nsIFolder> unused;
    InsertFolder(parent, childName, getter_AddRefs(unused));
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
  DatabaseCore::GetStatement(
      "Reparent"_ns,
      "UPDATE folders SET parent = :parent, ordinal = NULL WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  stmt->BindInt64ByName("parent"_ns, newParent->mId);
  stmt->BindInt64ByName("id"_ns, child->mId);
  stmt->Execute();
  stmt->Reset();

  mFoldersByPath.Remove(child->GetPath());

  child->mParent->mChildren.RemoveElement(child);
  newParent->mChildren.InsertElementSorted(child, mComparator);
  child->mParent = newParent;
  child->mOrdinal.reset();

  mFoldersByPath.InsertOrUpdate(child->GetPath(), child);

  return NS_OK;
}

void FolderDatabase::SaveOrdinals(nsTArray<RefPtr<Folder>>& folders) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "UpdateOrdinals"_ns,
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
  nsresult rv = DatabaseCore::GetStatement(
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

nsresult FolderDatabase::GetFolderProperty(uint64_t id, const nsACString& name,
                                           nsACString& value) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetFolderProperty"_ns,
      "SELECT value FROM folder_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));

  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    uint32_t len;
    value = stmt->AsSharedUTF8String(0, &len);
  }
  stmt->Reset();

  return rv;
}

nsresult FolderDatabase::GetFolderProperty(uint64_t id, const nsACString& name,
                                           int64_t* value) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetFolderProperty"_ns,
      "SELECT value FROM folder_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));

  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *value = stmt->AsInt64(0);
  }
  stmt->Reset();

  return rv;
}

nsresult FolderDatabase::SetFolderProperty(uint64_t id, const nsACString& name,
                                           const nsACString& value) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "SetFolderProperty"_ns,
      "REPLACE INTO folder_properties (id, name, value) VALUES (:id, :name, :value)"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));
  stmt->BindUTF8StringByName("value"_ns, value);
  return stmt->Execute();
}

nsresult FolderDatabase::SetFolderProperty(uint64_t id, const nsACString& name,
                                           int64_t value) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "SetFolderProperty"_ns,
      "REPLACE INTO folder_properties (id, name, value) VALUES (:id, :name, :value)"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));
  stmt->BindInt64ByName("value"_ns, value);
  return stmt->Execute();
}

}  // namespace mozilla::mailnews
