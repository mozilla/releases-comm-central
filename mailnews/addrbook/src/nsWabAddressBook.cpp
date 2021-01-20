/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include <tchar.h>
#include "nsWabAddressBook.h"
#include "mozilla/Logging.h"
#include "mozilla/DebugOnly.h"

using namespace mozilla;

static LazyLogModule gWabAddressBookLog("WABAddressBook");

#define PRINTF(args) MOZ_LOG(gWabAddressBookLog, mozilla::LogLevel::Debug, args)
#define WAB_DLL_NAMEW L"" WAB_DLL_NAME

HMODULE nsWabAddressBook::mLibrary = NULL;
int32_t nsWabAddressBook::mLibUsage = 0;
LPWABOPEN nsWabAddressBook::mWABOpen = NULL;
LPWABOBJECT nsWabAddressBook::mRootSession = NULL;
LPADRBOOK nsWabAddressBook::mRootBook = NULL;

BOOL nsWabAddressBook::LoadWabLibrary(void) {
  if (mLibrary) {
    ++mLibUsage;
    return TRUE;
  }

  // We try to fetch the location of the WAB DLL from the registry
  WCHAR wabDLLPath[MAX_PATH];
  DWORD keyType = 0;
  ULONG byteCount = sizeof(wabDLLPath);
  HKEY keyHandle = NULL;
  wabDLLPath[MAX_PATH - 1] = 0;
  if (RegOpenKeyExW(HKEY_LOCAL_MACHINE, L"" WAB_DLL_PATH_KEY, 0, KEY_READ,
                    &keyHandle) == ERROR_SUCCESS) {
    RegQueryValueExW(keyHandle, L"", NULL, &keyType, (LPBYTE)wabDLLPath,
                     &byteCount);
    if (keyType == REG_EXPAND_SZ) {
      // Expand the environment variables
      DWORD bufferSize = ExpandEnvironmentStringsW(wabDLLPath, NULL, 0);
      if (bufferSize && bufferSize < MAX_PATH) {
        WCHAR tmp[MAX_PATH];
        ExpandEnvironmentStringsW(wabDLLPath, tmp, bufferSize);
        wcscpy(wabDLLPath, tmp);
      } else {
        return FALSE;
      }
    }
  } else {
    if (GetSystemDirectoryW(wabDLLPath, MAX_PATH)) {
      wcsncat(
          wabDLLPath, WAB_DLL_NAMEW,
          std::min(wcslen(WAB_DLL_NAMEW), MAX_PATH - wcslen(wabDLLPath) - 1));
    } else {
      return FALSE;
    }
  }
  if (keyHandle) {
    RegCloseKey(keyHandle);
  }
  mLibrary = LoadLibraryW((lstrlenW(wabDLLPath)) ? wabDLLPath : WAB_DLL_NAMEW);
  if (!mLibrary) {
    return FALSE;
  }
  ++mLibUsage;
  mWABOpen = reinterpret_cast<LPWABOPEN>(GetProcAddress(mLibrary, "WABOpen"));
  if (!mWABOpen) {
    return FALSE;
  }
  HRESULT retCode = mWABOpen(&mRootBook, &mRootSession, NULL, 0);

  if (HR_FAILED(retCode)) {
    PRINTF(("Cannot initialize WAB %08x.\n", retCode));
    return FALSE;
  }
  return TRUE;
}

void nsWabAddressBook::FreeWabLibrary(void) {
  if (mLibrary) {
    if (--mLibUsage == 0) {
      if (mRootBook) {
        mRootBook->Release();
      }
      if (mRootSession) {
        mRootSession->Release();
      }
      FreeLibrary(mLibrary);
      mLibrary = NULL;
    }
  }
}

nsWabAddressBook::nsWabAddressBook(void) : nsAbWinHelper() {
  mozilla::DebugOnly<BOOL> result = Initialize();

  NS_ASSERTION(result == TRUE, "Couldn't initialize Wab Helper");
  MOZ_COUNT_CTOR(nsWabAddressBook);
}

nsWabAddressBook::~nsWabAddressBook(void) {
  StaticMutexAutoLock guard(sMutex);
  FreeWabLibrary();
  MOZ_COUNT_DTOR(nsWabAddressBook);
}

BOOL nsWabAddressBook::Initialize(void) {
  if (mAddressBook) {
    return TRUE;
  }
  StaticMutexAutoLock guard(sMutex);

  if (!LoadWabLibrary()) {
    PRINTF(("Cannot load library.\n"));
    return FALSE;
  }
  mAddressBook = mRootBook;
  return TRUE;
}

void nsWabAddressBook::AllocateBuffer(ULONG aByteCount, LPVOID* aBuffer) {
  mRootSession->AllocateBuffer(aByteCount, aBuffer);
}

void nsWabAddressBook::FreeBuffer(LPVOID aBuffer) {
  mRootSession->FreeBuffer(aBuffer);
}
