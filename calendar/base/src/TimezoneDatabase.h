/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef COMM_CALENDAR_BASE_SRC_TIMEZONEDATABASE_H_
#define COMM_CALENDAR_BASE_SRC_TIMEZONEDATABASE_H_

#include "calITimezoneDatabase.h"

class TimezoneDatabase final : public calITimezoneDatabase {
  NS_DECL_ISUPPORTS
  NS_DECL_CALITIMEZONEDATABASE

 public:
  TimezoneDatabase() = default;

 private:
  ~TimezoneDatabase() = default;
};

#endif  // COMM_CALENDAR_BASE_SRC_TIMEZONEDATABASE_H_
