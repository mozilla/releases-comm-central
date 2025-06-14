/* -*- Mode: C++; tab-width: 4; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSIMAPMAILDATABASE_H_
#define COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSIMAPMAILDATABASE_H_

#include "nsMailDatabase.h"

class nsImapMailDatabase : public nsMailDatabase {
 public:
  // OK, it's dumb that this should require a fileSpec, since there is no file
  // for the folder. This is mainly because we're deriving from nsMailDatabase;
  // Perhaps we shouldn't...
  nsImapMailDatabase();
  virtual ~nsImapMailDatabase();

  NS_IMETHOD GetSummaryValid(bool* aResult) override;
  NS_IMETHOD SetSummaryValid(bool valid = true) override;
  virtual nsresult AdjustExpungedBytesOnDelete(nsIMsgDBHdr* msgHdr) override;

  NS_IMETHOD ForceClosed() override;
  NS_IMETHOD AddNewHdrToDB(nsIMsgDBHdr* newHdr, bool notify) override;
  NS_IMETHOD SetAttributeOnPendingHdr(nsIMsgDBHdr* pendingHdr,
                                      const char* property,
                                      const char* propertyVal) override;
  NS_IMETHOD SetUint32AttributeOnPendingHdr(nsIMsgDBHdr* pendingHdr,
                                            const char* property,
                                            uint32_t propertyVal) override;
  NS_IMETHOD SetUint64AttributeOnPendingHdr(nsIMsgDBHdr* aPendingHdr,
                                            const char* aProperty,
                                            uint64_t aPropertyVal) override;
  NS_IMETHOD DeleteMessages(nsTArray<nsMsgKey> const& nsMsgKeys,
                            nsIDBChangeListener* instigator) override;
  NS_IMETHOD UpdatePendingAttributes(nsIMsgDBHdr* aNewHdr) override;

 protected:
  nsresult GetRowForPendingHdr(nsIMsgDBHdr* pendingHdr, nsIMdbRow** row);
  nsresult GetAllPendingHdrsTable();
  mdb_token m_pendingHdrsRowScopeToken;
  mdb_token m_pendingHdrsTableKindToken;
  nsCOMPtr<nsIMdbTable> m_mdbAllPendingHdrsTable;
};

#endif  // COMM_MAILNEWS_DB_MSGDB_PUBLIC_NSIMAPMAILDATABASE_H_
