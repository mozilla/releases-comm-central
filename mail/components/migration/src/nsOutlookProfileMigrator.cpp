/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsMailProfileMigratorUtils.h"
#include "nsIServiceManager.h"
#include "nsOutlookProfileMigrator.h"
#include "nsIProfileMigrator.h"
#include "nsIImportSettings.h"
#include "nsIFile.h"
#include "nsComponentManagerUtils.h"

NS_IMPL_ISUPPORTS(nsOutlookProfileMigrator, nsIMailProfileMigrator, nsITimerCallback)


nsOutlookProfileMigrator::nsOutlookProfileMigrator()
{
  mProcessingMailFolders = false;
  // get the import service
  mImportModule = do_CreateInstance("@mozilla.org/import/import-outlook;1");
}

nsOutlookProfileMigrator::~nsOutlookProfileMigrator()
{
}

nsresult nsOutlookProfileMigrator::ContinueImport()
{
  return Notify(nullptr);
}

///////////////////////////////////////////////////////////////////////////////
// nsITimerCallback

NS_IMETHODIMP
nsOutlookProfileMigrator::Notify(nsITimer *timer)
{
  int32_t progress;
  mGenericImporter->GetProgress(&progress);

  nsAutoString index;
  index.AppendInt( progress );
  NOTIFY_OBSERVERS(MIGRATION_PROGRESS, index.get());

  if (progress == 100) // are we done yet?
  {
    if (mProcessingMailFolders)
      return FinishCopyingMailFolders();
    else
      return FinishCopyingAddressBookData();
  }
  else
  {
    // fire a timer to handle the next one.
    mFileIOTimer = do_CreateInstance("@mozilla.org/timer;1");
    if (mFileIOTimer)
      mFileIOTimer->InitWithCallback(static_cast<nsITimerCallback *>(this), 100, nsITimer::TYPE_ONE_SHOT);
  }
  return NS_OK;
}

///////////////////////////////////////////////////////////////////////////////
// nsIMailProfileMigrator

NS_IMETHODIMP
nsOutlookProfileMigrator::Migrate(uint16_t aItems, nsIProfileStartup* aStartup, const char16_t* aProfile)
{
  nsresult rv = NS_OK;

  if (aStartup)
  {
    rv = aStartup->DoStartup();
    NS_ENSURE_SUCCESS(rv, rv);
  }

  NOTIFY_OBSERVERS(MIGRATION_STARTED, nullptr);

  rv = ImportSettings(mImportModule);

  // now import address books
  // this routine will asynchronously import address book data and it will then kick off
  // the final migration step, copying the mail folders over.
  rv = ImportAddressBook(mImportModule);

  // don't broadcast an on end migration here. We aren't done until our asynch import process says we are done.
  return rv;
}

NS_IMETHODIMP
nsOutlookProfileMigrator::GetMigrateData(const char16_t* aProfile, bool aReplace, uint16_t* aResult)
{
  // There's no harm in assuming everything is available.
  *aResult = nsIMailProfileMigrator::ACCOUNT_SETTINGS | nsIMailProfileMigrator::ADDRESSBOOK_DATA |
             nsIMailProfileMigrator::MAILDATA;
  return NS_OK;
}

NS_IMETHODIMP
nsOutlookProfileMigrator::GetSourceExists(bool* aResult)
{
  *aResult = false;

  nsCOMPtr<nsISupports> supports;
  mImportModule->GetImportInterface(NS_IMPORT_SETTINGS_STR, getter_AddRefs(supports));
  nsCOMPtr<nsIImportSettings> importSettings = do_QueryInterface(supports);

  if (importSettings)
  {
    nsString description;
    nsCOMPtr<nsIFile> location;
    importSettings->AutoLocate(getter_Copies(description), getter_AddRefs(location), aResult);
  }

  return NS_OK;
}

NS_IMETHODIMP
nsOutlookProfileMigrator::GetSourceHasMultipleProfiles(bool* aResult)
{
  *aResult = false;
  return NS_OK;
}

NS_IMETHODIMP
nsOutlookProfileMigrator::GetSourceProfiles(nsIArray** aResult)
{
  *aResult = nullptr;
  return NS_OK;
}
