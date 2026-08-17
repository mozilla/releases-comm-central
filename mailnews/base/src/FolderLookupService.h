/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
#ifndef COMM_MAILNEWS_BASE_SRC_FOLDERLOOKUPSERVICE_H_
#define COMM_MAILNEWS_BASE_SRC_FOLDERLOOKUPSERVICE_H_

#include "nsIFolderLookupService.h"
#include "nsIMsgFolder.h"
#include "nsIWeakReferenceUtils.h"
#include "nsTHashMap.h"

class FolderLookupService final : public nsIFolderLookupService {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIFOLDERLOOKUPSERVICE

  FolderLookupService() = default;
  FolderLookupService(const FolderLookupService&) = delete;
  FolderLookupService& operator=(const FolderLookupService&) = delete;

 protected:
  virtual ~FolderLookupService() = default;

 private:
  /**
   * Internal helper to find a folder (which may or may not be dangling).
   * Will return `nullptr` if the folder does not exist, and will only
   * fail on invalid input arguments.
   */
  nsCOMPtr<nsIMsgFolder> GetExisting(const nsACString& url);
  /**
   * Internal helper to create a new folder given a URL and place it
   * in the cache. The newly created folder will be dangling and
   * needs to be parented by a calling function.
   */
  nsresult CreateDangling(const nsACString& url, nsIMsgFolder** folder);
  /**
   * If the folder found in the cache for |url| is a parentless virtual folder,
   * remove it from the cache and null out |folder| so that callers create a
   * fresh folder object instead of reusing the stale one.
   *
   * The cache holds weak references. If a deleted or renamed virtual folder is
   * still strongly referenced elsewhere, its cache entry continues to resolve
   * to the detached folder object. Don't reuse that object: re-parenting it
   * would cause those references to silently point to a completely different
   * logical folder that incorrectly inherits the Virtual flag (and with it,
   * the saved search's scope and terms).
   *
   * Parentlessness alone does not identify a stale cache entry: legacy folder
   * creation and recreation paths can temporarily use parentless non-virtual
   * folder objects. Therefore, this check cannot yet be generalized to all
   * folders. `GetFlag` is used rather than `GetFlags` so that checking the flag
   * doesn't touch the deleted folder's message database, which would recreate
   * its summary file.
   *
   * This is a legacy folder-system concern; when Panorama is enabled the folder
   * cache is managed differently and entries are never evicted here.
   *
   * On return, |folder| is null if the folder was discarded.
   */
  void MaybeDiscardParentlessVirtualFolder(const nsACString& url,
                                           nsCOMPtr<nsIMsgFolder>& folder);

  nsTHashMap<nsCString, nsWeakPtr> mFolderCache;
};

#endif  // COMM_MAILNEWS_BASE_SRC_FOLDERLOOKUPSERVICE_H_
