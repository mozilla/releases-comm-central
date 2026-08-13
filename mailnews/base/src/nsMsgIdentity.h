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
  ~nsMsgIdentity() {}
  nsCString mKey;
  nsCOMPtr<nsIPrefBranch> mPrefBranch;
  nsCOMPtr<nsIPrefBranch> mDefPrefBranch;

 protected:
  nsresult getOrCreateFolderAsync(const char* prefName, uint32_t folderFlag,
                                  const nsACString& folderName, JSContext* cx,
                                  Promise** aPromise);
  nsresult setFolderPref(const char* pref, const nsACString& retval,
                         uint32_t folderFlag);
};

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_
