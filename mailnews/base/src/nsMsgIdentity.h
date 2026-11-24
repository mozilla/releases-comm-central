/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_

#include "nsIMsgIdentity.h"
#include "nsIPrefBranch.h"
#include "nsCOMPtr.h"
#include "nsString.h"

using mozilla::dom::Promise;

class nsMsgIdentity final : public nsIMsgIdentity {
 public:
  NS_DECL_THREADSAFE_ISUPPORTS
  NS_DECL_NSIMSGIDENTITY

 private:
  friend class FolderGetterOrCreator;

  ~nsMsgIdentity() {}
  nsCString mKey;
  nsCOMPtr<nsIPrefBranch> mPrefBranch;
  nsCOMPtr<nsIPrefBranch> mDefPrefBranch;

  nsresult GetOrCreateFolderAsync(const char* prefName, uint32_t folderFlag,
                                  const char* pickerModePrefName,
                                  const nsACString& folderName, JSContext* cx,
                                  Promise** aPromise);
  nsresult GetExistingSpecialFolder(const char* prefName,
                                    const char* pickerModePrefName,
                                    uint32_t folderFlag,
                                    nsIMsgFolder** existingFolder,
                                    nsIMsgIncomingServer** configuredServer);
  nsresult ReconcileSpecialFolder(const char* prefName,
                                  const char* pickerModePrefName,
                                  uint32_t folderFlag);
  nsresult ApplySpecialFolder(const char* prefName, uint32_t folderFlag,
                              nsIMsgFolder* folder);
  bool UseAccountDefaultFolder(const char* pickerModePrefName);
  nsresult SetFolderPref(const char* pref, const nsACString& retval,
                         uint32_t folderFlag,
                         nsIMsgFolder* resolvedFolder = nullptr);
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_
