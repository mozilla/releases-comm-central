/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_
#define COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_

#include "nsIMsgIdentity.h"
#include "nsIPrefBranch.h"
#include "nsCOMPtr.h"
#include "nsString.h"

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
  bool checkServerForExistingFolder(nsIMsgFolder* rootFolder,
                                    const char* prefName, uint32_t folderFlag,
                                    const nsACString& folderName,
                                    nsIMsgFolder** retval);
  nsresult getOrCreateFolder(const char* prefName, uint32_t folderFlag,
                             const nsACString& folderName,
                             nsIMsgFolder** retval);
  nsresult setFolderPref(const char* pref, const nsACString& retval,
                         uint32_t folderFlag);
};

#define NS_IMPL_IDPREF_STR(_postfix, _prefname)           \
  NS_IMETHODIMP                                           \
  nsMsgIdentity::Get##_postfix(nsACString& retval) {      \
    return GetCharAttribute(_prefname, retval);           \
  }                                                       \
  NS_IMETHODIMP                                           \
  nsMsgIdentity::Set##_postfix(const nsACString& value) { \
    return SetCharAttribute(_prefname, value);            \
  }

#define NS_IMPL_IDPREF_WSTR(_postfix, _prefname)         \
  NS_IMETHODIMP                                          \
  nsMsgIdentity::Get##_postfix(nsAString& retval) {      \
    return GetUnicharAttribute(_prefname, retval);       \
  }                                                      \
  NS_IMETHODIMP                                          \
  nsMsgIdentity::Set##_postfix(const nsAString& value) { \
    return SetUnicharAttribute(_prefname, value);        \
  }

#define NS_IMPL_IDPREF_BOOL(_postfix, _prefname)       \
  NS_IMETHODIMP                                        \
  nsMsgIdentity::Get##_postfix(bool* retval) {         \
    return GetBoolAttribute(_prefname, retval);        \
  }                                                    \
  NS_IMETHODIMP                                        \
  nsMsgIdentity::Set##_postfix(bool value) {           \
    return mPrefBranch->SetBoolPref(_prefname, value); \
  }

#define NS_IMPL_IDPREF_INT(_postfix, _prefname)       \
  NS_IMETHODIMP                                       \
  nsMsgIdentity::Get##_postfix(int32_t* retval) {     \
    return GetIntAttribute(_prefname, retval);        \
  }                                                   \
  NS_IMETHODIMP                                       \
  nsMsgIdentity::Set##_postfix(int32_t value) {       \
    return mPrefBranch->SetIntPref(_prefname, value); \
  }

#define NS_IMPL_FOLDERPREF_STR(_postfix, _prefName, _folderFlag, _folderName) \
  NS_IMETHODIMP                                                               \
  nsMsgIdentity::Get##_postfix##URI(nsACString& retval) {                     \
    return GetCharAttribute(_prefName, retval);                               \
  }                                                                           \
  NS_IMETHODIMP                                                               \
  nsMsgIdentity::Set##_postfix##URI(const nsACString& value) {                \
    return setFolderPref(_prefName, value, _folderFlag);                      \
  }                                                                           \
  NS_IMETHODIMP                                                               \
  nsMsgIdentity::GetOrCreate##_postfix(nsIMsgFolder** retval) {               \
    return getOrCreateFolder(_prefName, _folderFlag, _folderName, retval);    \
  }

#endif  // COMM_MAILNEWS_BASE_SRC_NSMSGIDENTITY_H_
