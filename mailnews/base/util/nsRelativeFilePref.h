/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

 // Forked from modules/libpref/Preferences.cpp
class nsRelativeFilePref final : public nsIRelativeFilePref
{
public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIRELATIVEFILEPREF
  nsRelativeFilePref();

private:
  virtual ~nsRelativeFilePref();
  nsCOMPtr<nsIFile> mFile;
  nsCString mRelativeToKey;
};

NS_IMPL_ISUPPORTS(nsRelativeFilePref, nsIRelativeFilePref)
nsRelativeFilePref::nsRelativeFilePref() = default;
nsRelativeFilePref::~nsRelativeFilePref() = default;

NS_IMETHODIMP nsRelativeFilePref::GetFile(nsIFile** aFile)
{
  NS_ENSURE_ARG_POINTER(aFile);
  *aFile = mFile;
  NS_IF_ADDREF(*aFile);
  return NS_OK;
}

NS_IMETHODIMP nsRelativeFilePref::SetFile(nsIFile* aFile)
{
  mFile = aFile;
  return NS_OK;
}

NS_IMETHODIMP nsRelativeFilePref::GetRelativeToKey(nsACString& aRelativeToKey)
{
  aRelativeToKey.Assign(mRelativeToKey);
  return NS_OK;
}

NS_IMETHODIMP nsRelativeFilePref::SetRelativeToKey(const nsACString& aRelativeToKey)
{
  mRelativeToKey.Assign(aRelativeToKey);
  return NS_OK;
}
