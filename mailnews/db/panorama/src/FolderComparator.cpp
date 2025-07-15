/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderComparator.h"

#include "FolderDatabase.h"
#include "mozilla/intl/Collator.h"
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

      const Collator* collator = GetCollator();
      if (!collator) {
        return false;
      }
      return collator->CompareStrings(
                 PromiseFlatString(NS_ConvertUTF8toUTF16(nameA)),
                 PromiseFlatString(NS_ConvertUTF8toUTF16(nameB))) == 0;
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
  const Collator* collator = GetCollator();
  if (!collator) {
    return false;
  }
  return collator->CompareStrings(
             PromiseFlatString(NS_ConvertUTF8toUTF16(nameA)),
             PromiseFlatString(NS_ConvertUTF8toUTF16(nameB))) < 0;
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

const Collator* FolderComparator::sCollator;

const Collator* FolderComparator::GetCollator() {
  if (sCollator) {
    return sCollator;
  }

  // Lazily initialize the Collator.
  auto result = LocaleService::TryCreateComponent<Collator>();
  if (result.isErr()) {
    NS_ERROR("couldn't create a Collator");
    return nullptr;
  }

  auto collator = result.unwrap();

  // Sort in a case-insensitive way, where "base" letters are considered
  // equal, e.g: a = á, a = A, a ≠ b.
  Collator::Options options{};
  options.sensitivity = Collator::Sensitivity::Base;
  options.numeric = true;
  auto optResult = collator->SetOptions(options);
  if (optResult.isErr()) {
    NS_ERROR("couldn't set options for Collator");
    return nullptr;
  }
  sCollator = collator.release();

  return sCollator;
}

}  // namespace mozilla::mailnews
