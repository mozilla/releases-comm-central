/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsSuiteProfileMigratorUtils.h"
#include "nsIPrefBranch.h"
#include "nsIFile.h"
#include "nsIInputStream.h"
#include "nsILineInputStream.h"
#include "nsIProfileMigrator.h"

#include "nsIURI.h"
#include "nsNetUtil.h"
#include "nsIProperties.h"
#include "nsServiceManagerUtils.h"
#include "nsISupportsPrimitives.h"

#include "nsAppDirectoryServiceDefs.h"
#include "nsIRDFService.h"
#include "nsIStringBundle.h"
#include "nsCRT.h"

#define MIGRATION_BUNDLE "chrome://communicator/migration/locale/migration.properties"

using namespace mozilla;

void SetUnicharPref(const char* aPref, const nsAString& aValue,
                    nsIPrefBranch* aPrefs)
{
  nsCOMPtr<nsISupportsString> supportsString =
    do_CreateInstance(NS_SUPPORTS_STRING_CONTRACTID);
  if (supportsString) {
     supportsString->SetData(aValue);
     aPrefs->SetComplexValue(aPref, NS_GET_IID(nsISupportsString),
                             supportsString);
  }
}

void SetProxyPref(const nsAString& aHostPort, const char* aPref,
                  const char* aPortPref, nsIPrefBranch* aPrefs)
{
  nsCOMPtr<nsIURI> uri;
  nsAutoCString host;
  int32_t portValue;

  // try parsing it as a URI first
  if (NS_SUCCEEDED(NS_NewURI(getter_AddRefs(uri), aHostPort)) &&
      NS_SUCCEEDED(uri->GetHost(host)) &&
      !host.IsEmpty() &&
      NS_SUCCEEDED(uri->GetPort(&portValue))) {
    SetUnicharPref(aPref, NS_ConvertUTF8toUTF16(host), aPrefs);
    aPrefs->SetIntPref(aPortPref, portValue);
  }
  else {
    nsAutoString hostPort(aHostPort);
    int32_t portDelimOffset = hostPort.RFindChar(':');
    if (portDelimOffset > 0) {
      SetUnicharPref(aPref, Substring(hostPort, 0, portDelimOffset), aPrefs);
      nsAutoString port(Substring(hostPort, portDelimOffset + 1));
      nsresult error;
      portValue = port.ToInteger(&error);
      aPrefs->SetIntPref(aPortPref, portValue);
    }
    else
      SetUnicharPref(aPref, hostPort, aPrefs);
  }
}

void ParseOverrideServers(const nsAString& aServers, nsIPrefBranch* aBranch)
{
  // Windows (and Opera) formats its proxy override list in the form:
  // server;server;server where server is a server name or ip address,
  // or "<local>". Mozilla's format is server,server,server, and <local>
  // must be translated to "localhost,127.0.0.1"
  nsAutoString override(aServers);
  int32_t left = 0, right = 0;
  for (;;) {
    right = override.FindChar(';', right);
    const nsAString& host =
      Substring(override, left,
                (right < 0 ? override.Length() : right) - left);
    if (host.EqualsLiteral("<local>"))
      override.Replace(left, 7, NS_LITERAL_STRING("localhost,127.0.0.1"));
    if (right < 0)
      break;
    left = right + 1;
    override.Replace(right, 1, NS_LITERAL_STRING(","));
  }
  SetUnicharPref("network.proxy.no_proxies_on", override, aBranch);
}

void GetMigrateDataFromArray(MigrationData* aDataArray,
                             int32_t aDataArrayLength,
                             bool aReplace, nsIFile* aSourceProfile,
                             uint16_t* aResult)
{
  nsCOMPtr<nsIFile> sourceFile;
  bool exists;
  MigrationData* cursor;
  MigrationData* end = aDataArray + aDataArrayLength;
  for (cursor = aDataArray; cursor < end; ++cursor) {
    // When in replace mode, all items can be imported.
    // When in non-replace mode, only items that do not require file
    // replacement can be imported.
    if (aReplace || !cursor->replaceOnly) {
      aSourceProfile->Clone(getter_AddRefs(sourceFile));
      sourceFile->AppendNative(nsDependentCString(cursor->fileName));
      sourceFile->Exists(&exists);
      if (exists)
        *aResult |= cursor->sourceFlag;
    }
  }
}

void
GetProfilePath(nsIProfileStartup* aStartup, nsIFile** aProfileDir)
{
  *aProfileDir = nullptr;

  if (aStartup) {
    aStartup->GetDirectory(aProfileDir);
  }
  else {
    nsCOMPtr<nsIProperties> dirSvc
      (do_GetService(NS_DIRECTORY_SERVICE_CONTRACTID));
    if (dirSvc) {
      dirSvc->Get(NS_APP_USER_PROFILE_50_DIR, NS_GET_IID(nsIFile),
                  (void**)aProfileDir);
    }
  }
}

nsresult
ImportBookmarksHTML(nsIFile* aBookmarksFile,
                    const char16_t* aImportSourceNameKey)
{
  // XXX: need to make this work with places
  return NS_OK;
}
