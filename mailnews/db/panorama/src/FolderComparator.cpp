/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderComparator.h"

#include "mozilla/intl/LocaleService.h"

using mozilla::intl::LocaleService;

namespace mozilla {
namespace mailnews {

bool FolderComparator::Equals(const RefPtr<Folder>& aA,
                              const RefPtr<Folder>& aB) const {
  if (aA->mOrdinal.isNothing()) {
    if (aB->mOrdinal.isNothing()) {
      const Collator* collator = GetCollator();
      return collator->CompareStrings(
                 PromiseFlatString(NS_ConvertUTF8toUTF16(aA->mName)),
                 PromiseFlatString(NS_ConvertUTF8toUTF16(aB->mName))) == 0;
    }

    return false;
  }

  if (aB->mOrdinal.isNothing()) {
    return false;
  }

  return aA->mOrdinal == aB->mOrdinal;
}

bool FolderComparator::LessThan(const RefPtr<Folder>& aA,
                                const RefPtr<Folder>& aB) const {
  if (aA->mOrdinal.isNothing()) {
    if (aB->mOrdinal.isNothing()) {
      const Collator* collator = GetCollator();
      return collator->CompareStrings(
                 PromiseFlatString(NS_ConvertUTF8toUTF16(aA->mName)),
                 PromiseFlatString(NS_ConvertUTF8toUTF16(aB->mName))) < 0;
    }

    return false;
  }

  if (aB->mOrdinal.isNothing()) {
    return true;
  }

  return aA->mOrdinal < aB->mOrdinal;
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

}  // namespace mailnews
}  // namespace mozilla
