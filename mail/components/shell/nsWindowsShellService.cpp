/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsWindowsShellService.h"
#include "nsIServiceManager.h"
#include "nsICategoryManager.h"
#include "nsNativeCharsetUtils.h"
#include "nsIPrefService.h"
#include "windows.h"
#include "shellapi.h"
#include "nsIFile.h"
#include "nsDirectoryServiceDefs.h"
#include "nsUnicharUtils.h"
#include "nsComponentManagerUtils.h"
#include "nsServiceManagerUtils.h"
#include "nsIProperties.h"
#include "nsString.h"

#ifdef _WIN32_WINNT
#  undef _WIN32_WINNT
#endif
#define _WIN32_WINNT 0x0600
#define INITGUID
#include <shlobj.h>

#include <mbstring.h>

#ifndef MAX_BUF
#  define MAX_BUF 4096
#endif

#define REG_FAILED(val) (val != ERROR_SUCCESS)

NS_IMPL_ISUPPORTS(nsWindowsShellService, nsIShellService,
                  nsIToolkitShellService)

static nsresult OpenKeyForReading(HKEY aKeyRoot, const nsAString& aKeyName,
                                  HKEY* aKey) {
  const nsString& flatName = PromiseFlatString(aKeyName);

  DWORD res = ::RegOpenKeyExW(aKeyRoot, flatName.get(), 0, KEY_READ, aKey);
  switch (res) {
    case ERROR_SUCCESS:
      break;
    case ERROR_ACCESS_DENIED:
      return NS_ERROR_FILE_ACCESS_DENIED;
    case ERROR_FILE_NOT_FOUND:
      return NS_ERROR_NOT_AVAILABLE;
  }

  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// Default Mail Registry Settings
///////////////////////////////////////////////////////////////////////////////

typedef enum {
  NO_SUBSTITUTION = 0x00,
  APP_PATH_SUBSTITUTION = 0x01
} SettingFlags;

// APP_REG_NAME_MAIL and APP_REG_NAME_NEWS should be kept in synch with
// AppRegNameMail and AppRegNameNews in the installer file: defines.nsi.in
#define APP_REG_NAME_MAIL L"Thunderbird"
#define APP_REG_NAME_NEWS L"Thunderbird (News)"
#define APP_REG_NAME_CALENDAR L"Thunderbird (Calendar)"
#define CLS_EML "ThunderbirdEML"
#define CLS_MAILTOURL "Thunderbird.Url.mailto"
#define CLS_MIDURL "Thunderbird.Url.mid"
#define CLS_NEWSURL "Thunderbird.Url.news"
#define CLS_FEEDURL "Thunderbird.Url.feed"
#define CLS_WEBCALURL "Thunderbird.Url.webcal"
#define CLS_ICS "ThunderbirdICS"
#define SOP "\\shell\\open\\command"
#define VAL_OPEN "\"%APPPATH%\" \"%1\""
#define VAL_MAIL_OPEN "\"%APPPATH%\" -osint -mail \"%1\""
#define VAL_COMPOSE_OPEN "\"%APPPATH%\" -osint -compose \"%1\""

#define MAKE_KEY_NAME1(PREFIX, MID) PREFIX MID

static SETTING gMailSettings[] = {
    // File Extension Class
    {".eml", "", CLS_EML, NO_SUBSTITUTION},

    // File Extension Class
    {MAKE_KEY_NAME1(CLS_EML, SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},

    // Protocol Handler Class - for Vista and above
    {MAKE_KEY_NAME1(CLS_MAILTOURL, SOP), "", VAL_COMPOSE_OPEN,
     APP_PATH_SUBSTITUTION},
    {MAKE_KEY_NAME1(CLS_MIDURL, SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},

    // Protocol Handlers
    {MAKE_KEY_NAME1("mailto", SOP), "", VAL_COMPOSE_OPEN,
     APP_PATH_SUBSTITUTION},
    {MAKE_KEY_NAME1("mid", SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},
};

static SETTING gNewsSettings[] = {
    // Protocol Handler Class - for Vista and above
    {MAKE_KEY_NAME1(CLS_NEWSURL, SOP), "", VAL_MAIL_OPEN,
     APP_PATH_SUBSTITUTION},

    // Protocol Handlers
    {MAKE_KEY_NAME1("news", SOP), "", VAL_MAIL_OPEN, APP_PATH_SUBSTITUTION},
    {MAKE_KEY_NAME1("nntp", SOP), "", VAL_MAIL_OPEN, APP_PATH_SUBSTITUTION},
};

static SETTING gCalendarSettings[] = {
    // File Extension Class
    {".ics", "", CLS_ICS, NO_SUBSTITUTION},

    // File Extension Class
    {MAKE_KEY_NAME1(CLS_ICS, SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},

    // Protocol Handlers
    {MAKE_KEY_NAME1(CLS_WEBCALURL, SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},
    {MAKE_KEY_NAME1("webcal", SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},
    {MAKE_KEY_NAME1("webcals", SOP), "", VAL_OPEN, APP_PATH_SUBSTITUTION},
};

nsresult GetHelperPath(nsAutoString& aPath) {
  nsresult rv;
  nsCOMPtr<nsIProperties> directoryService =
      do_GetService(NS_DIRECTORY_SERVICE_CONTRACTID, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<nsIFile> appHelper;
  rv = directoryService->Get(NS_XPCOM_CURRENT_PROCESS_DIR, NS_GET_IID(nsIFile),
                             getter_AddRefs(appHelper));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = appHelper->Append(u"uninstall"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  rv = appHelper->Append(u"helper.exe"_ns);
  NS_ENSURE_SUCCESS(rv, rv);

  return appHelper->GetPath(aPath);
}

nsresult LaunchHelper(nsAutoString& aPath, nsAutoString& aParams) {
  SHELLEXECUTEINFOW executeInfo = {0};

  executeInfo.cbSize = sizeof(SHELLEXECUTEINFOW);
  executeInfo.hwnd = NULL;
  executeInfo.fMask = SEE_MASK_NOCLOSEPROCESS;
  executeInfo.lpDirectory = NULL;
  executeInfo.lpFile = aPath.get();
  executeInfo.lpParameters = aParams.get();
  executeInfo.nShow = SW_SHOWNORMAL;

  if (ShellExecuteExW(&executeInfo))
    // Block until the program exits
    WaitForSingleObject(executeInfo.hProcess, INFINITE);
  else
    return NS_ERROR_ABORT;

  // We're going to ignore errors here since there's nothing we can do about
  // them, and helper.exe seems to return non-zero ret on success.
  return NS_OK;
}

nsresult nsWindowsShellService::Init() {
  WCHAR appPath[MAX_BUF];
  if (!::GetModuleFileNameW(0, appPath, MAX_BUF)) return NS_ERROR_FAILURE;

  // Convert the path to a long path since GetModuleFileNameW returns the path
  // that was used to launch the app which is not necessarily a long path.
  if (!::GetLongPathNameW(appPath, appPath, MAX_BUF)) return NS_ERROR_FAILURE;

  mAppLongPath = appPath;

  return NS_OK;
}

nsWindowsShellService::nsWindowsShellService() : mCheckedThisSession(false) {}

NS_IMETHODIMP
nsWindowsShellService::IsDefaultClient(bool aStartupCheck, uint16_t aApps,
                                       bool* aIsDefaultClient) {
  // If this is the first mail window, maintain internal state that we've
  // checked this session (so that subsequent window opens don't show the
  // default client dialog).
  if (aStartupCheck) mCheckedThisSession = true;

  *aIsDefaultClient = true;

  // for each type,
  if (aApps & nsIShellService::MAIL) {
    *aIsDefaultClient &=
        TestForDefault(gMailSettings, sizeof(gMailSettings) / sizeof(SETTING));
    // Only check if this app is default on Vista if the previous checks
    // indicate that this app is the default.
    if (*aIsDefaultClient)
      IsDefaultClientVista(nsIShellService::MAIL, aIsDefaultClient);
  }
  if (aApps & nsIShellService::NEWS) {
    *aIsDefaultClient &=
        TestForDefault(gNewsSettings, sizeof(gNewsSettings) / sizeof(SETTING));
    // Only check if this app is default on Vista if the previous checks
    // indicate that this app is the default.
    if (*aIsDefaultClient)
      IsDefaultClientVista(nsIShellService::NEWS, aIsDefaultClient);
  }
  if (aApps & nsIShellService::CALENDAR) {
    *aIsDefaultClient &= TestForDefault(
        gCalendarSettings, sizeof(gCalendarSettings) / sizeof(SETTING));
    // Only check if this app is default on Vista if the previous checks
    // indicate that this app is the default.
    if (*aIsDefaultClient)
      IsDefaultClientVista(nsIShellService::CALENDAR, aIsDefaultClient);
  }
  // RSS / feed protocol shell integration is not working so return true
  // until it is fixed (bug 445823).
  if (aApps & nsIShellService::RSS) *aIsDefaultClient &= true;

  return NS_OK;
}

NS_IMETHODIMP
nsWindowsShellService::SetDefaultClient(bool aForAllUsers, uint16_t aApps) {
  nsAutoString appHelperPath;
  if (NS_FAILED(GetHelperPath(appHelperPath))) return NS_ERROR_FAILURE;

  nsAutoString params;
  if (aForAllUsers) {
    params.AppendLiteral(" /SetAsDefaultAppGlobal");
  } else {
    params.AppendLiteral(" /SetAsDefaultAppUser");
    if (aApps & nsIShellService::MAIL) params.AppendLiteral(" Mail");

    if (aApps & nsIShellService::NEWS) params.AppendLiteral(" News");

    if (aApps & nsIShellService::CALENDAR) params.AppendLiteral(" Calendar");
  }

  return LaunchHelper(appHelperPath, params);
}

NS_IMETHODIMP
nsWindowsShellService::GetShouldCheckDefaultClient(bool* aResult) {
  if (mCheckedThisSession) {
    *aResult = false;
    return NS_OK;
  }

  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  return prefs->GetBoolPref("mail.shell.checkDefaultClient", aResult);
}

NS_IMETHODIMP
nsWindowsShellService::SetShouldCheckDefaultClient(bool aShouldCheck) {
  nsCOMPtr<nsIPrefBranch> prefs(do_GetService(NS_PREFSERVICE_CONTRACTID));
  return prefs->SetBoolPref("mail.shell.checkDefaultClient", aShouldCheck);
}

/* helper routine. Iterate over the passed in settings object. */
bool nsWindowsShellService::TestForDefault(SETTING aSettings[], int32_t aSize) {
  bool isDefault = true;
  char16_t currValue[MAX_BUF];
  SETTING* end = aSettings + aSize;
  for (SETTING* settings = aSettings; settings < end; ++settings) {
    NS_ConvertUTF8toUTF16 dataLongPath(settings->valueData);
    NS_ConvertUTF8toUTF16 key(settings->keyName);
    NS_ConvertUTF8toUTF16 value(settings->valueName);
    if (settings->flags & APP_PATH_SUBSTITUTION) {
      int32_t offset = dataLongPath.Find(u"%APPPATH%");
      dataLongPath.Replace(offset, 9, mAppLongPath);
    }

    ::ZeroMemory(currValue, sizeof(currValue));
    HKEY theKey;
    nsresult rv = OpenKeyForReading(HKEY_CLASSES_ROOT, key, &theKey);
    if (NS_FAILED(rv)) {
      // Key doesn't exist
      isDefault = false;
      break;
    }

    DWORD len = sizeof currValue;
    DWORD result = ::RegQueryValueExW(theKey, value.get(), NULL, NULL,
                                      (LPBYTE)currValue, &len);
    // Close the key we opened.
    ::RegCloseKey(theKey);
    if (REG_FAILED(result) ||
        !dataLongPath.Equals(currValue, nsCaseInsensitiveStringComparator)) {
      // Key wasn't set, or was set to something else (something else became the
      // default client)
      isDefault = false;
      break;
    }
  }  // for each registry key we want to look at

  return isDefault;
}

bool nsWindowsShellService::IsDefaultClientVista(uint16_t aApps,
                                                 bool* aIsDefaultClient) {
  IApplicationAssociationRegistration* pAAR;

  HRESULT hr = CoCreateInstance(
      CLSID_ApplicationAssociationRegistration, NULL, CLSCTX_INPROC,
      IID_IApplicationAssociationRegistration, (void**)&pAAR);

  if (SUCCEEDED(hr)) {
    BOOL isDefaultMail = true;
    BOOL isDefaultNews = true;
    BOOL isDefaultCalendar = true;
    if (aApps & nsIShellService::MAIL)
      pAAR->QueryAppIsDefaultAll(AL_EFFECTIVE, APP_REG_NAME_MAIL,
                                 &isDefaultMail);
    if (aApps & nsIShellService::NEWS)
      pAAR->QueryAppIsDefaultAll(AL_EFFECTIVE, APP_REG_NAME_NEWS,
                                 &isDefaultNews);
    if (aApps & nsIShellService::CALENDAR)
      pAAR->QueryAppIsDefaultAll(AL_EFFECTIVE, APP_REG_NAME_CALENDAR,
                                 &isDefaultCalendar);

    *aIsDefaultClient = isDefaultNews && isDefaultMail && isDefaultCalendar;

    pAAR->Release();
    return true;
  }
  return false;
}
