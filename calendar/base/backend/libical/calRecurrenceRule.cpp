/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "nsCOMArray.h"

#include "calRecurrenceRule.h"

#include "calDateTime.h"
#include "calIItemBase.h"
#include "calIEvent.h"

#include "calICSService.h"

#include "nsIClassInfoImpl.h"

#include <climits>

NS_IMPL_CLASSINFO(calRecurrenceRule, NULL, 0, CAL_RECURRENCERULE_CID)
NS_IMPL_ISUPPORTS_CI(calRecurrenceRule, calIRecurrenceItem, calIRecurrenceRule)

calRecurrenceRule::calRecurrenceRule()
    : mImmutable(false), mIsNegative(false), mIsByCount(false) {
  icalrecurrencetype_clear(&mIcalRecur);
}

NS_IMETHODIMP
calRecurrenceRule::GetIsMutable(bool* aResult) {
  NS_ENSURE_ARG_POINTER(aResult);
  *aResult = !mImmutable;
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::MakeImmutable() {
  mImmutable = true;
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::Clone(calIRecurrenceItem** aResult) {
  calRecurrenceRule* const crc = new calRecurrenceRule();
  CAL_ENSURE_MEMORY(crc);

  crc->mIsNegative = mIsNegative;
  crc->mIsByCount = mIsByCount;
  crc->mIcalRecur = mIcalRecur;

  NS_ADDREF(*aResult = crc);
  return NS_OK;
}

/* attribute boolean isNegative; */
NS_IMETHODIMP
calRecurrenceRule::GetIsNegative(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);
  *_retval = mIsNegative;
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetIsNegative(bool aIsNegative) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;
  mIsNegative = aIsNegative;
  return NS_OK;
}

/* readonly attribute boolean isFinite; */
NS_IMETHODIMP
calRecurrenceRule::GetIsFinite(bool* _retval) {
  NS_ENSURE_ARG_POINTER(_retval);

  if ((mIsByCount && mIcalRecur.count == 0) ||
      (!mIsByCount && icaltime_is_null_time(mIcalRecur.until))) {
    *_retval = false;
  } else {
    *_retval = true;
  }
  return NS_OK;
}

/* attribute long type; */
NS_IMETHODIMP
calRecurrenceRule::GetType(nsACString& aType) {
  switch (mIcalRecur.freq) {
#define RECUR_HELPER(x)       \
  case ICAL_##x##_RECURRENCE: \
    aType.AssignLiteral(#x);  \
    break
    RECUR_HELPER(SECONDLY);
    RECUR_HELPER(MINUTELY);
    RECUR_HELPER(HOURLY);
    RECUR_HELPER(DAILY);
    RECUR_HELPER(WEEKLY);
    RECUR_HELPER(MONTHLY);
    RECUR_HELPER(YEARLY);
#undef RECUR_HELPER
    default:
      aType.AssignLiteral("");
  }

  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetType(const nsACString& aType) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;
#define RECUR_HELPER(x) \
  if (aType.EqualsLiteral(#x)) mIcalRecur.freq = ICAL_##x##_RECURRENCE
  RECUR_HELPER(SECONDLY);
  else RECUR_HELPER(MINUTELY);
  else RECUR_HELPER(HOURLY);
  else RECUR_HELPER(DAILY);
  else RECUR_HELPER(WEEKLY);
  else RECUR_HELPER(MONTHLY);
  else RECUR_HELPER(YEARLY);
#undef RECUR_HELPER
  else if (aType.IsEmpty() || aType.EqualsLiteral("")) mIcalRecur.freq =
      ICAL_NO_RECURRENCE;
  else return NS_ERROR_FAILURE;

  return NS_OK;
}

/* attribute long count; */
NS_IMETHODIMP
calRecurrenceRule::GetCount(int32_t* aRecurCount) {
  NS_ENSURE_ARG_POINTER(aRecurCount);

  if (!mIsByCount) return NS_ERROR_FAILURE;

  if (mIcalRecur.count == 0 && icaltime_is_null_time(mIcalRecur.until)) {
    *aRecurCount = -1;
  } else if (mIcalRecur.count) {
    *aRecurCount = mIcalRecur.count;
  } else {
    // count wasn't set, so we don't know
    return NS_ERROR_FAILURE;
  }

  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetCount(int32_t aRecurCount) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;
  if (aRecurCount != -1) {
    if (aRecurCount < 0 || aRecurCount > INT_MAX) return NS_ERROR_ILLEGAL_VALUE;
    mIcalRecur.count = static_cast<int>(aRecurCount);
    mIsByCount = true;
  } else {
    mIcalRecur.count = 0;
    mIsByCount = false;
  }

  mIcalRecur.until = icaltime_null_time();

  return NS_OK;
}

/* attribute calIDateTime untilDate; */
NS_IMETHODIMP
calRecurrenceRule::GetUntilDate(calIDateTime** aRecurEnd) {
  NS_ENSURE_ARG_POINTER(aRecurEnd);

  if (mIsByCount) return NS_ERROR_FAILURE;

  if (!icaltime_is_null_time(mIcalRecur.until)) {
    *aRecurEnd = new calDateTime(&mIcalRecur.until, nullptr);
    CAL_ENSURE_MEMORY(*aRecurEnd);
    NS_ADDREF(*aRecurEnd);
  } else {
    // infinite recurrence
    *aRecurEnd = nullptr;
  }
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetUntilDate(calIDateTime* aRecurEnd) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;
  if (aRecurEnd) {
    nsresult rv;
    bool b;
    nsCOMPtr<calIDateTimeLibical> icaldt;
    nsCOMPtr<calITimezone> tz;
    aRecurEnd->GetTimezone(getter_AddRefs(tz));

    if (NS_SUCCEEDED(tz->GetIsUTC(&b)) && !b &&
        NS_SUCCEEDED(tz->GetIsFloating(&b)) && !b) {
      // convert to UTC:
      nsCOMPtr<calIDateTime> dt;
      nsCOMPtr<calITimezone> ctz = cal::UTC();
      aRecurEnd->GetInTimezone(ctz, getter_AddRefs(dt));
      icaldt = do_QueryInterface(dt, &rv);
    } else {
      icaldt = do_QueryInterface(aRecurEnd, &rv);
    }

    NS_ENSURE_SUCCESS(rv, rv);
    struct icaltimetype itt;
    icaldt->ToIcalTime(&itt);

    mIcalRecur.until = itt;
  } else {
    mIcalRecur.until = icaltime_null_time();
  }

  mIcalRecur.count = 0;

  mIsByCount = false;

  return NS_OK;
}

/* readonly attribute boolean isByCount; */
NS_IMETHODIMP
calRecurrenceRule::GetIsByCount(bool* aIsByCount) {
  *aIsByCount = mIsByCount;
  return NS_OK;
}

/* attribute long interval; */
NS_IMETHODIMP
calRecurrenceRule::GetInterval(int32_t* aInterval) {
  NS_ENSURE_ARG_POINTER(aInterval);
  *aInterval = mIcalRecur.interval;
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetInterval(int32_t aInterval) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;
  if (aInterval < 0 || aInterval > SHRT_MAX) return NS_ERROR_ILLEGAL_VALUE;
  mIcalRecur.interval = static_cast<short>(aInterval);
  return NS_OK;
}

// Helper table to encode the size/location of the various arrays in the
// icalrecurrencetype struct.
static const struct {
  const char* name;
  size_t offset;
  size_t maxCount;
} recurrenceTable[] = {
    {"BYSECOND", offsetof(icalrecurrencetype, by_second), ICAL_BY_SECOND_SIZE},
    {"BYMINUTE", offsetof(icalrecurrencetype, by_minute), ICAL_BY_MINUTE_SIZE},
    {"BYHOUR", offsetof(icalrecurrencetype, by_hour), ICAL_BY_HOUR_SIZE},
    {"BYDAY", offsetof(icalrecurrencetype, by_day), ICAL_BY_DAY_SIZE},
    {"BYMONTHDAY", offsetof(icalrecurrencetype, by_month_day),
     ICAL_BY_MONTHDAY_SIZE},
    {"BYYEARDAY", offsetof(icalrecurrencetype, by_year_day),
     ICAL_BY_YEARDAY_SIZE},
    {"BYWEEKNO", offsetof(icalrecurrencetype, by_week_no), ICAL_BY_WEEKNO_SIZE},
    {"BYMONTH", offsetof(icalrecurrencetype, by_month), ICAL_BY_MONTH_SIZE},
    {"BYSETPOS", offsetof(icalrecurrencetype, by_set_pos), ICAL_BY_SETPOS_SIZE},
    {nullptr, 0, 0}};

NS_IMETHODIMP
calRecurrenceRule::GetComponent(const nsACString& aComponentType,
                                nsTArray<int16_t>& aValues) {
  aValues.ClearAndRetainStorage();
  // Look up the array for this component type.
  for (int i = 0; recurrenceTable[i].name; ++i) {
    auto const& row = recurrenceTable[i];
    if (aComponentType.EqualsASCII(row.name)) {
      // Found it.
      int16_t const* src = (int16_t*)((uint8_t*)&mIcalRecur + row.offset);
      size_t count;
      for (count = 0; count < row.maxCount; count++) {
        if (src[count] == ICAL_RECURRENCE_ARRAY_MAX) break;
      }
      aValues.ReplaceElementsAt(0, aValues.Length(), src, count);
      return NS_OK;
    }
  }
  return NS_ERROR_FAILURE;  // Invalid component.
}

NS_IMETHODIMP
calRecurrenceRule::SetComponent(const nsACString& aComponentType,
                                nsTArray<int16_t> const& aValues) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;

  // Look up the array for this component type.
  for (int i = 0; recurrenceTable[i].name; ++i) {
    auto const& row = recurrenceTable[i];
    if (aComponentType.EqualsASCII(row.name)) {
      // Found it.
      int16_t* dest = (int16_t*)((uint8_t*)&mIcalRecur + row.offset);
      if (aValues.Length() > row.maxCount) return NS_ERROR_FAILURE;
      for (int16_t v : aValues) {
        *dest++ = v;
      }
      // Terminate array unless full.
      if (aValues.Length() < row.maxCount) {
        *dest++ = ICAL_RECURRENCE_ARRAY_MAX;
      }
      return NS_OK;
    }
  }
  return NS_ERROR_FAILURE;  // Invalid component.
}

/* calIDateTime getNextOccurrence (in calIDateTime aStartTime, in calIDateTime
 * aOccurrenceTime); */
NS_IMETHODIMP
calRecurrenceRule::GetNextOccurrence(calIDateTime* aStartTime,
                                     calIDateTime* aOccurrenceTime,
                                     calIDateTime** _retval) {
  NS_ENSURE_ARG_POINTER(aStartTime);
  NS_ENSURE_ARG_POINTER(aOccurrenceTime);
  NS_ENSURE_ARG_POINTER(_retval);

  nsresult rv;

  nsCOMPtr<calIDateTimeLibical> icaldtstart =
      do_QueryInterface(aStartTime, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  nsCOMPtr<calIDateTimeLibical> icaloccurtime =
      do_QueryInterface(aOccurrenceTime, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  struct icaltimetype dtstart;
  icaldtstart->ToIcalTime(&dtstart);

  struct icaltimetype occurtime;
  icaloccurtime->ToIcalTime(&occurtime);

  icalrecur_iterator* recur_iter;
  recur_iter = icalrecur_iterator_new(mIcalRecur, dtstart);
  if (!recur_iter) return NS_ERROR_OUT_OF_MEMORY;

  struct icaltimetype next = icalrecur_iterator_next(recur_iter);
  while (!icaltime_is_null_time(next)) {
    if (icaltime_compare(next, occurtime) > 0) break;

    next = icalrecur_iterator_next(recur_iter);
  }

  icalrecur_iterator_free(recur_iter);

  if (icaltime_is_null_time(next)) {
    *_retval = nullptr;
    return NS_OK;
  }

  nsCOMPtr<calITimezone> tz;
  aStartTime->GetTimezone(getter_AddRefs(tz));
  *_retval = new calDateTime(&next, tz);
  CAL_ENSURE_MEMORY(*_retval);
  NS_ADDREF(*_retval);
  return NS_OK;
}

static inline icaltimetype ensureDateTime(icaltimetype const& icalt) {
  if (!icalt.is_date) {
    return icalt;
  } else {
    icaltimetype ret = icalt;
    ret.is_date = 0;
    ret.hour = 0;
    ret.minute = 0;
    ret.second = 0;
    return ret;
  }
}

NS_IMETHODIMP
calRecurrenceRule::GetOccurrences(calIDateTime* aStartTime,
                                  calIDateTime* aRangeStart,
                                  calIDateTime* aRangeEnd, uint32_t aMaxCount,
                                  nsTArray<RefPtr<calIDateTime>>& aDates) {
  NS_ENSURE_ARG_POINTER(aStartTime);
  NS_ENSURE_ARG_POINTER(aRangeStart);
  aDates.ClearAndRetainStorage();

  // make sure the request is sane; infinite recurrence
  // with no end time is bad times.
  if (!aMaxCount && !aRangeEnd && mIcalRecur.count == 0 &&
      icaltime_is_null_time(mIcalRecur.until))
    return NS_ERROR_INVALID_ARG;

  nsCOMArray<calIDateTime> dates;

#ifdef DEBUG_dbo
  {
    char const* const ss = icalrecurrencetype_as_string(&mIcalRecur);
    nsAutoCString tst, tend;
    aRangeStart->ToString(tst);
    aRangeEnd->ToString(tend);
    printf("RULE: [%s -> %s, %d]: %s\n", tst.get(), tend.get(),
           mIcalRecur.count, ss);
  }
#endif

  nsresult rv;

  nsCOMPtr<calIDateTimeLibical> icalrangestart =
      do_QueryInterface(aRangeStart, &rv);
  NS_ENSURE_SUCCESS(rv, rv);
  nsCOMPtr<calIDateTimeLibical> icaldtstart =
      do_QueryInterface(aStartTime, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  struct icaltimetype rangestart, dtstart, dtend;
  icalrangestart->ToIcalTime(&rangestart);
  rangestart = ensureDateTime(rangestart);
  icaldtstart->ToIcalTime(&dtstart);
  nsCOMPtr<calITimezone> tz;
  aStartTime->GetTimezone(getter_AddRefs(tz));

  if (aRangeEnd) {
    nsCOMPtr<calIDateTimeLibical> icalrangeend =
        do_QueryInterface(aRangeEnd, &rv);
    NS_ENSURE_SUCCESS(rv, rv);

    icalrangeend->ToIcalTime(&dtend);
    dtend = ensureDateTime(dtend);

    // if the start of the recurrence is past the end,
    // we have no dates
    if (icaltime_compare(dtstart, dtend) >= 0) {
      return NS_OK;
    }
  }

  icalrecur_iterator* recur_iter;
  recur_iter = icalrecur_iterator_new(mIcalRecur, dtstart);
  if (!recur_iter) return NS_ERROR_OUT_OF_MEMORY;

  for (icaltimetype next = icalrecur_iterator_next(recur_iter);
       !icaltime_is_null_time(next);
       next = icalrecur_iterator_next(recur_iter)) {
    icaltimetype const dtNext(ensureDateTime(next));

    // if this thing is before the range start
    if (icaltime_compare(dtNext, rangestart) < 0) {
      continue;
    }

    if (aRangeEnd && icaltime_compare(dtNext, dtend) >= 0) break;

    calIDateTime* cdt = new calDateTime(&next, tz);
    aDates.AppendElement(cdt);
#ifdef DEBUG_dbo
    {
      nsAutoCString str;
      cdt->ToString(str);
      printf("  occ: %s\n", str.get());
    }
#endif
    if (aMaxCount && aMaxCount <= aDates.Length()) break;
  }

  icalrecur_iterator_free(recur_iter);

  return NS_OK;
}

/**
 ** ical property getting/setting
 **/
NS_IMETHODIMP
calRecurrenceRule::GetIcalProperty(calIIcalProperty** prop) {
  icalproperty* const rrule = icalproperty_new_rrule(mIcalRecur);
  CAL_ENSURE_MEMORY(rrule);
  *prop = new calIcalProperty(rrule, nullptr);
  if (!*prop) {
    icalproperty_free(rrule);
    return NS_ERROR_FAILURE;
  }

  NS_ADDREF(*prop);
  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetIcalProperty(calIIcalProperty* aProp) {
  NS_ENSURE_ARG_POINTER(aProp);
  nsresult rv;

  nsCOMPtr<calIIcalPropertyLibical> icalprop = do_QueryInterface(aProp, &rv);
  NS_ENSURE_SUCCESS(rv, rv);

  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;

  nsAutoCString propname;
  rv = aProp->GetPropertyName(propname);
  NS_ENSURE_SUCCESS(rv, rv);
  if (propname.EqualsLiteral("RRULE")) {
    mIsNegative = false;
  } else {
    return NS_ERROR_INVALID_ARG;
  }

  icalproperty* prop;
  struct icalrecurrencetype icalrecur;

  prop = icalprop->GetLibicalProperty();

  icalrecur = icalproperty_get_rrule(prop);

  // XXX Note that we ignore the dtstart and use the one from the
  // event, though I realize now that we shouldn't.  Ignoring
  // dtstart makes it impossible to have multiple RRULEs on one
  // event that start at different times (e.g. every day starting on
  // jan 1 for 2 weeks, every other day starting on feb 1 for 2
  // weeks).  Neither the server nor the UI supports this now,
  // but we really ought to!
  // struct icaltimetype icaldtstart;
  // icaldtstrat = icalproperty_get_dtstart(prop);

  if (icalrecur.count != 0)
    mIsByCount = true;
  else
    mIsByCount = false;

  mIcalRecur = icalrecur;

  return NS_OK;
}

NS_IMETHODIMP
calRecurrenceRule::SetIcalString(const nsACString& str) {
  if (mImmutable) return NS_ERROR_OBJECT_IS_IMMUTABLE;

  nsresult rv = NS_OK;
  nsAutoCString name;
  nsCOMPtr<calIICSService> icsSvc = cal::getICSService();
  nsCOMPtr<calIIcalProperty> prop;

  rv = icsSvc->CreateIcalPropertyFromString(str, getter_AddRefs(prop));
  NS_ENSURE_SUCCESS(rv, rv);

  rv = prop->GetPropertyName(name);
  NS_ENSURE_SUCCESS(rv, rv);

  if (!name.EqualsLiteral("RRULE")) {
    return NS_ERROR_ILLEGAL_VALUE;
  }

  return SetIcalProperty(prop);
}

NS_IMETHODIMP
calRecurrenceRule::GetIcalString(nsACString& str) {
  nsresult rv = NS_OK;

  nsCOMPtr<calIIcalProperty> prop;

  rv = this->GetIcalProperty(getter_AddRefs(prop));

  if (NS_SUCCEEDED(rv)) {
    rv = prop->GetIcalString(str);
  }

  return rv;
}

NS_IMETHODIMP
calRecurrenceRule::GetWeekStart(short*) { return NS_ERROR_NOT_IMPLEMENTED; }

NS_IMETHODIMP
calRecurrenceRule::SetWeekStart(short) { return NS_ERROR_NOT_IMPLEMENTED; }
