/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEFOLDERINFO_H_
#define COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEFOLDERINFO_H_

#include "IExchangeFolderInfo.h"
#include "nsIMsgDatabase.h"

/**
 * Provides queries about a folder's local messages.
 */
class ExchangeFolderInfo final : public IExchangeFolderInfo {
 public:
  NS_DECL_ISUPPORTS
  NS_DECL_IEXCHANGEFOLDERINFO

  explicit ExchangeFolderInfo(nsIMsgDatabase* db) : mDB(db) {}

 private:
  ~ExchangeFolderInfo() = default;

  RefPtr<nsIMsgDatabase> mDB;
};

#endif  // COMM_MAILNEWS_PROTOCOLS_EXCHANGE_SRC_EXCHANGEFOLDERINFO_H_
