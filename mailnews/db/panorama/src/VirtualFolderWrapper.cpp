/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "VirtualFolderWrapper.h"

#include "mozilla/Components.h"
#include "nsIDatabaseCore.h"
#include "nsIFolder.h"
#include "nsIMsgFilter.h"
#include "nsIMsgFilterList.h"
#include "nsIMsgFilterService.h"
#include "nsIMsgSearchTerm.h"
#include "nsMsgUtils.h"
#include "nsReadableUtils.h"

namespace mozilla::mailnews {

NS_IMPL_ISUPPORTS(VirtualFolderWrapper, nsIVirtualFolderWrapper)

NS_IMETHODIMP VirtualFolderWrapper::GetVirtualFolder(nsIMsgFolder** msgFolder) {
  NS_IF_ADDREF(*msgFolder = mMsgFolder);
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderWrapper::SetVirtualFolder(nsIMsgFolder* msgFolder) {
  nsCOMPtr<nsIDatabaseCore> database = components::DatabaseCore::Service();
  nsCOMPtr<nsIFolderDatabase> folders = database->GetFolders();
  mFolderDatabase = static_cast<FolderDatabase*>(folders.get());

  mMsgFolder = msgFolder;
  msgFolder->GetId(&mVirtualFolderId);
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderWrapper::GetSearchFolderURIs(
    nsACString& searchFolderURIs) {
  nsTArray<RefPtr<nsIMsgFolder>> searchFolders;
  nsresult rv = GetSearchFolders(searchFolders);
  NS_ENSURE_SUCCESS(rv, rv);

  searchFolderURIs.Truncate();
  for (auto searchFolder : searchFolders) {
    if (!searchFolderURIs.IsEmpty()) {
      searchFolderURIs.Append('|');
    }
    searchFolderURIs.Append(searchFolder->URI());
  }

  return NS_OK;
}

nsTArray<uint64_t> VirtualFolderWrapper::GetSearchFolderIds() {
  nsTArray<uint64_t> searchFolderIds;
  mFolderDatabase->GetVirtualFolderFolders(mVirtualFolderId, searchFolderIds);
  return searchFolderIds;
}

NS_IMETHODIMP VirtualFolderWrapper::GetSearchFolders(
    nsTArray<RefPtr<nsIMsgFolder>>& searchFolders) {
  searchFolders.Clear();

  nsTArray<uint64_t> searchFolderIds;
  nsresult rv = mFolderDatabase->GetVirtualFolderFolders(mVirtualFolderId,
                                                         searchFolderIds);
  NS_ENSURE_SUCCESS(rv, rv);

  for (auto searchFolderId : searchFolderIds) {
    nsCOMPtr<nsIFolder> folder;
    mFolderDatabase->GetFolderById(searchFolderId, getter_AddRefs(folder));
    nsCOMPtr<nsIMsgFolder> msgFolder;
    mFolderDatabase->GetMsgFolderForFolder(folder, getter_AddRefs(msgFolder));
    searchFolders.AppendElement(msgFolder);
  }

  return NS_OK;
}

NS_IMETHODIMP VirtualFolderWrapper::SetSearchFolders(
    const nsTArray<RefPtr<nsIMsgFolder>>& searchFolders) {
  nsTArray<uint64_t> searchFolderIds;

  for (auto msgFolder : searchFolders) {
    uint64_t searchFolderId;
    msgFolder->GetId(&searchFolderId);
    searchFolderIds.AppendElement(searchFolderId);
  }

  return mFolderDatabase->SetVirtualFolderFolders(mVirtualFolderId,
                                                  searchFolderIds);
}

NS_IMETHODIMP VirtualFolderWrapper::GetSearchString(nsACString& searchString) {
  return mFolderDatabase->GetFolderProperty(mVirtualFolderId, "searchStr"_ns,
                                            searchString);
}

NS_IMETHODIMP VirtualFolderWrapper::SetSearchString(
    const nsACString& searchString) {
  return mFolderDatabase->SetFolderProperty(mVirtualFolderId, "searchStr"_ns,
                                            searchString);
}

NS_IMETHODIMP VirtualFolderWrapper::GetSearchTermsSession(
    nsIMsgFilter** filter) {
  nsCOMPtr<nsIMsgFilterService> filterService = components::Filter::Service();

  nsCOMPtr<nsIMsgFilterList> filterList;
  filterService->GetTempFilterList(mMsgFolder, getter_AddRefs(filterList));

  nsAutoCString searchString;
  GetSearchString(searchString);
  filterList->CreateFilter(u"temp"_ns, filter);
  filterList->ParseCondition(*filter, searchString.get());
  return NS_OK;
}

NS_IMETHODIMP VirtualFolderWrapper::GetSearchTerms(
    nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms) {
  nsCOMPtr<nsIMsgFilter> filter;
  GetSearchTermsSession(getter_AddRefs(filter));

  return filter->GetSearchTerms(searchTerms);
}

NS_IMETHODIMP VirtualFolderWrapper::SetSearchTerms(
    const nsTArray<RefPtr<nsIMsgSearchTerm>>& searchTerms) {
  nsAutoCString condition;

  for (auto term : searchTerms) {
    if (!condition.IsEmpty()) {
      condition.Append(" ");
    }

    bool matchAll;
    term->GetMatchAll(&matchAll);
    if (matchAll) {
      condition.Assign("ALL"_ns);
      break;
    }

    bool booleanAnd;
    term->GetBooleanAnd(&booleanAnd);
    condition.Append(booleanAnd ? "AND ("_ns : "OR ("_ns);

    nsAutoCString termAsString;
    term->GetTermAsString(termAsString);
    condition.Append(termAsString);
    condition.Append(")");
  }

  return SetSearchString(condition);
}

NS_IMETHODIMP VirtualFolderWrapper::GetOnlineSearch(bool* onlineSearch) {
  *onlineSearch = 0;
  return mFolderDatabase->GetFolderProperty(mVirtualFolderId, "searchOnline"_ns,
                                            (int64_t*)onlineSearch);
}

NS_IMETHODIMP VirtualFolderWrapper::SetOnlineSearch(bool onlineSearch) {
  return mFolderDatabase->SetFolderProperty(mVirtualFolderId, "searchOnline"_ns,
                                            (int64_t)onlineSearch);
}

NS_IMETHODIMP VirtualFolderWrapper::CleanUpMessageDatabase() { return NS_OK; }

NS_IMPL_ISUPPORTS(VirtualFolderWrapperFactory, nsIFactory)

NS_IMETHODIMP VirtualFolderWrapperFactory::CreateInstance(const nsIID& iid,
                                                          void** result) {
  RefPtr inst = new VirtualFolderWrapper();
  return inst->QueryInterface(iid, result);
}

}  // namespace mozilla::mailnews
