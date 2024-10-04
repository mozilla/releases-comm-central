/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

#ifndef FolderComparator_h__
#define FolderComparator_h__

#include "Folder.h"
#include "mozilla/RefPtr.h"

namespace mozilla {
namespace mailnews {

class Folder;

/**
 * Compares folders for display in the right order. Folders with an ordinal in
 * the database are sorted ahead of those without. Folders without an ordinal
 * are sorted in alphabetical order.
 *
 * A future version of this class will handle special folder types (e.g. Inbox,
 * which goes ahead of ordinary folders) and non-ASCII names.
 */
class FolderComparator {
 public:
  bool Equals(const RefPtr<Folder>& aA, const RefPtr<Folder>& aB) const;
  bool LessThan(const RefPtr<Folder>& aA, const RefPtr<Folder>& aB) const;
};

}  // namespace mailnews
}  // namespace mozilla

#endif  // FolderComparator_h__
