/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

const { MailServices } = ChromeUtils.importESModule(
  "resource:///modules/MailServices.sys.mjs"
);

/**
 * Class responsible for the the UI reorder of the folders after the backend
 * operation has been completed.
 */
export class FolderReorderListener {
  /**
   * The EventTarget class used to dispatch the event when the copy operation
   * has ended. We use this because we can't make this class a child class of
   * EventTarget as it needs to be a pure instance of nsIMsgCopyServiceListener.
   *
   * @type {EventTarget}
   */
  target;

  constructor(sourceFolder, targetFolder, insertAfter) {
    this.sourceFolder = sourceFolder;
    this.targetFolder = targetFolder;
    this.insertAfter = insertAfter;

    this.target = new EventTarget();
  }

  /**
   * Partial implementation of the nsIMsgCopyServiceListener interface, as we
   * only care about the onStopCopy().
   *
   * @implements {nsIMsgCopyServiceListener}
   */
  onStopCopy() {
    // Do reorder within new siblings (all children of new parent).
    const movedFolder = MailServices.copy.getArrivedFolder(this.sourceFolder);
    if (!movedFolder) {
      return;
    }
    this.target.dispatchEvent(
      new CustomEvent("insert-folder", {
        detail: {
          movedFolder,
          targetFolder: this.targetFolder,
          insertAfter: this.insertAfter,
        },
      })
    );
  }
}
