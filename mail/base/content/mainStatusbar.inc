# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

    <hbox id="statusTextBox" ondblclick="openActivityMgr();" flex="1">
      <statusbarpanel>
        <toolbarbutton id="offline-status" oncommand="MailOfflineMgr.toggleOfflineStatus();"/>
      </statusbarpanel>
      <statusbarpanel id="statusText" label="&statusText.label;" flex="1"/>
      <statusbarpanel class="statusbarpanel-progress" collapsed="true" id="statusbar-progresspanel">
        <html:progress class="progressmeter-statusbar" id="statusbar-icon" value="0" max="100"/>
      </statusbarpanel>
      <statusbarpanel class="statusbarpanel-progress"
                      id="quotaPanel" hidden="true">
        <stack>
          <html:progress id="quotaMeter" class="progressmeter-statusbar" value="0" max="100"/>
          <label id="quotaLabel"
                 onclick="gFolderTreeController.editFolder('QuotaTab');" />
        </stack>
      </statusbarpanel>
    </hbox>
