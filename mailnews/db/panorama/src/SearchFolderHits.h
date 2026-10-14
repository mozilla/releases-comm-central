/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_PANORAMA_SRC_SEARCHFOLDERHITS_H_
#define COMM_MAILNEWS_DB_PANORAMA_SRC_SEARCHFOLDERHITS_H_

#include "ErrorList.h"
#include "MailNewsTypes2.h"
#include "mozIStorageStatement.h"
#include "nsTArrayForwardDeclare.h"

namespace mozilla::mailnews {

/**
 * A convenience function for mapping a folder URI (often used by legacy APIs to
 * interact with this cache) to a folder ID in Panorama.
 */
Result<uint64_t, nsresult> FolderURIToId(const nsACString& folderURI);

/**
 * A collection of static methods to interact with the persisted cache of search
 * results.
 *
 * Implementation detail: in theory we could turn those methods into functions
 * (outside of a class), but this would require making
 * `DatabaseCore::GetStatement` public.
 */
class SearchFolderHitsCache {
 public:
  explicit SearchFolderHitsCache() = default;

  /**
   * Returns whether the message referred to by the given key exists in the
   * search result cache for the given folder.
   */
  static Result<bool, nsresult> KeyIsInCache(uint64_t folderId,
                                             nsMsgKey msgKey);

  /**
   * Instantiates a database statement that selects all messages in the given
   * folder's search results cache.
   */
  static Result<nsCOMPtr<mozIStorageStatement>, nsresult>
  SelectAllForFolderStmt(uint64_t folderId);

  /**
   * Records the given messages into this folder's search results cache.
   */
  static nsresult AddHitsForFolder(uint64_t folderId,
                                   const nsTArray<nsMsgKey>& msgKeys);

  /**
   * Removes the given message from this folder's search results cache.
   */
  static nsresult RemoveHitForFolder(uint64_t folderId, nsMsgKey msgKey);

  /**
   * Removes all messages from this folder's search results cache.
   */
  static nsresult RemoveAllHitsForFolder(uint64_t folderId);

 private:
  virtual ~SearchFolderHitsCache() = default;
};

}  // namespace mozilla::mailnews

#endif  // COMM_MAILNEWS_DB_PANORAMA_SRC_SEARCHFOLDERHITS_H_
