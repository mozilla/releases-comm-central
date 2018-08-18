/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

// Forked from modules/libpref/Preferences.cpp
class NSRELATIVEFILEPREF_CLASS final : public nsIRelativeFilePref
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIRELATIVEFILEPREF
  NSRELATIVEFILEPREF_CLASS();

private:
  virtual ~NSRELATIVEFILEPREF_CLASS();
  nsCOMPtr<nsIFile> mFile;
  nsCString mRelativeToKey;
};

NS_IMPL_ISUPPORTS(NSRELATIVEFILEPREF_CLASS, nsIRelativeFilePref)
NSRELATIVEFILEPREF_CLASS::NSRELATIVEFILEPREF_CLASS() = default;
NSRELATIVEFILEPREF_CLASS::~NSRELATIVEFILEPREF_CLASS() = default;

NS_IMETHODIMP NSRELATIVEFILEPREF_CLASS::GetFile(nsIFile** aFile)
{
  NS_ENSURE_ARG_POINTER(aFile);
  *aFile = mFile;
  NS_IF_ADDREF(*aFile);
  return NS_OK;
}

NS_IMETHODIMP NSRELATIVEFILEPREF_CLASS::SetFile(nsIFile* aFile)
{
  mFile = aFile;
  return NS_OK;
}

NS_IMETHODIMP NSRELATIVEFILEPREF_CLASS::GetRelativeToKey(nsACString& aRelativeToKey)
{
  aRelativeToKey.Assign(mRelativeToKey);
  return NS_OK;
}

NS_IMETHODIMP NSRELATIVEFILEPREF_CLASS::SetRelativeToKey(const nsACString& aRelativeToKey)
{
  mRelativeToKey.Assign(aRelativeToKey);
  return NS_OK;
}
