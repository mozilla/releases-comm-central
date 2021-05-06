/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nscore.h"
#include "nsIMsgAccount.h"
#include "nsIPrefBranch.h"
#include "nsString.h"

class nsMsgAccount : public nsIMsgAccount {
 public:
  nsMsgAccount();

  NS_DECL_ISUPPORTS
  NS_DECL_NSIMSGACCOUNT

 private:
  virtual ~nsMsgAccount();
  nsCString m_accountKey;
  nsCOMPtr<nsIPrefBranch> m_prefs;
  nsCOMPtr<nsIMsgIncomingServer> m_incomingServer;

  bool m_identitiesValid;
  nsTArray<nsCOMPtr<nsIMsgIdentity>> m_identities;

  nsresult getPrefService();
  nsresult createIncomingServer();
  nsresult createIdentities();
  nsresult saveIdentitiesPref();

  // Have we tried to get the server yet?
  bool mTriedToGetServer;
};
