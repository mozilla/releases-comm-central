/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderComparator.h"

#include "FolderDatabase.h"
#include "mozilla/intl/AppCollator.h"
#include "mozilla/intl/LocaleService.h"
#include "nsMsgFolderFlags.h"

using mozilla::intl::Collator;
using mozilla::intl::LocaleService;

namespace mozilla::mailnews {

bool FolderComparator::Equals(uint64_t a, uint64_t b) const {
  Maybe<uint64_t> ordA = mFolderDB.GetFolderOrdinal(a).unwrapOr(Nothing());
  Maybe<uint64_t> ordB = mFolderDB.GetFolderOrdinal(b).unwrapOr(Nothing());

  if (ordA.isNothing()) {
    if (ordB.isNothing()) {
      nsCString nameA = mFolderDB.GetFolderName(a).unwrapOr(""_ns);
      nsCString nameB = mFolderDB.GetFolderName(b).unwrapOr(""_ns);
      // FIXME: This doesn't do a numeric comparison, but it should.
      return mozilla::intl::AppCollator::CompareBase(nameA, nameB) == 0;
    }
    return false;
  }

  if (ordB.isNothing()) {
    return false;
  }

  if (ordA != ordB) {
    return false;
  }

  uint32_t flagsA = mFolderDB.GetFolderFlags(a).unwrapOr(0);
  uint32_t flagsB = mFolderDB.GetFolderFlags(b).unwrapOr(0);
  return SpecialFlagsOrder(flagsA) == SpecialFlagsOrder(flagsB);
}

bool FolderComparator::LessThan(uint64_t a, uint64_t b) const {
  Maybe<uint64_t> ordA = mFolderDB.GetFolderOrdinal(a).unwrapOr(Nothing());
  Maybe<uint64_t> ordB = mFolderDB.GetFolderOrdinal(b).unwrapOr(Nothing());
  if (ordA.isSome()) {
    if (ordB.isSome()) {
      return ordA < ordB;
    }
    return true;
  }

  if (ordB.isSome()) {
    return false;
  }

  uint32_t flagsA = mFolderDB.GetFolderFlags(a).unwrapOr(0);
  uint32_t flagsB = mFolderDB.GetFolderFlags(b).unwrapOr(0);
  uint8_t aFlagsOrder = SpecialFlagsOrder(flagsA);
  uint8_t bFlagsOrder = SpecialFlagsOrder(flagsB);
  if (aFlagsOrder < bFlagsOrder) {
    return true;
  }
  if (aFlagsOrder > bFlagsOrder) {
    return false;
  }

  nsCString nameA = mFolderDB.GetFolderName(a).unwrapOr(""_ns);
  nsCString nameB = mFolderDB.GetFolderName(b).unwrapOr(""_ns);
  // FIXME: This doesn't do a numeric comparison, but it should.
  return mozilla::intl::AppCollator::CompareBase(nameA, nameB) < 0;
}

uint8_t FolderComparator::SpecialFlagsOrder(const uint32_t flags) const {
  if (flags & nsMsgFolderFlags::Inbox) return 0;
  if (flags & nsMsgFolderFlags::Drafts) return 1;
  if (flags & nsMsgFolderFlags::Templates) return 2;
  if (flags & nsMsgFolderFlags::SentMail) return 3;
  if (flags & nsMsgFolderFlags::Archive) return 4;
  if (flags & nsMsgFolderFlags::Junk) return 5;
  if (flags & nsMsgFolderFlags::Trash) return 6;
  if (flags & nsMsgFolderFlags::Virtual) return 7;
  if (flags & nsMsgFolderFlags::Queue) return 8;
  return 9;
}

}  // namespace mozilla::mailnews
