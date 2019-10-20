/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef SuiteProfileMigratorUtils_h__
#define SuiteProfileMigratorUtils_h__

#define MIGRATION_ITEMBEFOREMIGRATE "Migration:ItemBeforeMigrate"
#define MIGRATION_ITEMAFTERMIGRATE  "Migration:ItemAfterMigrate"
#define MIGRATION_STARTED           "Migration:Started"
#define MIGRATION_ENDED             "Migration:Ended"
#define MIGRATION_PROGRESS          "Migration:Progress"

#define NOTIFY_OBSERVERS(message, item) \
  mObserverService->NotifyObservers(nullptr, message, item)

#define COPY_DATA(func, replace, itemIndex) \
  if (NS_SUCCEEDED(rv) && (aItems & itemIndex || !aItems)) { \
    nsAutoString index; \
    index.AppendInt(itemIndex); \
    NOTIFY_OBSERVERS(MIGRATION_ITEMBEFOREMIGRATE, index.get()); \
    rv = func(replace); \
    NOTIFY_OBSERVERS(MIGRATION_ITEMAFTERMIGRATE, index.get()); \
  }

#define MAKEPREFTRANSFORM(pref, newpref, getmethod, setmethod) \
  { pref, newpref, F(Get##getmethod), F(Set##setmethod), false, { -1 } }

#define MAKESAMETYPEPREFTRANSFORM(pref, method) \
  { pref, 0, F(Get##method), F(Set##method), false, { -1 } }

#include "nsString.h"
#include "nscore.h"
#include "nsCOMPtr.h"

class nsIPrefBranch;
class nsIProfileStartup;
class nsIFile;

struct MigrationData {
  const char* fileName;
  uint32_t sourceFlag;
  bool replaceOnly;
};

class nsIFile;
void GetMigrateDataFromArray(MigrationData* aDataArray,
                             int32_t aDataArrayLength,
                             bool aReplace,
                             nsIFile* aSourceProfile,
                             uint16_t* aResult);


// get the base directory of the *target* profile
// this is already cloned, modify it to your heart's content
void GetProfilePath(nsIProfileStartup* aStartup,
                    nsIFile** aProfileDir);

#endif
