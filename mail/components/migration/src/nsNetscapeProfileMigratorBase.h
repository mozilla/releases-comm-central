/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef netscapeprofilemigratorbase___h___
#define netscapeprofilemigratorbase___h___

#include "nsAttrValue.h"
#include "nsIFile.h"
#include "nsIStringBundle.h"
#include "nsString.h"
#include "nsTArray.h"
#include "nsIObserverService.h"
#include "nsITimer.h"
#include "nsIMailProfileMigrator.h"

class nsIPrefBranch;

struct fileTransactionEntry {
  nsCOMPtr<nsIFile> srcFile;   // the src path including leaf name
  nsCOMPtr<nsIFile> destFile;  // the destination path
  nsString
      newName;  // only valid if the file should be renamed after getting copied
};

#define TRANSFORMFUNCTION(a) nsNetscapeProfileMigratorBase::a

#define MAKEPREFTRANSFORM(pref, newpref, getmethod, setmethod)         \
  {                                                                    \
    pref, newpref, TRANSFORMFUNCTION(Get##getmethod), TRANSFORMFUNCTION(Set##setmethod), false, { -1 } \
  }

#define MAKESAMETYPEPREFTRANSFORM(pref, method)            \
  {                                                        \
    pref, 0, TRANSFORMFUNCTION(Get##method), TRANSFORMFUNCTION(Set##method), false, { -1 } \
  }

class nsNetscapeProfileMigratorBase : public nsIMailProfileMigrator,
                                      public nsITimerCallback,
                                      public nsINamed

{
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSITIMERCALLBACK
  NS_DECL_NSINAMED

  nsNetscapeProfileMigratorBase();

  NS_IMETHOD GetSourceHasMultipleProfiles(bool* aResult) override;
  NS_IMETHOD GetSourceExists(bool* aResult) override;

  struct PrefTransform;
  typedef nsresult (*prefConverter)(PrefTransform*, nsIPrefBranch*);

  struct PrefTransform {
    const char* sourcePrefName;
    const char* targetPrefName;
    prefConverter prefGetterFunc;
    prefConverter prefSetterFunc;
    bool prefHasValue;
    union {
      int32_t intValue;
      bool boolValue;
      char* stringValue;
    };
  };

  struct PrefBranchStruct {
    char* prefName;
    int32_t type;
    union {
      char* stringValue;
      int32_t intValue;
      bool boolValue;
    };
  };

  typedef nsTArray<PrefBranchStruct*> PBStructArray;

  static nsresult GetString(PrefTransform* aTransform, nsIPrefBranch* aBranch);
  static nsresult SetString(PrefTransform* aTransform, nsIPrefBranch* aBranch);
  static nsresult GetBool(PrefTransform* aTransform, nsIPrefBranch* aBranch);
  static nsresult SetBool(PrefTransform* aTransform, nsIPrefBranch* aBranch);
  static nsresult GetInt(PrefTransform* aTransform, nsIPrefBranch* aBranch);
  static nsresult SetInt(PrefTransform* aTransform, nsIPrefBranch* aBranch);

  nsresult RecursiveCopy(nsIFile* srcDir, nsIFile* destDir);  // helper routine

 protected:
  virtual ~nsNetscapeProfileMigratorBase() {}
  void CopyNextFolder();
  void EndCopyFolders();

  nsresult GetProfileDataFromProfilesIni(
      nsIFile* aDataDir, nsTArray<nsString>& aProfileNames,
      nsTArray<RefPtr<nsIFile>>& aProfileLocations);

  nsresult CopyFile(const nsAString& aSourceFileName,
                    const nsAString& aTargetFileName);

  nsresult GetSignonFileName(bool aReplace, nsACString& aFileName);
  nsresult LocateSignonsFile(nsACString& aResult);

  nsCOMPtr<nsIFile> mSourceProfile;
  nsCOMPtr<nsIFile> mTargetProfile;

  // List of src/destination files we still have to copy into the new profile
  // directory.
  nsTArray<fileTransactionEntry> mFileCopyTransactions;
  uint32_t mFileCopyTransactionIndex;

  int64_t mMaxProgress;
  int64_t mCurrentProgress;

  nsCOMPtr<nsIObserverService> mObserverService;
  nsCOMPtr<nsITimer> mFileIOTimer;
};

#endif
