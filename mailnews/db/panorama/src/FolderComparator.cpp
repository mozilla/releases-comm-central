/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderComparator.h"

#include "mozilla/intl/LocaleService.h"
#include "nsMsgFolderFlags.h"

using mozilla::intl::LocaleService;

namespace mozilla::mailnews {

bool FolderComparator::Equals(const RefPtr<Folder>& a,
                              const RefPtr<Folder>& b) const {
  if (a->mOrdinal.isNothing()) {
    if (b->mOrdinal.isNothing()) {
      const Collator* collator = GetCollator();
      return collator->CompareStrings(
                 PromiseFlatString(NS_ConvertUTF8toUTF16(a->mName)),
                 PromiseFlatString(NS_ConvertUTF8toUTF16(b->mName))) == 0;
    }

    return false;
  }

  if (b->mOrdinal.isNothing()) {
    return false;
  }

  if (a->mOrdinal != b->mOrdinal) {
    return false;
  }

  return SpecialFlagsOrder(a->mFlags) == SpecialFlagsOrder(b->mFlags);
}

bool FolderComparator::LessThan(const RefPtr<Folder>& a,
                                const RefPtr<Folder>& b) const {
  if (a->mOrdinal.isSome()) {
    if (b->mOrdinal.isSome()) {
      return a->mOrdinal < b->mOrdinal;
    }
    return true;
  }

  if (b->mOrdinal.isSome()) {
    return false;
  }

  uint8_t aFlagsOrder = SpecialFlagsOrder(a->mFlags);
  uint8_t bFlagsOrder = SpecialFlagsOrder(b->mFlags);
  if (aFlagsOrder < bFlagsOrder) {
    return true;
  }
  if (aFlagsOrder > bFlagsOrder) {
    return false;
  }

  const Collator* collator = GetCollator();
  return collator->CompareStrings(
             PromiseFlatString(NS_ConvertUTF8toUTF16(a->mName)),
             PromiseFlatString(NS_ConvertUTF8toUTF16(b->mName))) < 0;
}

uint8_t FolderComparator::SpecialFlagsOrder(const uint64_t flags) const {
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
