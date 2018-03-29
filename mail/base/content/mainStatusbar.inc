# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.

    <hbox id="statusTextBox" ondblclick="openActivityMgr();" flex="1">
      <statusbarpanel>
        <toolbarbutton id="offline-status" oncommand="MailOfflineMgr.toggleOfflineStatus();"/>
      </statusbarpanel>
      <statusbarpanel id="statusText" label="&statusText.label;" flex="1"/>
      <statusbarpanel class="statusbarpanel-progress" collapsed="true" id="statusbar-progresspanel">
        <progressmeter class="progressmeter-statusbar" id="statusbar-icon" mode="normal" value="0"/>
      </statusbarpanel>
      <statusbarpanel class="statusbarpanel-progress"
                      id="quotaPanel" hidden="true">
        <stack>
          <progressmeter class="progressmeter-statusbar"
                         id="quotaMeter"
                         mode="normal"
                         value="0" />
          <label id="quotaLabel"
                 onclick="gFolderTreeController.editFolder('QuotaTab');" />
        </stack>
      </statusbarpanel>
    </hbox>
