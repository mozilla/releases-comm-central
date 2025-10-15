/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderDatabase.h"

#include "DatabaseCore.h"
#include "DatabaseUtils.h"
#include "FolderComparator.h"
#include "mozilla/Components.h"
#include "mozilla/Logging.h"
#include "mozilla/ProfilerMarkers.h"
#include "mozIStorageStatement.h"
#include "mozStorageHelper.h"
#include "nsCOMPtr.h"
#include "nsIMsgAccountManager.h"
#include "nsIMsgIncomingServer.h"
#include "nsMsgFolderFlags.h"
#include "nsMsgUtils.h"       // For PercentEncode().
#include "nsReadableUtils.h"  // For StringJoin().
#include "nsThreadUtils.h"

using mozilla::LazyLogModule;
using mozilla::LogLevel;
using mozilla::MarkerOptions;
using mozilla::MarkerTiming;

namespace mozilla::mailnews {

extern LazyLogModule gPanoramaLog;  // Defined by DatabaseCore.

NS_IMPL_ISUPPORTS(FolderDatabase, nsIFolderDatabase)

/**
 * Lookup functions.
 */

NS_IMETHODIMP FolderDatabase::GetFolderByPath(const nsACString& path,
                                              uint64_t* folderId) {
  NS_ENSURE_ARG_POINTER(folderId);

  uint64_t curId = 0;  // start with root part.
  for (auto const& part : path.Split('/')) {
    // Percent-decode each part.
    // Note, no NFC normalisation (GetFolderChildNamed() does that).
    // TODO: This is general percent decoding. Maybe paths should _only_
    // percent-encode '/'?
    nsAutoCString name(part);
    NS_UnescapeURL(name);

    curId = MOZ_TRY(GetFolderChildNamed(curId, name));
    if (curId == 0) {
      *folderId = 0;  // Path not found!
      return NS_OK;
    }
  }
  *folderId = curId;
  return NS_OK;
}

// NOTE: This is the _only_ thing that couples FolderDatabase to
// nsIMsgFolder. It'd be nice to get rid of this linkage entirely (moving
// this function out to accountmanager or something).
NS_IMETHODIMP FolderDatabase::GetMsgFolderForFolder(uint64_t folderId,
                                                    nsIMsgFolder** msgFolder) {
  NS_ENSURE_ARG(folderId);  // Folder 0 disallowed.
  NS_ENSURE_ARG_POINTER(msgFolder);
  nsresult rv;

  nsCString name = MOZ_TRY(GetFolderName(folderId));
  uint64_t parentId = MOZ_TRY(GetFolderParent(folderId));
  if (!parentId) {
    // If we're at the root, get the corresponding nsIMsgFolder from the
    // account manager.
    nsCOMPtr<nsIMsgAccountManager> accountManager =
        components::AccountManager::Service();
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = accountManager->GetIncomingServer(name, getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = server->GetRootFolder(msgFolder);
    NS_ENSURE_SUCCESS(rv, rv);
    return NS_OK;
  }

  // Traverse up the ancestors until we get to the root.
  nsCOMPtr<nsIMsgFolder> msgParent;
  rv = GetMsgFolderForFolder(parentId, getter_AddRefs(msgParent));
  NS_ENSURE_SUCCESS(rv, rv);
  if (!msgParent) {
    return NS_ERROR_FAILURE;
  }

  // Get the subfolder with the name we're looking for.
  rv = msgParent->GetChildNamed(name, msgFolder);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

/**
 * Modification functions.
 */

NS_IMETHODIMP FolderDatabase::InsertRoot(const nsACString& serverKey,
                                         uint64_t* rootId) {
  NS_ENSURE_ARG_POINTER(rootId);

  // `serverKey` is almost certainly ASCII, but normalize it and be sure.
  nsCString nfcServerKey = DatabaseUtils::Normalize(serverKey);
  return InternalInsertFolder(0, nfcServerKey, rootId);
}

NS_IMETHODIMP FolderDatabase::InsertFolder(uint64_t parentId,
                                           const nsACString& name,
                                           uint64_t* childId) {
  NS_ENSURE_ARG(parentId);
  NS_ENSURE_ARG_POINTER(childId);

  nsCString nfcName = DatabaseUtils::Normalize(name);
  return InternalInsertFolder(parentId, nfcName, childId);
}

/**
 * Common function for creating a new folder.
 * This will fail if a folder with the given parent and name already
 * exists (because of unique (name,parent) constraint in db).
 *
 * `parentId` may be 0, to add a root folder.
 * `name` must already be normalized.
 */
nsresult FolderDatabase::InternalInsertFolder(uint64_t parentId,
                                              const nsACString& name,
                                              uint64_t* childId) {
  MOZ_ASSERT(DatabaseUtils::Normalize(name) == name);
  NS_ENSURE_ARG_POINTER(childId);

  // DB has uniqueness constraint upon (parent, name).
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "InsertFolder"_ns,
      "INSERT INTO folders (parent, name) VALUES (:parent, :name) RETURNING id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("parent"_ns, parentId);  // parentId can be 0 for root.
  stmt->BindUTF8StringByName("name"_ns, name);
  bool hasResult;
  rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    return NS_ERROR_UNEXPECTED;
  }

  uint64_t id = stmt->AsInt64(0);

  // We've already got the data, so may as well enter it in the cache.
  {
    CachedFolder cached;
    cached.id = id;
    cached.parent = parentId;
    cached.ordinal = Nothing();
    cached.name = name;
    cached.flags = 0;
    MOZ_ALWAYS_TRUE(mFolderCache.put(id, cached));
  }

  MOZ_LOG(gPanoramaLog, LogLevel::Info,
          ("InternalInsertFolder created new folder '%s' (id=%" PRIu64 ")\n",
           GetFolderPath(id).unwrapOr(""_ns).get(), id));
  *childId = id;
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::DeleteFolder(uint64_t folderId) {
  uint64_t parentId = MOZ_TRY(GetFolderParent(folderId));
  if (!parentId) {
    NS_WARNING("using DeleteFolder on a root folder is forbidden");
    return NS_ERROR_UNEXPECTED;
  }

  // Delete the target folder _AND_ all its descendants.
  nsTArray<uint64_t> doomed = MOZ_TRY(GetFolderDescendants(folderId));
  doomed.AppendElement(folderId);

  // TODO: Presumably, we should also be deleting (or unlinking) any
  // messages in these folders!

  // Awkward uint64_t -> int64_t conversion.
  nsTArray<int64_t> ids(doomed.Length());
  for (uint64_t id : doomed) {
    ids.AppendElement((int64_t)id);
  }
  nsCOMPtr<mozIStorageStatement> stmt;
  DatabaseCore::GetStatement("DeleteFolder"_ns,
                             "DELETE FROM folders WHERE id IN carray(?1)"_ns,
                             getter_AddRefs(stmt));

  MOZ_TRY(stmt->BindArrayOfIntegersByIndex(0, ids));
  nsresult rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Update cache.
  for (uint64_t id : doomed) {
    mFolderCache.remove(id);
  }

  MOZ_LOG(gPanoramaLog, LogLevel::Info,
          ("DeleteFolder removed folder %" PRIu64, folderId));

  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::Reconcile(uint64_t parentId,
                                        const nsTArray<nsCString>& childNames) {
  // Step One: delete any folders in the db that aren't in the list (but
  // not virtual folders).
  // TODO: (BenC) - I don't think we should do this step. Even for local
  // folders, I think the database should be the source of truth for folder
  // existence.
  nsTArray<uint64_t> childIds = MOZ_TRY(GetFolderChildrenUnsorted(parentId));
  for (auto childId : childIds) {
    nsCString childName = MOZ_TRY(GetFolderName(childId));
    uint32_t childFlags = MOZ_TRY(GetFolderFlags(childId));
    // TODO: really should be using an NFC-normalized `childNames` here.
    if (!childNames.Contains(childName) &&
        !(childFlags & nsMsgFolderFlags::Virtual)) {
      MOZ_TRY(DeleteFolder(childId));
    }
  }

  // Step Two: create any folders which are in `childNames`, but not in DB.
  for (auto const& childName : childNames) {
    uint64_t childId = MOZ_TRY(GetFolderChildNamed(parentId, childName));
    if (childId == 0) {
      // It's not in the DB!
      uint64_t newChildId;
      MOZ_TRY(InsertFolder(parentId, childName, &newChildId));
    }
  }

  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::MoveFolderWithin(uint64_t parentId, uint64_t childId,
                                 uint64_t beforeId) {
  nsTArray<uint64_t> children = MOZ_TRY(GetFolderChildren(parentId));

  // Remove the folder we're moving around.
  if (!children.RemoveElement(childId)) {
    NS_WARNING("childId is not a child of parent");
    return NS_ERROR_UNEXPECTED;
  }

  if (beforeId == 0) {
    // Special case - missing beforeId indicates end.
    children.AppendElement(childId);
  } else {
    auto idx = children.IndexOf(beforeId);
    if (idx == nsTArray<uint64_t>::NoIndex) {
      NS_WARNING("beforeId is not a child of parent");
      return NS_ERROR_UNEXPECTED;
    }

    // Reinsert the child before beforeId.
    children.InsertElementAt(idx, childId);
  }

  // Recalculate the ordinal fields for all the children.
  nsresult rv = SaveOrdinals(children);
  NS_ENSURE_SUCCESS(rv, rv);
  return NS_OK;
}

// Each folder is assigned an incrementing ordinal value in the order
// given, starting at 1.
nsresult FolderDatabase::SaveOrdinals(nsTArray<uint64_t> const& folderIds) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "UpdateOrdinals"_ns,
      "UPDATE folders SET ordinal = :ordinal WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  uint64_t ordinal = 1;
  for (auto folderId : folderIds) {
    stmt->BindInt64ByName("ordinal"_ns, ordinal);
    stmt->BindInt64ByName("id"_ns, folderId);
    rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
    stmt->Reset();

    // Update cache.
    auto p = mFolderCache.lookup(folderId);
    if (p) {
      p->value().ordinal = Some(ordinal);
    }
    ordinal++;
  }
  return NS_OK;
}

// Null out the ordinal field for every child of this parent.
NS_IMETHODIMP
FolderDatabase::ResetChildOrder(uint64_t parentId) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "ResetOrdinals"_ns,
      "UPDATE folders SET ordinal = NULL WHERE parent = :parent"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("parent"_ns, parentId);
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Update cache.
  for (auto it = mFolderCache.iter(); !it.done(); it.next()) {
    if (it.get().value().parent == parentId) {
      it.get().value().ordinal.reset();
    }
  }
  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::MoveFolderTo(uint64_t newParentId, uint64_t childId) {
  NS_ENSURE_ARG(childId);

  // Sanity checks.
  uint64_t oldParentId = MOZ_TRY(GetFolderParent(childId));
  if (!oldParentId) {
    NS_WARNING("cannot move a root folder");
    return NS_ERROR_UNEXPECTED;
  }
  if (childId == newParentId) {
    NS_WARNING("child cannot be made a child of itself");
    return NS_ERROR_UNEXPECTED;
  }

  if (newParentId == oldParentId) {
    return NS_OK;
  }

  nsTArray<uint64_t> descendants = MOZ_TRY(GetFolderDescendants(childId));
  if (descendants.Contains(newParentId)) {
    NS_WARNING("child cannot be made a descendant of itself");
    return NS_ERROR_UNEXPECTED;
  }

  // Don't allow cross-server moves.
  // TODO: The DB can support this just fine, and there's no hard reason to
  // disallow it here. It could actually be really useful, so this
  // restriction should be imposed by the nsIMsgFolder layer instead.
  uint64_t newParentRootId = MOZ_TRY(GetFolderRoot(newParentId));
  uint64_t oldParentRootId = MOZ_TRY(GetFolderRoot(oldParentId));
  if (newParentRootId != oldParentRootId) {
    NS_WARNING("child cannot move to a different root");
    return NS_ERROR_UNEXPECTED;
  }

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "Reparent"_ns,
      "UPDATE folders SET parent = :parent, ordinal = NULL WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);
  stmt->BindInt64ByName("parent"_ns, newParentId);
  stmt->BindInt64ByName("id"_ns, childId);
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Update cache.
  auto p = mFolderCache.lookup(childId);
  if (p) {
    p->value().ordinal.reset();
    p->value().parent = newParentId;
  }

  return NS_OK;
}

NS_IMETHODIMP
FolderDatabase::UpdateName(uint64_t folderId, const nsACString& newName) {
  NS_ENSURE_ARG(folderId);
  nsCString nfcNewName = DatabaseUtils::Normalize(newName);

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "UpdateName"_ns, "UPDATE folders SET name = :name WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);
  stmt->BindUTF8StringByName("name"_ns, nfcNewName);
  stmt->BindInt64ByName("id"_ns, folderId);

  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Update cache.
  auto p = mFolderCache.lookup(folderId);
  if (p) {
    p->value().name = nfcNewName;
  }

  return rv;
}

NS_IMETHODIMP
FolderDatabase::UpdateFlags(uint64_t folderId, uint64_t newFlags) {
  NS_ENSURE_ARG(folderId);

  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "UpdateFlags"_ns, "UPDATE folders SET flags = :flags WHERE id = :id"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);
  stmt->BindInt64ByName("flags"_ns, newFlags);
  stmt->BindInt64ByName("id"_ns, folderId);

  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  // Update cache.
  auto p = mFolderCache.lookup(folderId);
  if (p) {
    p->value().flags = newFlags;
  }

  return NS_OK;
}

nsresult FolderDatabase::GetFolderProperty(uint64_t id, const nsACString& name,
                                           nsACString& value) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetFolderProperty"_ns,
      "SELECT value FROM folder_properties WHERE id = :id AND name = :name"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));

  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    uint32_t len;
    value = stmt->AsSharedUTF8String(0, &len);
  }

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
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("id"_ns, id);
  stmt->BindUTF8StringByName("name"_ns, DatabaseUtils::Normalize(name));

  bool hasResult;
  if (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    *value = stmt->AsInt64(0);
  }

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

nsresult FolderDatabase::GetVirtualFolderFolders(
    uint64_t virtualFolderId, nsTArray<uint64_t>& searchFolderIds) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "GetVirtualFolderFolders"_ns,
      "SELECT searchFolderId FROM virtualFolder_folders WHERE virtualFolderId = :virtualFolderId"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("virtualFolderId"_ns, virtualFolderId);

  searchFolderIds.Clear();
  bool hasResult;
  while (NS_SUCCEEDED(stmt->ExecuteStep(&hasResult)) && hasResult) {
    uint64_t searchFolderId = (uint64_t)stmt->AsInt64(0);
    searchFolderIds.AppendElement(searchFolderId);
  }

  return NS_OK;
}

nsresult FolderDatabase::SetVirtualFolderFolders(
    uint64_t virtualFolderId, nsTArray<uint64_t>& searchFolderIds) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv = DatabaseCore::GetStatement(
      "SetVirtualFolderFolders1"_ns,
      "DELETE FROM virtualFolder_folders WHERE virtualFolderId = :virtualFolderId"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  stmt->BindInt64ByName("virtualFolderId"_ns, virtualFolderId);
  rv = stmt->Execute();
  NS_ENSURE_SUCCESS(rv, rv);

  rv = DatabaseCore::GetStatement(
      "SetVirtualFolderFolders2"_ns,
      "INSERT INTO virtualFolder_folders (virtualFolderId, searchFolderId) VALUES (:virtualFolderId, :searchFolderId)"_ns,
      getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto searchFolderId : searchFolderIds) {
    stmt->BindInt64ByName("virtualFolderId"_ns, virtualFolderId);
    stmt->BindInt64ByName("searchFolderId"_ns, searchFolderId);
    rv = stmt->Execute();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  return NS_OK;
}

Result<nsCString, nsresult> FolderDatabase::GetFolderName(uint64_t folderId) {
  MOZ_ASSERT(folderId);
  CachedFolder* cached = MOZ_TRY(EnsureFolderCached(folderId));
  return cached->name;
}

Result<nsCString, nsresult> FolderDatabase::GetFolderPath(uint64_t folderId) {
  MOZ_ASSERT(folderId);

  nsTArray<nsCString> encodedParts;
  while (true) {
    CachedFolder* cached = MOZ_TRY(EnsureFolderCached(folderId));
    nsCString encodedName =
        PercentEncode(cached->name, [](char c) -> bool { return c == '/'; });
    encodedParts.AppendElement(encodedName);
    folderId = cached->parent;
    if (cached->parent == 0) {
      break;  // We've reached the root.
    }
  }
  encodedParts.Reverse();
  return StringJoin("/"_ns, encodedParts);
}

Result<uint32_t, nsresult> FolderDatabase::GetFolderFlags(uint64_t folderId) {
  MOZ_ASSERT(folderId);
  CachedFolder* cached = MOZ_TRY(EnsureFolderCached(folderId));
  return cached->flags;
}

Result<Maybe<uint64_t>, nsresult> FolderDatabase::GetFolderOrdinal(
    uint64_t folderId) {
  MOZ_ASSERT(folderId);
  CachedFolder* cached = MOZ_TRY(EnsureFolderCached(folderId));
  return cached->ordinal;
}

Result<uint64_t, nsresult> FolderDatabase::GetFolderParent(uint64_t folderId) {
  MOZ_ASSERT(folderId);
  CachedFolder* cached = MOZ_TRY(EnsureFolderCached(folderId));
  return cached->parent;
}

Result<nsTArray<uint64_t>, nsresult> FolderDatabase::GetFolderChildrenUnsorted(
    uint64_t folderId) {
  // folderId can be 0, to return root folders.
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(
      DatabaseCore::GetStatement("GetFolderChildren"_ns,
                                 "SELECT id "
                                 " FROM folders WHERE parent = :parentid "_ns,
                                 getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);
  stmt->BindInt64ByName("parentid"_ns, (int64_t)folderId);

  nsTArray<uint64_t> children;
  while (true) {
    bool hasResult;
    MOZ_TRY(stmt->ExecuteStep(&hasResult));
    if (!hasResult) {
      break;
    }
    uint64_t childId = (uint64_t)stmt->AsInt64(0);
    MOZ_ASSERT(!children.Contains(childId));  // Cycle detected!
    children.AppendElement(childId);
  }
  return children;
}

Result<nsTArray<uint64_t>, nsresult> FolderDatabase::GetFolderChildren(
    uint64_t folderId) {
  // folderId can be 0, to return root folders.
  nsTArray<uint64_t> children = MOZ_TRY(GetFolderChildrenUnsorted(folderId));

  children.Sort(mComparator);
  return children;
};

Result<uint64_t, nsresult> FolderDatabase::GetFolderChildNamed(
    uint64_t folderId, nsACString const& childName) {
  // folderId can be 0, to search root folders.
  nsCString nfcName = DatabaseUtils::Normalize(childName);

  // Have a quick rummage through the cache first.
  for (auto it = mFolderCache.iter(); !it.done(); it.next()) {
    if (it.get().value().parent == folderId &&
        it.get().value().name == nfcName) {
      return it.get().key();
    }
  }

  // Hit the DB.
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "GetFolderChildNamed"_ns,
      "SELECT id "
      " FROM folders WHERE parent = :parentid AND name = :name "_ns,
      getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);
  stmt->BindInt64ByName("parentid"_ns, (int64_t)folderId);
  stmt->BindUTF8StringByName("name"_ns, nfcName);
  bool hasResult;
  MOZ_TRY(stmt->ExecuteStep(&hasResult));
  if (hasResult) {
    return (uint64_t)stmt->AsInt64(0);
  }
  return 0;  // Not found.
}

Result<uint64_t, nsresult> FolderDatabase::GetFolderRoot(uint64_t folderId) {
  MOZ_ASSERT(folderId);
  while (true) {
    uint64_t parent = MOZ_TRY(GetFolderParent(folderId));
    if (parent == 0) {
      break;
    }
    folderId = parent;
  }
  return folderId;
}

nsresult FolderDatabase::InternalAppendDescendants(
    uint64_t folderId, nsTArray<uint64_t>& descendants) {
  nsTArray<uint64_t> children = MOZ_TRY(GetFolderChildren(folderId));
  for (uint64_t child : children) {
    descendants.AppendElement(child);
    MOZ_TRY(InternalAppendDescendants(child, descendants));
  }
  return NS_OK;
}

Result<nsTArray<uint64_t>, nsresult> FolderDatabase::GetFolderDescendants(
    uint64_t folderId) {
  nsTArray<uint64_t> descendants;
  MOZ_TRY(InternalAppendDescendants(folderId, descendants));
  return descendants;
}

Result<nsTArray<uint64_t>, nsresult> FolderDatabase::GetFolderAncestors(
    uint64_t folderId) {
  MOZ_ASSERT(folderId);
  nsTArray<uint64_t> ancestors;
  // Don't include self.
  folderId = MOZ_TRY(GetFolderParent(folderId));
  while (folderId) {
    MOZ_ASSERT(!ancestors.Contains(folderId));  // Cycle detected!
    ancestors.AppendElement(folderId);
    folderId = MOZ_TRY(GetFolderParent(folderId));
  }
  return ancestors;
}

// Populate a CachedFolder entry from the database.
nsresult FolderDatabase::FetchFolderData(uint64_t folderId,
                                         CachedFolder& cached) {
  nsCOMPtr<mozIStorageStatement> stmt;
  nsresult rv =
      DatabaseCore::GetStatement("FetchFolder"_ns,
                                 "SELECT id, parent, ordinal, name, flags "
                                 " FROM folders WHERE id = :id"_ns,
                                 getter_AddRefs(stmt));
  NS_ENSURE_SUCCESS(rv, rv);
  mozStorageStatementScoper scoper(stmt);
  stmt->BindInt64ByName("id"_ns, (uint64_t)folderId);

  bool hasResult;
  rv = stmt->ExecuteStep(&hasResult);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!hasResult) {
    return NS_ERROR_UNEXPECTED;
  }

  cached.id = (uint64_t)stmt->AsInt64(0);
  cached.parent = (uint64_t)stmt->AsInt64(1);
  cached.ordinal =
      stmt->IsNull(2) ? Nothing() : Some((uint64_t)stmt->AsInt64(2));
  uint32_t len;
  cached.name = stmt->AsSharedUTF8String(3, &len);
  cached.flags = (uint32_t)stmt->AsInt64(4);
  return NS_OK;
}

// Return cached data for a folder, loading it in from the DB if needed.
Result<FolderDatabase::CachedFolder*, nsresult>
FolderDatabase::EnsureFolderCached(uint64_t folderId) {
  auto p = mFolderCache.lookupForAdd(folderId);
  if (!p) {
    TrimCache();
    CachedFolder cached;
    nsresult rv = FetchFolderData(folderId, cached);
    if (NS_FAILED(rv)) {
      return Err(rv);
    }
    if (!mFolderCache.add(p, folderId, cached)) {
      return Err(NS_ERROR_FAILURE);
    }
  }
  return &p->value();
}

void FolderDatabase::TrimCache() {
  // Standin cache policy:
  // Grow to maxEntries, then discard an arbitrary 25%.
  // Probably no point being too clever here.
  constexpr uint32_t maxEntries = 512;
  if (mFolderCache.count() < maxEntries) {
    return;
  }
  // Throw away 25%. Don't care which.
  uint32_t n = maxEntries / 4;
  for (auto it = mFolderCache.modIter(); !it.done(); it.next()) {
    if (!n) {
      break;
    }
    it.remove();
    --n;
  }
}

// XPCOM wrappers

NS_IMETHODIMP FolderDatabase::GetFolderName(uint64_t folderId,
                                            nsACString& name) {
  NS_ENSURE_ARG(folderId);
  name = MOZ_TRY(GetFolderName(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderPath(uint64_t folderId,
                                            nsACString& path) {
  NS_ENSURE_ARG(folderId);
  path = MOZ_TRY(GetFolderPath(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderFlags(uint64_t folderId,
                                             uint32_t* flags) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG_POINTER(flags);
  *flags = MOZ_TRY(GetFolderFlags(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderIsServer(uint64_t folderId,
                                                bool* isServer) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG_POINTER(isServer);
  // Root/Server folders are just top-level ones with no parent.
  uint64_t parentId = MOZ_TRY(GetFolderParent(folderId));
  *isServer = (parentId == 0);
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderParent(uint64_t folderId,
                                              uint64_t* parentId) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG_POINTER(parentId);
  *parentId = MOZ_TRY(GetFolderParent(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderChildren(uint64_t folderId,
                                                nsTArray<uint64_t>& children) {
  children = MOZ_TRY(GetFolderChildren(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderChildNamed(uint64_t folderId,
                                                  nsACString const& childName,
                                                  uint64_t* childId) {
  // folderId can be 0 to access root folders.
  NS_ENSURE_ARG_POINTER(childId);
  *childId = MOZ_TRY(GetFolderChildNamed(folderId, childName));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderRoot(uint64_t folderId,
                                            uint64_t* rootId) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG_POINTER(rootId);
  *rootId = MOZ_TRY(GetFolderRoot(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderDescendants(
    uint64_t folderId, nsTArray<uint64_t>& descendants) {
  descendants = MOZ_TRY(GetFolderDescendants(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderAncestors(
    uint64_t folderId, nsTArray<uint64_t>& ancestors) {
  NS_ENSURE_ARG(folderId);  // Can't call with null folder.
  ancestors = MOZ_TRY(GetFolderAncestors(folderId));
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderIsDescendantOf(
    uint64_t folderId, uint64_t potentialAncestorId, bool* isDescendant) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG(potentialAncestorId);
  // Note inverted search - it's likely quicker to search ancestors than
  // descendants.
  nsTArray<uint64_t> ancestorIds = MOZ_TRY(GetFolderAncestors(folderId));
  *isDescendant = ancestorIds.Contains(potentialAncestorId);
  return NS_OK;
}

NS_IMETHODIMP FolderDatabase::GetFolderIsAncestorOf(
    uint64_t folderId, uint64_t potentialDescendantId, bool* isAncestor) {
  NS_ENSURE_ARG(folderId);
  NS_ENSURE_ARG(potentialDescendantId);
  nsTArray<uint64_t> ancestorIds =
      MOZ_TRY(GetFolderAncestors(potentialDescendantId));
  *isAncestor = ancestorIds.Contains(folderId);
  return NS_OK;
}

}  // namespace mozilla::mailnews
