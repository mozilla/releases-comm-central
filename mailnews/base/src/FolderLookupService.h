/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
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

  nsTHashMap<nsCString, nsWeakPtr> mFolderCache;
};

#endif  // COMM_MAILNEWS_BASE_SRC_FOLDERLOOKUPSERVICE_H_
