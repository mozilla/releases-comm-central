/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMailWinSearchHelper.h"
#include "nsDirectoryServiceUtils.h"
#include "nsString.h"
#include "nsIDirectoryEnumerator.h"

#ifdef _WIN32_WINNT
#  undef _WIN32_WINNT
#endif
#define _WIN32_WINNT 0x0600
#include <SearchAPI.h>
#include <winsvc.h>
#include <ShellAPI.h>
#include <shlobj.h>

static const CLSID CLSID_CSearchManager = {
    0x7d096c5f,
    0xac08,
    0x4f1f,
    {0xbe, 0xb7, 0x5c, 0x22, 0xc5, 0x17, 0xce, 0x39}};
static const IID IID_ISearchManager = {
    0xab310581,
    0xac80,
    0x11d1,
    {0x8d, 0xf3, 0x00, 0xc0, 0x4f, 0xb6, 0xef, 0x69}};

static const char* const sFoldersToIndex[] = {"Mail", "ImapMail", "News"};

// APP_REG_NAME_MAIL should be kept in synch with AppRegNameMail
// in the installer file: defines.nsi.in
#define APP_REG_NAME_MAIL L"Thunderbird"

nsMailWinSearchHelper::nsMailWinSearchHelper() {}

nsresult nsMailWinSearchHelper::Init() {
  CoInitialize(NULL);
  return NS_GetSpecialDirectory("ProfD", getter_AddRefs(mProfD));
}

nsMailWinSearchHelper::~nsMailWinSearchHelper() { CoUninitialize(); }

NS_IMPL_ISUPPORTS(nsMailWinSearchHelper, nsIMailWinSearchHelper)

NS_IMETHODIMP nsMailWinSearchHelper::GetFoldersInCrawlScope(bool* aResult) {
  *aResult = false;
  NS_ENSURE_ARG_POINTER(mProfD);

  // If the service isn't present or running, we shouldn't proceed.
  bool serviceRunning;
  nsresult rv = GetServiceRunning(&serviceRunning);
  if (!serviceRunning || NS_FAILED(rv)) return rv;

  // We need to do this every time so that we have the latest data
  RefPtr<ISearchManager> searchManager;
  HRESULT hr =
      CoCreateInstance(CLSID_CSearchManager, NULL, CLSCTX_ALL,
                       IID_ISearchManager, getter_AddRefs(searchManager));
  if (FAILED(hr)) return NS_ERROR_FAILURE;

  RefPtr<ISearchCatalogManager> catalogManager;
  hr =
      searchManager->GetCatalog(L"SystemIndex", getter_AddRefs(catalogManager));
  if (FAILED(hr)) return NS_ERROR_FAILURE;

  RefPtr<ISearchCrawlScopeManager> crawlScopeManager;
  hr = catalogManager->GetCrawlScopeManager(getter_AddRefs(crawlScopeManager));
  if (FAILED(hr)) return NS_ERROR_FAILURE;

  // We need to create appropriate URLs to check with the crawl scope manager.
  for (uint32_t i = 0; i < std::size(sFoldersToIndex); i++) {
    nsCOMPtr<nsIFile> subdir;
    rv = mProfD->Clone(getter_AddRefs(subdir));
    NS_ENSURE_SUCCESS(rv, rv);

    nsDependentCString relativeStr(sFoldersToIndex[i]);
    rv = subdir->AppendNative(relativeStr);
    NS_ENSURE_SUCCESS(rv, rv);

    nsString subdirPath;
    rv = subdir->GetPath(subdirPath);
    NS_ENSURE_SUCCESS(rv, rv);

    // Form a URL as required by the crawl scope manager
    nsString subdirURL(u"file:///"_ns);
    subdirURL.Append(subdirPath);
    subdirURL.Append('\\');

    BOOL included;
    if (FAILED(crawlScopeManager->IncludedInCrawlScope(subdirURL.get(),
                                                       &included)))
      return NS_ERROR_FAILURE;

    // If even one of the folders isn't there, we return false
    if (!included) return NS_OK;
  }
  *aResult = true;
  return NS_OK;
}

NS_IMETHODIMP nsMailWinSearchHelper::GetServiceRunning(bool* aResult) {
  *aResult = false;
  SC_HANDLE hSCManager =
      OpenSCManagerW(nullptr, SERVICES_ACTIVE_DATABASEW, SERVICE_QUERY_STATUS);
  if (!hSCManager) return NS_ERROR_FAILURE;

  SC_HANDLE hService =
      OpenServiceW(hSCManager, L"wsearch", SERVICE_QUERY_STATUS);
  CloseServiceHandle(hSCManager);
  if (!hService)
    // The service isn't present. Never mind.
    return NS_ERROR_NOT_AVAILABLE;

  SERVICE_STATUS status;
  if (!QueryServiceStatus(hService, &status)) {
    CloseServiceHandle(hService);
    return NS_ERROR_FAILURE;
  }

  *aResult = (status.dwCurrentState == SERVICE_RUNNING);
  CloseServiceHandle(hService);
  return NS_OK;
}

NS_IMETHODIMP nsMailWinSearchHelper::SetFANCIBit(nsIFile* aFile, bool aBit,
                                                 bool aRecurse) {
  NS_ENSURE_ARG_POINTER(aFile);

  bool exists;
  nsresult rv = aFile->Exists(&exists);
  NS_ENSURE_SUCCESS(rv, rv);
  if (!exists) return NS_ERROR_FILE_NOT_FOUND;

  nsString filePath;
  rv = aFile->GetPath(filePath);
  NS_ENSURE_SUCCESS(rv, rv);
  LPCWSTR pathStr = filePath.get();

  // We should set the file attribute only if it isn't already set.
  DWORD dwAttrs = GetFileAttributesW(pathStr);
  if (dwAttrs == INVALID_FILE_ATTRIBUTES) return NS_ERROR_FAILURE;

  if (aBit) {
    if (!(dwAttrs & FILE_ATTRIBUTE_NOT_CONTENT_INDEXED))
      SetFileAttributesW(pathStr, dwAttrs | FILE_ATTRIBUTE_NOT_CONTENT_INDEXED);
  } else {
    if (dwAttrs & FILE_ATTRIBUTE_NOT_CONTENT_INDEXED)
      SetFileAttributesW(pathStr,
                         dwAttrs & ~FILE_ATTRIBUTE_NOT_CONTENT_INDEXED);
  }

  // We should only try to recurse if it's a directory
  bool isDirectory;
  rv = aFile->IsDirectory(&isDirectory);
  NS_ENSURE_SUCCESS(rv, rv);
  if (aRecurse && isDirectory) {
    nsCOMPtr<nsIDirectoryEnumerator> children;
    rv = aFile->GetDirectoryEntries(getter_AddRefs(children));
    NS_ENSURE_SUCCESS(rv, rv);

    bool hasMore = false;
    while (NS_SUCCEEDED(children->HasMoreElements(&hasMore)) && hasMore) {
      nsCOMPtr<nsIFile> childFile;
      rv = children->GetNextFile(getter_AddRefs(childFile));
      NS_ENSURE_SUCCESS(rv, rv);
      rv = SetFANCIBit(childFile, aBit, aRecurse);
    }
  }
  return rv;
}

NS_IMETHODIMP nsMailWinSearchHelper::GetIsFileAssociationSet(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);

  // We'll use the Vista method here
  RefPtr<IApplicationAssociationRegistration> pAAR;
  HRESULT hr = CoCreateInstance(
      CLSID_ApplicationAssociationRegistration, NULL, CLSCTX_INPROC,
      IID_IApplicationAssociationRegistration, getter_AddRefs(pAAR));

  BOOL res = false;
  if (SUCCEEDED(hr))
    pAAR->QueryAppIsDefault(L".wdseml", AT_FILEEXTENSION, AL_EFFECTIVE,
                            APP_REG_NAME_MAIL, &res);
  *aResult = res;

  return NS_OK;
}

NS_IMETHODIMP nsMailWinSearchHelper::SetFileAssociation() {
  RefPtr<IApplicationAssociationRegistration> pAAR;
  HRESULT hr = CoCreateInstance(
      CLSID_ApplicationAssociationRegistration, NULL, CLSCTX_INPROC,
      IID_IApplicationAssociationRegistration, getter_AddRefs(pAAR));
  if (SUCCEEDED(hr))
    hr = pAAR->SetAppAsDefault(APP_REG_NAME_MAIL, L".wdseml", AT_FILEEXTENSION);

  return SUCCEEDED(hr) ? NS_OK : NS_ERROR_FAILURE;
}

NS_IMETHODIMP nsMailWinSearchHelper::RunSetup(bool aEnable) {
  nsresult rv;
  if (!mCurProcD) {
    rv = NS_GetSpecialDirectory("CurProcD", getter_AddRefs(mCurProcD));
    NS_ENSURE_SUCCESS(rv, rv);
    rv = mCurProcD->Append(u"WSEnable.exe"_ns);
    NS_ENSURE_SUCCESS(rv, rv);
  }

  nsAutoString filePath;
  rv = mCurProcD->GetPath(filePath);
  NS_ENSURE_SUCCESS(rv, rv);

  // The parameters are of the format "1 <path>" for enabling and "0 <path>" for
  // disabling
  nsAutoString params(aEnable ? u"1 \""_ns : u"0 \""_ns);
  nsAutoString profDPath;
  rv = mProfD->GetPath(profDPath);
  NS_ENSURE_SUCCESS(rv, rv);
  params.Append(profDPath);
  params.Append(u"\""_ns);

  // We need an hWnd to cause UAC to pop up immediately
  // If GetForegroundWindow returns NULL, then the UAC prompt will still appear,
  // but minimized.
  HWND hWnd = GetForegroundWindow();

  SHELLEXECUTEINFOW executeInfo = {0};

  executeInfo.cbSize = sizeof(SHELLEXECUTEINFOW);
  executeInfo.hwnd = hWnd;
  executeInfo.fMask = SEE_MASK_NOCLOSEPROCESS;
  executeInfo.lpDirectory = NULL;
  executeInfo.lpFile = filePath.get();
  executeInfo.lpParameters = params.get();
  executeInfo.nShow = SW_SHOWNORMAL;

  DWORD dwRet = ERROR_SUCCESS;

  if (ShellExecuteExW(&executeInfo)) {
    // We want to block until the program exits
    DWORD dwSignaled = WaitForSingleObject(executeInfo.hProcess, INFINITE);
    if (dwSignaled == WAIT_OBJECT_0)
      if (!GetExitCodeProcess(executeInfo.hProcess, &dwRet))
        dwRet = GetLastError();
  } else
    return NS_ERROR_ABORT;

  return SUCCEEDED(HRESULT_FROM_WIN32(dwRet)) ? NS_OK : NS_ERROR_FAILURE;
}
