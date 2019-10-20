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
#include "nsIStringBundle.h"
#include "nsCRT.h"

#define MIGRATION_BUNDLE "chrome://communicator/migration/locale/migration.properties"

using namespace mozilla;

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
