/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderLookupService.h"

#include <regex>

#include "mozilla/Preferences.h"
#include "mozilla/StaticPrefs_mail.h"
#include "msgCore.h"
#include "nsINetUtil.h"
#include "nsNetCID.h"

/**
 * Internal helper function to test if a folder is dangling or parented.
 * Because we can return folders that don't exist, and we may be working
 * with a deleted folder but we're still holding on to the reference. For
 * valid folders, one of two scenarios is true: either the folder has a parent
 * (the deletion code clears the parent to indicate its nonvalidity), or the
 * folder is a root folder of some server. Getting the root folder may throw
 * an exception if we attempted to create a server that doesn't exist, so we
 * need to guard for that error.
 */
static nsresult IsValidFolder(nsIMsgFolder* folder, bool& isValid) {
  NS_ENSURE_ARG_POINTER(folder);

  nsCOMPtr<nsIMsgFolder> parent;
  nsresult rv = folder->GetParent(getter_AddRefs(parent));
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> root;
  rv = folder->GetRootFolder(getter_AddRefs(root));
  if (NS_FAILED(rv) || !root) {
    isValid = false;
    return NS_OK;
  }

  isValid = parent || (root == folder);

  return NS_OK;
}

NS_IMPL_ISUPPORTS(FolderLookupService, nsIFolderLookupService)

NS_IMETHODIMP FolderLookupService::GetFolderForURL(const nsACString& url,
                                                   nsIMsgFolder** folder) {
  NS_ENSURE_ARG_POINTER(folder);

  *folder = nullptr;

  nsCOMPtr<nsIMsgFolder> existingFolder = GetExisting(url);

  if (!existingFolder) {
    return NS_OK;
  }

  bool isValid;
  nsresult rv = IsValidFolder(existingFolder, isValid);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!isValid) {
    return NS_OK;
  }

  existingFolder.forget(folder);

  return NS_OK;
}

NS_IMETHODIMP FolderLookupService::CreateFolderAndCache(
    nsIMsgFolder* parentFolder, const nsACString& name, nsIMsgFolder** folder) {
  NS_ENSURE_ARG(parentFolder);
  NS_ENSURE_ARG_POINTER(folder);

  *folder = nullptr;

  // Make sure the parent folder is already cached.
  nsCOMPtr<nsIMsgFolder> cachedParent = GetExisting(parentFolder->URI());
  if (!cachedParent) {
    return NS_ERROR_INVALID_ARG;
  }

  // URL encode the name for inclusion in a URI.
  nsresult rv;
  nsCOMPtr<nsINetUtil> netUtil = do_GetService(NS_NETUTIL_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  // We have to do this in two stages:
  // 1. Encode the string as a URL component. This properly escapes everything
  // that needs to be escaped in a URL, but leaves path separators in place.
  // 2. Now that we have a valid URL, we need to escape as a path component to
  // correctly encode path separators.
  nsAutoCString urlEncodedPath;
  rv = netUtil->EscapeString(name, nsINetUtil::ESCAPE_URL_PATH, urlEncodedPath);
  NS_ENSURE_SUCCESS(rv, rv);
  nsAutoCString urlEncodedName;
  const auto escapePathComponent = nsINetUtil::ESCAPE_URL_FILE_BASENAME |
                                   nsINetUtil::ESCAPE_URL_FILE_EXTENSION;
  rv = netUtil->EscapeURL(urlEncodedPath, escapePathComponent, urlEncodedName);
  NS_ENSURE_SUCCESS(rv, rv);

  // Construct the URI for the new folder given the parent folder's URI.
  nsAutoCString uri{parentFolder->URI()};
  uri.Append("/");
  uri.Append(urlEncodedName);

  // If we already have a folder in the cache for this URI, then return it.
  // NOTE: The proper thing to do here is to fail if we're trying to create a
  // folder that already exists and force management of the cache. However,
  // the cache currently also has the side effect of enforcing identity
  // equality by pointer for folders with the same URI, which is relied upon
  // throughout the codebase. This function is still an improvement over
  // `getOrCreateFromURL` because it enforces that folders all have a valid
  // parent folder, so they can't dangle. This also has the side effect of
  // maintaining any previously existing flags, but again, the code relies on
  // that maintenance.
  nsCOMPtr<nsIMsgFolder> folderToReturn = GetExisting(uri);
  if (!folderToReturn) {
    rv = CreateDangling(uri, getter_AddRefs(folderToReturn));
    NS_ENSURE_SUCCESS(rv, rv);
  }

  // If there is no folder at this point, that means we failed to create
  // the dangling folder, return an error.
  if (!folderToReturn) {
    NS_ERROR("Failed to create folder");
    return NS_ERROR_FAILURE;
  }

  // If the existing folder object has a parent, make sure it's the same parent.
  nsCOMPtr<nsIMsgFolder> obtainedParent;
  rv = folderToReturn->GetParent(getter_AddRefs(obtainedParent));
  NS_ENSURE_SUCCESS(rv, rv);
  if (obtainedParent && (obtainedParent != parentFolder)) {
    NS_ERROR("Folder cached parent is not the same as the provided parent");
    return NS_ERROR_INVALID_ARG;
  }

  // Either the folder existed and had the correct parent or was dangling, or
  // we created a dangling folder.  Either way, it needs its parent assigned.
  rv = folderToReturn->SetParent(parentFolder);
  NS_ENSURE_SUCCESS(rv, rv);

  folderToReturn.forget(folder);

  return NS_OK;
}

NS_IMETHODIMP FolderLookupService::GetOrCreateFolderForURL(
    const nsACString& url, nsIMsgFolder** folder) {
  NS_ENSURE_ARG_POINTER(folder);

  *folder = nullptr;

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> existingFolder = GetExisting(url);
  if (existingFolder) {
    // The folder object exists and it has a server with a type,
    // indicating that the server hasn't been removed.
    nsCOMPtr<nsIMsgIncomingServer> server;
    rv = existingFolder->GetServer(getter_AddRefs(server));
    NS_ENSURE_SUCCESS(rv, rv);
    if (server) {
      nsAutoCString type;
      rv = server->GetType(type);
      NS_ENSURE_SUCCESS(rv, rv);
      if (!type.IsEmpty()) {
        existingFolder.forget(folder);
        return NS_OK;
      }
    }
  }

  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = CreateDangling(url, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  newFolder.forget(folder);

  return NS_OK;
}

NS_IMETHODIMP FolderLookupService::Cache(const nsACString& url,
                                         nsIMsgFolder* folder) {
  NS_ENSURE_ARG(folder);
  if (!mozilla::StaticPrefs::mail_panorama_enabled_AtStartup()) {
    NS_ERROR(
        "nsIFolderLookupService::Cache must not be used when Panorama is not "
        "enabled.");
    return NS_ERROR_UNEXPECTED;
  }
  mFolderCache.InsertOrUpdate(url, do_GetWeakReference(folder));
  return NS_OK;
}

nsCOMPtr<nsIMsgFolder> FolderLookupService::GetExisting(const nsACString& url) {
  const auto found = mFolderCache.Lookup(url);
  if (!found) {
    return nullptr;
  }

  nsresult rv;
  nsCOMPtr<nsIMsgFolder> foundFolder{do_QueryReferent(*found, &rv)};
  if (NS_FAILED(rv)) {
    // There are no more strong references to this folder, so we can delete it.
    mFolderCache.Remove(url);
    return nullptr;
  }

  return foundFolder;
}

nsresult FolderLookupService::CreateDangling(const nsACString& url,
                                             nsIMsgFolder** folder) {
  NS_ENSURE_ARG_POINTER(folder);

  *folder = nullptr;

  if (mozilla::StaticPrefs::mail_panorama_enabled_AtStartup()) {
    nsAutoCString errorMessage{
        "Panorama is enabled. Refusing to create a folder object for url "};
    errorMessage.Append(url);
    NS_ERROR(errorMessage.Data());
    return NS_ERROR_UNEXPECTED;
  }

  // Check that uri has an active scheme, in case this folder is from
  // an extension that is currently disabled or hasn't started up yet.
  const std::regex schemeRegex{R"(^([-+.\w]+):)"};
  std::smatch match;
  const std::string urlForRegex{url.BeginReading(), url.EndReading()};
  if (!std::regex_search(urlForRegex, match, schemeRegex)) {
    return nsresult::NS_ERROR_UNEXPECTED;
  }

  // The scheme consists of the second capture group in the match regex (the
  // first group is the entire match).
  const nsAutoCString scheme{match[1].str().c_str()};
  nsAutoCString contractId{"@mozilla.org/mail/folder-factory;1?name="};
  contractId.Append(scheme);

  nsresult rv;
  nsCOMPtr<nsIFactory> factory = do_GetClassObject(contractId.get(), &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIMsgFolder> newFolder;
  rv = factory->CreateInstance(NS_IMSGFOLDER_IID, getter_AddRefs(newFolder));
  NS_ENSURE_SUCCESS(rv, rv);

  if (newFolder) {
    rv = newFolder->Init(url);
    NS_ENSURE_SUCCESS(rv, rv);
    mFolderCache.InsertOrUpdate(url, do_GetWeakReference(newFolder));
    newFolder.forget(folder);
  }

  return NS_OK;
}
