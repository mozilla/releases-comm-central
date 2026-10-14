/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "DatabaseCore.h"
#include "mozilla/Result.h"
#include "mozStorageHelper.h"
#include "nsCOMPtr.h"
#include "nsIMsgFolder.h"
#include "nsMsgUtils.h"
#include "SearchFolderHits.h"

namespace mozilla::mailnews {

Result<uint64_t, nsresult> FolderURIToId(const nsACString& folderURI) {
  nsCOMPtr<nsIMsgFolder> searchFolder;
  MOZ_TRY(GetExistingFolder(folderURI, getter_AddRefs(searchFolder)));

  uint64_t folderId;
  MOZ_TRY(searchFolder->GetId(&folderId));

  return folderId;
}

Result<bool, nsresult> SearchFolderHitsCache::KeyIsInCache(uint64_t folderId,
                                                           nsMsgKey msgKey) {
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "KeyIsInCache"_ns,
      "SELECT message_id FROM search_folder_hits WHERE folder_id = :folderId AND message_id = :messageId"_ns,
      getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt64ByName("messageId"_ns, msgKey);

  bool hasResult;
  MOZ_TRY(stmt->ExecuteStep(&hasResult));

  return hasResult;
}

nsresult SearchFolderHitsCache::AddHitsForFolder(
    uint64_t folderId, const nsTArray<nsMsgKey>& msgKeys) {
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "AddHitsForFolder"_ns,
      // If a consumer accidentally tries to insert the same row twice, let's
      // make this a no-op.
      "INSERT INTO search_folder_hits(folder_id, message_id) VALUES(:folderId, :messageId) ON CONFLICT DO NOTHING"_ns,
      getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);

  // Ideally we'd use a `mozIStorageBindingParamsArray` and run all the
  // insertions at once, but `mozIStorageStatement` requires us to execute the
  // statement asynchronously if we have more than one set of parameters, which
  // doesn't work well with our legacy synchronous consumers.
  for (uint64_t i = 0; i < msgKeys.Length(); i++) {
    stmt->BindInt64ByName("folderId"_ns, folderId);
    stmt->BindInt64ByName("messageId"_ns, msgKeys[i]);
    MOZ_TRY(stmt->Execute());
  }

  return NS_OK;
}

nsresult SearchFolderHitsCache::RemoveHitForFolder(uint64_t folderId,
                                                   nsMsgKey msgKey) {
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "RemoveHitForFolder"_ns,
      "DELETE FROM search_folder_hits WHERE folder_id = :folderId AND message_id = :messageId"_ns,
      getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("folderId"_ns, folderId);
  stmt->BindInt32ByName("messageId"_ns, msgKey);
  MOZ_TRY(stmt->Execute());

  return NS_OK;
}

nsresult SearchFolderHitsCache::RemoveAllHitsForFolder(uint64_t folderId) {
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "RemoveAllHitsForFolder"_ns,
      "DELETE FROM search_folder_hits WHERE folder_id = :folderId"_ns,
      getter_AddRefs(stmt)));
  mozStorageStatementScoper scoper(stmt);

  stmt->BindInt64ByName("folderId"_ns, folderId);
  MOZ_TRY(stmt->Execute());

  return NS_OK;
}

Result<nsCOMPtr<mozIStorageStatement>, nsresult>
SearchFolderHitsCache::SelectAllForFolderStmt(uint64_t folderId) {
  nsCOMPtr<mozIStorageStatement> stmt;
  MOZ_TRY(DatabaseCore::GetStatement(
      "SelectAllForFolderStmt"_ns,
      "SELECT message_id FROM search_folder_hits WHERE folder_id = :folderId ORDER BY message_id"_ns,
      getter_AddRefs(stmt)));

  stmt->BindInt64ByName("folderId"_ns, folderId);

  return stmt;
}

}  // namespace mozilla::mailnews
