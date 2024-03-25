/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#undef _UNICODE
#undef UNICODE

#include <objbase.h>
#include "nsString.h"
#include "Registry.h"

#define MAPI_PROXY_DLL_NAME u"MapiProxy.dll"
#define MAPI_STARTUP_ARG L" /MAPIStartUp"
#define MAX_SIZE 2048

// Size of a CLSID as a string
const int CLSID_STRING_SIZE = 39;

// Proxy/Stub Dll Routines

typedef HRESULT(__stdcall ProxyServer)();

// Convert a CLSID to a WCHAR string.

BOOL CLSIDtoWchar(const CLSID& clsid, WCHAR* szCLSID) {
  // Get CLSID
  HRESULT hr = StringFromCLSID(clsid, &szCLSID);
  if (FAILED(hr)) return FALSE;
  return TRUE;
}

// Create a key and set its value.

BOOL setKeyAndValue(nsAutoString keyName, const WCHAR* subKey,
                    const WCHAR* theValue) {
  HKEY hKey;
  BOOL retValue = TRUE;

  nsAutoString theKey(keyName);
  if (subKey != NULL) {
    theKey += L"\\";
    theKey += subKey;
  }

  // Create and open key and subkey.
  long lResult = RegCreateKeyExW(HKEY_CLASSES_ROOT, theKey.get(), 0, NULL,
                                 REG_OPTION_NON_VOLATILE, KEY_ALL_ACCESS, NULL,
                                 &hKey, NULL);
  if (lResult != ERROR_SUCCESS) return FALSE;

  // Set the Value.
  if (theValue != NULL) {
    lResult = RegSetValueExW(hKey, NULL, 0, REG_SZ, (BYTE*)theValue,
                             wcslen(theValue) + 1);
    if (lResult != ERROR_SUCCESS) retValue = FALSE;
  }

  RegCloseKey(hKey);
  return retValue;
}

// Delete a key and all of its descendants.

LONG recursiveDeleteKey(HKEY hKeyParent,            // Parent of key to delete
                        const WCHAR* lpszKeyChild)  // Key to delete
{
  // Open the child.
  HKEY hKeyChild;
  LONG lRes =
      RegOpenKeyExW(hKeyParent, lpszKeyChild, 0, KEY_ALL_ACCESS, &hKeyChild);
  if (lRes != ERROR_SUCCESS) {
    return lRes;
  }

  // Enumerate all of the descendants of this child.
  FILETIME time;
  WCHAR szBuffer[MAX_SIZE];
  DWORD dwSize = MAX_SIZE;
  while (RegEnumKeyExW(hKeyChild, 0, szBuffer, &dwSize, NULL, NULL, NULL,
                       &time) == S_OK) {
    // Delete the descendants of this child.
    lRes = recursiveDeleteKey(hKeyChild, szBuffer);
    if (lRes != ERROR_SUCCESS) {
      // Cleanup before exiting.
      RegCloseKey(hKeyChild);
      return lRes;
    }
    dwSize = MAX_SIZE;
  }

  // Close the child.
  RegCloseKey(hKeyChild);

  // Delete this child.
  return RegDeleteKeyW(hKeyParent, lpszKeyChild);
}

void RegisterProxy() {
  HINSTANCE h = NULL;
  ProxyServer* RegisterFunc = NULL;

  WCHAR szModule[MAX_SIZE];
  WCHAR* pTemp = NULL;

  HMODULE hModule = GetModuleHandleW(NULL);
  DWORD dwResult =
      ::GetModuleFileNameW(hModule, szModule, sizeof(szModule) / sizeof(WCHAR));
  if (dwResult == 0) return;

  pTemp = wcsrchr(szModule, L'\\');
  if (pTemp == NULL) return;

  *pTemp = '\0';
  nsAutoString proxyPath(szModule);

  proxyPath += u"\\";
  proxyPath += MAPI_PROXY_DLL_NAME;

  h = LoadLibraryW(proxyPath.get());
  if (h == NULL) return;

  RegisterFunc = (ProxyServer*)GetProcAddress(h, "DllRegisterServer");
  if (RegisterFunc) RegisterFunc();

  FreeLibrary(h);
}

void UnRegisterProxy() {
  HINSTANCE h = NULL;
  ProxyServer* UnRegisterFunc = NULL;

  WCHAR szModule[MAX_SIZE];
  WCHAR* pTemp = NULL;

  HMODULE hModule = GetModuleHandleW(NULL);
  DWORD dwResult =
      ::GetModuleFileNameW(hModule, szModule, sizeof(szModule) / sizeof(WCHAR));
  if (dwResult == 0) return;

  pTemp = wcsrchr(szModule, L'\\');
  if (pTemp == NULL) return;

  *pTemp = '\0';
  nsAutoString proxyPath(szModule);

  proxyPath += u"\\";
  proxyPath += MAPI_PROXY_DLL_NAME;

  h = LoadLibraryW(proxyPath.get());
  if (h == NULL) return;

  UnRegisterFunc = (ProxyServer*)GetProcAddress(h, "DllUnregisterServer");
  if (UnRegisterFunc) UnRegisterFunc();

  FreeLibrary(h);
}

// Register the component in the registry.

HRESULT RegisterServer(const CLSID& clsid,           // Class ID
                       const WCHAR* szFriendlyName,  // Friendly Name
                       const WCHAR* szVerIndProgID,  // Programmatic
                       const WCHAR* szProgID)        //   IDs
{
  HMODULE hModule = GetModuleHandleW(NULL);
  WCHAR szModuleName[MAX_SIZE];
  WCHAR szCLSID[CLSID_STRING_SIZE];

  nsAutoString independentProgId(szVerIndProgID);
  nsAutoString progId(szProgID);

  DWORD dwResult = ::GetModuleFileNameW(hModule, szModuleName,
                                        sizeof(szModuleName) / sizeof(WCHAR));

  if (dwResult == 0) return S_FALSE;

  nsAutoString moduleName(szModuleName);
  nsAutoString registryKey(L"CLSID\\");

  moduleName += MAPI_STARTUP_ARG;

  // Convert the CLSID into a WCHAR.
  if (!CLSIDtoWchar(clsid, szCLSID)) return S_FALSE;
  registryKey += szCLSID;

  // Add the CLSID to the registry.
  if (!setKeyAndValue(registryKey, NULL, szFriendlyName)) return S_FALSE;

  if (!setKeyAndValue(registryKey, L"LocalServer32", moduleName.get()))
    return S_FALSE;

  // Add the ProgID subkey under the CLSID key.
  if (!setKeyAndValue(registryKey, L"ProgID", szProgID)) return S_FALSE;

  // Add the version-independent ProgID subkey under CLSID key.
  if (!setKeyAndValue(registryKey, L"VersionIndependentProgID", szVerIndProgID))
    return S_FALSE;

  // Add the version-independent ProgID subkey under HKEY_CLASSES_ROOT.
  if (!setKeyAndValue(independentProgId, NULL, szFriendlyName)) return S_FALSE;
  if (!setKeyAndValue(independentProgId, L"CLSID", szCLSID)) return S_FALSE;
  if (!setKeyAndValue(independentProgId, L"CurVer", szProgID)) return S_FALSE;

  // Add the versioned ProgID subkey under HKEY_CLASSES_ROOT.
  if (!setKeyAndValue(progId, NULL, szFriendlyName)) return S_FALSE;
  if (!setKeyAndValue(progId, L"CLSID", szCLSID)) return S_FALSE;

  RegisterProxy();

  return S_OK;
}

LONG UnregisterServer(const CLSID& clsid,           // Class ID
                      const WCHAR* szVerIndProgID,  // Programmatic
                      const WCHAR* szProgID)        //   IDs
{
  LONG lResult = S_OK;

  // Convert the CLSID into a char.

  WCHAR szCLSID[CLSID_STRING_SIZE];
  if (!CLSIDtoWchar(clsid, szCLSID)) return S_FALSE;

  UnRegisterProxy();

  nsAutoString registryKey(L"CLSID\\");
  registryKey += szCLSID;

  lResult = recursiveDeleteKey(HKEY_CLASSES_ROOT, registryKey.get());
  if (lResult == ERROR_SUCCESS || lResult == ERROR_FILE_NOT_FOUND)
    return lResult;

  registryKey += L"\\LocalServer32";

  // Delete only the path for this server.

  lResult = recursiveDeleteKey(HKEY_CLASSES_ROOT, registryKey.get());
  if (lResult != ERROR_SUCCESS && lResult != ERROR_FILE_NOT_FOUND)
    return lResult;

  // Delete the version-independent ProgID Key.
  lResult = recursiveDeleteKey(HKEY_CLASSES_ROOT, szVerIndProgID);
  if (lResult != ERROR_SUCCESS && lResult != ERROR_FILE_NOT_FOUND)
    return lResult;

  lResult = recursiveDeleteKey(HKEY_CLASSES_ROOT, szProgID);

  return lResult;
}
