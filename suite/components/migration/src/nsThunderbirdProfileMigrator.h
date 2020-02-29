/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef ThunderbirdProfileMigrator_h__
#define ThunderbirdProfileMigrator_h__

#include "nsISuiteProfileMigrator.h"
#include "nsIFile.h"
#include "nsIObserverService.h"
#include "nsSuiteProfileMigratorBase.h"
#include "nsITimer.h"
#include "mozilla/Attributes.h"

class nsIFile;
class nsIPrefBranch;
class nsIPrefService;

class nsThunderbirdProfileMigrator final : public nsSuiteProfileMigratorBase
{
public:
  NS_DECL_ISUPPORTS_INHERITED

  nsThunderbirdProfileMigrator();

  // nsISuiteProfileMigrator methods
  NS_IMETHOD Migrate(uint16_t aItems, nsIProfileStartup *aStartup,
                     const char16_t *aProfile) override;
  NS_IMETHOD GetMigrateData(const char16_t *aProfile, bool aDoingStartup,
                            uint16_t *_retval) override;
  NS_IMETHOD GetSupportedItems(uint16_t *aSupportedItems) override;

protected:
  virtual ~nsThunderbirdProfileMigrator();
  nsresult FillProfileDataFromRegistry() override;
  nsresult CopyPreferences(bool aReplace);
  nsresult TransformPreferences(const char* aSourcePrefFileName,
                                const char* aTargetPrefFileName);
  nsresult CopyHistory(bool aReplace);
  nsresult CopyPasswords(bool aReplace);
};

#endif
