/* -*- Mode: C++; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

/********************************************************************************************************

   Interface for representing Address Book Person Card Property

*********************************************************************************************************/

#ifndef nsAbCardProperty_h__
#define nsAbCardProperty_h__

#include "nsIAbCard.h"
#include "nsInterfaceHashtable.h"
#include "nsIVariant.h"

/*
 * Address Book Card Property
 */

class nsAbCardProperty : public nsIAbCard {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_NSIABCARD

  nsAbCardProperty();

 protected:
  virtual ~nsAbCardProperty();
  bool m_IsMailList;
  nsCString m_MailListURI;

  // Store most of the properties here
  nsInterfaceHashtable<nsCStringHashKey, nsIVariant> m_properties;

  nsCString m_directoryUID;
};

#endif
