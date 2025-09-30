/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Get the OS-specific mechanism for setting the progress display.
 *
 * @param {mozIDOMWindowProxy} window - The window to associate with this
 *   progress display.
 */
function getTaskbarProgress(window) {
  if ("@mozilla.org/windows-taskbar;1" in Cc) {
    const winTaskbar = Cc["@mozilla.org/windows-taskbar;1"].getService(
      Ci.nsIWinTaskbar
    );
    return winTaskbar.getTaskbarProgress(window.docShell);
  }
  if ("@mozilla.org/widget/macdocksupport;1" in Cc) {
    return Cc["@mozilla.org/widget/macdocksupport;1"].getService(
      Ci.nsITaskbarProgress
    );
  }
  if ("@mozilla.org/widget/taskbarprogress/gtk;1" in Cc) {
    // Normally we'd call getService, but that will hold a reference to the
    // window until `setPrimaryWindow` is called again. Instead, create a new
    // instance every time and it'll be cleaned up by garbage collection.
    const progress = Cc[
      "@mozilla.org/widget/taskbarprogress/gtk;1"
    ].createInstance(Ci.nsIGtkTaskbarProgress);
    progress.setPrimaryWindow(window);
    return progress;
  }
  return null;
}

export const TaskbarProgress = {
  /**
   * Display the progress on the OS taskbar icon of `window`.
   * See nsITaskbarProgress.idl for more info.
   *
   * @param {mozIDOMWindowProxy} window - The window to associate with this
   *   progress display.
   * @param {nsTaskbarProgressState} state
   * @param {number} currentValue
   * @param {number} maxValue
   */
  showProgress(window, state, currentValue = 0, maxValue = 0) {
    if (!window.docShell) {
      return;
    }
    getTaskbarProgress(window)?.setProgressState(state, currentValue, maxValue);
  },
};
