/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

var { IMServices } = ChromeUtils.importESModule(
  "resource:///modules/IMServices.sys.mjs"
);
var { ChatIcons } = ChromeUtils.importESModule(
  "resource:///modules/chatIcons.sys.mjs"
);

var autoJoinPref = "autoJoin";

var joinChat = {
  onload() {
    var accountList = document.getElementById("accountlist");
    for (const acc of IMServices.accounts.getAccounts()) {
      if (!acc.connected || !acc.canJoinChat) {
        continue;
      }
      var proto = acc.protocol;
      var item = accountList.appendItem(acc.name, acc.id, proto.name);
      item.setAttribute("image", ChatIcons.getProtocolIconURI(proto));
      item.setAttribute("class", "menuitem-iconic");
      item.account = acc;
    }
    if (!accountList.itemCount) {
      document
        .getElementById("joinChatDialog")
        .querySelector("dialog")
        .cancelDialog();
      throw new Error("No connected MUC enabled account!");
    }
    accountList.selectedIndex = 0;
  },

  onAccountSelect() {
    const joinChatGrid = document.getElementById("joinChatGrid");
    while (joinChatGrid.children.length > 3) {
      // leave the first 3 cols
      joinChatGrid.lastChild.remove();
    }

    const acc = document.getElementById("accountlist").selectedItem.account;
    const defaultValues = acc.getChatRoomDefaultFieldValues();
    joinChat._values = defaultValues;
    joinChat._fields = [];
    joinChat._account = acc;

    const protoId = acc.protocol.id;
    document.getElementById("autojoin").hidden = !(
      protoId == "prpl-irc" ||
      protoId == "prpl-jabber" ||
      protoId == "prpl-gtalk"
    );

    for (const field of acc.getChatRoomFields()) {
      const div1 = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      const label = document.createXULElement("label");
      let text = field.label;
      const match = /_(.)/.exec(text);
      if (match) {
        label.setAttribute("accesskey", match[1]);
        text = text.replace(/_/, "");
      }
      label.setAttribute("value", text);
      label.setAttribute("control", "field-" + field.identifier);
      label.setAttribute("id", "field-" + field.identifier + "-label");
      div1.appendChild(label);
      joinChatGrid.appendChild(div1);

      const div2 = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "div"
      );
      const input = document.createElementNS(
        "http://www.w3.org/1999/xhtml",
        "input"
      );
      input.classList.add("input-inline");
      input.setAttribute("id", "field-" + field.identifier);
      input.setAttribute(
        "aria-labelledby",
        "field-" + field.identifier + "-label"
      );
      const val = defaultValues.getValue(field.identifier);
      if (val) {
        input.setAttribute("value", val);
      }
      if (field.type == Ci.prplIChatRoomField.TYPE_PASSWORD) {
        input.setAttribute("type", "password");
      } else if (field.type == Ci.prplIChatRoomField.TYPE_INT) {
        input.setAttribute("type", "number");
        input.setAttribute("min", field.min);
        input.setAttribute("max", field.max);
      } else {
        input.setAttribute("type", "text");
      }
      div2.appendChild(input);
      joinChatGrid.appendChild(div2);

      const div3 = document.querySelector(".optional-col").cloneNode(true);
      div3.classList.toggle("required", field.required);
      joinChatGrid.appendChild(div3);

      joinChat._fields.push({ field, input });
    }

    window.sizeToContent();
  },

  join() {
    const values = joinChat._values;
    for (const field of joinChat._fields) {
      const val = field.input.value.trim();
      if (!val && field.field.required) {
        field.input.focus();
        // FIXME: why isn't the return false enough?
        throw new Error("Some required fields are empty!");
        // return false;
      }
      if (val) {
        values.setValue(field.field.identifier, val);
      }
    }
    const account = joinChat._account;
    account.joinChat(values);

    const protoId = account.protocol.id;
    if (
      protoId != "prpl-irc" &&
      protoId != "prpl-jabber" &&
      protoId != "prpl-gtalk"
    ) {
      return;
    }

    let name;
    if (protoId == "prpl-irc") {
      name = values.getValue("channel");
    } else {
      name = values.getValue("room") + "@" + values.getValue("server");
    }

    const conv = IMServices.conversations.getConversationByNameAndAccount(
      name,
      account,
      true
    );
    if (conv) {
      const mailWindow = Services.wm.getMostRecentWindow("mail:3pane");
      if (mailWindow) {
        mailWindow.focus();
        const tabmail = mailWindow.document.getElementById("tabmail");
        tabmail.openTab("chat", { convType: "focus", conv });
      }
    }

    if (document.getElementById("autojoin").checked) {
      // "nick" for JS-XMPP, "handle" for libpurple prpls.
      const nick = values.getValue("nick") || values.getValue("handle");
      if (nick) {
        name += "/" + nick;
      }

      const prefBranch = Services.prefs.getBranch(
        "messenger.account." + account.id + "."
      );
      let autojoin = [];
      if (prefBranch.prefHasUserValue(autoJoinPref)) {
        const prefValue = prefBranch.getStringPref(autoJoinPref);
        if (prefValue) {
          autojoin = prefValue.split(",");
        }
      }

      if (!autojoin.includes(name)) {
        autojoin.push(name);
        prefBranch.setStringPref(autoJoinPref, autojoin.join(","));
      }
    }
  },
};

document.addEventListener("dialogaccept", joinChat.join);

window.addEventListener("DOMContentLoaded", () => {
  joinChat.onload();
});
window.addEventListener("load", () => {
  window.sizeToContent();
});
