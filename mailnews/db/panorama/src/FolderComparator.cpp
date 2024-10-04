/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#include "FolderComparator.h"

namespace mozilla {
namespace mailnews {

bool FolderComparator::Equals(const RefPtr<Folder>& aA,
                              const RefPtr<Folder>& aB) const {
  if (aA->mOrdinal.isNothing()) {
    if (aB->mOrdinal.isNothing()) {
      return aA->mName.Equals(aB->mName);
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
      return aA->mName < aB->mName;
    }

    return false;
  }

  if (aB->mOrdinal.isNothing()) {
    return true;
  }

  return aA->mOrdinal < aB->mOrdinal;
}

}  // namespace mailnews
}  // namespace mozilla
