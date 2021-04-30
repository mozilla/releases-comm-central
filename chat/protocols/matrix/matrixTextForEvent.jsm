/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

this.EXPORTED_SYMBOLS = ["getMatrixTextForEvent"];

var { XPCOMUtils, l10nHelper } = ChromeUtils.import(
  "resource:///modules/imXPCOMUtils.jsm"
);
var { EventType } = ChromeUtils.import("resource:///modules/matrix-sdk.jsm");

XPCOMUtils.defineLazyGetter(this, "_", () =>
  l10nHelper("chrome://chat/locale/matrix.properties")
);

ChromeUtils.defineModuleGetter(
  this,
  "MatrixPowerLevels",
  "resource:///modules/matrixPowerLevels.jsm"
);

/**
 * Functions returning notices to display when matrix events are received.
 * Top level key is the matrix event type.
 *
 * If the object then has a "pivot" key, the value of that key is used to get
 * the value of the key with that name from the event content. This value from
 * event content picks the handler from handlers.
 *
 * If there is no pivot, the method on the key "handler" is called.
 *
 * Handlers are called with the following arguments:
 * - matrixEvent: MatrixEvent
 * - context: {
 *     sender: user ID of the sender,
 *     content: event content object,
 *   }
 * A handler is expected to return a string that is displayed as notice. If
 * nothing is returned, no notice will be shown. The formatContext function
 * optionally adds values to the context argument for the handler.
 */
const MATRIX_EVENT_HANDLERS = {
  [EventType.RoomMember]: {
    pivot: "membership",
    formatContext(matrixEvent, { sender, content }) {
      return {
        sender,
        content,
        target: matrixEvent.target,
        prevContent: matrixEvent.getPrevContent(),
        reason: content.reason ? _("message.reason", content.reason) : "",
      };
    },
    handlers: {
      ban(matrixEvent, { sender, target, reason }) {
        return _("message.banned", sender, target.userId) + reason;
      },
      invite(matrixEvent, { sender, content, target }) {
        const thirdPartyInvite = content.third_party_invite;
        if (thirdPartyInvite) {
          if (thirdPartyInvite.display_name) {
            return _(
              "message.acceptedInviteFor",
              target.userId,
              thirdPartyInvite.display_name
            );
          }
          return _("message.acceptedInvite", target.userId);
        }
        return _("message.invited", sender, target.userId);
      },
      join(matrixEvent, { sender, content, prevContent, target }) {
        if (prevContent && prevContent.membership == "join") {
          if (
            prevContent.displayname &&
            content.displayname &&
            prevContent.displayname != content.displayname
          ) {
            return _(
              "message.displayName.changed",
              sender,
              prevContent.displayname,
              content.displayname
            );
          } else if (!prevContent.displayname && content.displayname) {
            return _("message.displayName.set", sender, content.displayname);
          } else if (prevContent.displayname && !content.displayname) {
            return _(
              "message.displayName.remove",
              sender,
              prevContent.displayname
            );
          }
          return null;
        }
        return _("message.joined", target.userId);
      },
      leave(matrixEvent, { sender, prevContent, target, reason }) {
        // kick and unban just change the membership to "leave".
        // So we need to look at each transition to what happened to the user.
        if (matrixEvent.getSender() === target.userId) {
          if (prevContent.membership === "invite") {
            return _("message.rejectedInvite", target.userId);
          }
          return _("message.left", target.userId);
        } else if (prevContent.membership === "ban") {
          return _("message.unbanned", sender, target.userId);
        } else if (prevContent.membership === "join") {
          return _("message.kicked", sender, target.userId) + reason;
        } else if (prevContent.membership === "invite") {
          return _("message.withdrewInvite", sender, target.userId) + reason;
        }
        // ignore rest of the cases.
        return null;
      },
    },
  },
  [EventType.RoomPowerLevels]: {
    handler(matrixEvent, { sender, content }) {
      const prevContent = matrixEvent.getPrevContent();
      if (!prevContent?.users) {
        return null;
      }
      const userDefault = content.users_default || MatrixPowerLevels.user;
      const prevDefault = prevContent.users_default || MatrixPowerLevels.user;
      // Construct set of userIds.
      let users = new Set(
        Object.keys(content.users).concat(Object.keys(prevContent.users))
      );
      const changes = Array.from(users)
        .map(userId => {
          const prevPowerLevel = prevContent.users[userId] ?? prevDefault;
          const currentPowerLevel = content.users[userId] ?? userDefault;
          if (prevPowerLevel !== currentPowerLevel) {
            // Handling the case where there are multiple changes.
            // Example : "@Mr.B:matrix.org changed the power level of
            // @Mr.B:matrix.org from Default (0) to Moderator (50)."
            return _(
              "message.powerLevel.fromTo",
              userId,
              MatrixPowerLevels.toText(prevPowerLevel, prevDefault),
              MatrixPowerLevels.toText(currentPowerLevel, userDefault)
            );
          }
          return null;
        })
        .filter(change => Boolean(change));
      // Since the power levels event also contains role power levels, not
      // every event update will affect user power levels.
      if (!changes.length) {
        return null;
      }
      return _("message.powerLevel.changed", sender, changes.join(", "));
    },
  },
  [EventType.RoomName]: {
    handler(matrixEvent, { sender, content }) {
      let roomName = content.name;
      if (!roomName) {
        return _("message.roomName.remove", sender);
      }
      return _("message.roomName.changed", sender, roomName);
    },
  },
  [EventType.RoomGuestAccess]: {
    pivot: "guest_access",
    handlers: {
      forbidden(matrixEvent, { sender }) {
        return _("message.guest.prevented", sender);
      },
      can_join(matrixEvent, { sender }) {
        return _("message.guest.allowed", sender);
      },
    },
  },
  [EventType.RoomHistoryVisibility]: {
    pivot: "history_visibility",
    handlers: {
      world_readable(matrixEvent, { sender }) {
        return _("message.history.anyone", sender);
      },
      shared(matrixEvent, { sender }) {
        return _("message.history.shared", sender);
      },
      invited(matrixEvent, { sender }) {
        return _("message.history.invited", sender);
      },
      joined(matrixEvent, { sender }) {
        return _("message.history.joined", sender);
      },
    },
  },
  [EventType.RoomCanonicalAlias]: {
    handler(matrixEvent, { sender, content }) {
      const prevContent = matrixEvent.getPrevContent();
      if (content.alias != prevContent.alias) {
        return _(
          "message.alias.main",
          sender,
          prevContent.alias,
          content.alias
        );
      }
      const prevAliases = prevContent.alt_aliases || [];
      const aliases = content.alt_aliases || [];
      const addedAliases = aliases
        .filter(alias => !prevAliases.includes(alias))
        .join(", ");
      const removedAliases = prevAliases
        .filter(alias => !aliases.includes(alias))
        .join(", ");
      if (addedAliases && removedAliases) {
        return _(
          "message.alias.removedAndAdded",
          sender,
          removedAliases,
          addedAliases
        );
      } else if (removedAliases) {
        return _("message.alias.removed", sender, removedAliases);
      } else if (addedAliases) {
        return _("message.alias.added", sender, addedAliases);
      }
      // No discernible changes to aliases
      return null;
    },
  },

  // TODO : Events to be handled:
  // 'm.call.invite'
  // 'm.call.answer'
  // 'm.call.hangup'
  // 'm.room.third_party_invite'
  // 'm.room.encryption'

  // NOTE : No need to add string messages for 'm.room.topic' events,
  // as setTopic is used which handles the messages too.
};

/**
 * Generates a notice string for a matrix event. May return null if no notice
 * should be shown.
 *
 * @param {MatrixEvent} matrixEvent - Matrix event to generate a notice for.
 * @returns {string?} Text to display as notice for the given event.
 */
function getMatrixTextForEvent(matrixEvent) {
  const context = {
    sender: matrixEvent.getSender(),
    content: matrixEvent.getContent(),
  };
  const eventHandlingInformation = MATRIX_EVENT_HANDLERS[matrixEvent.getType()];
  if (!eventHandlingInformation) {
    return null;
  }
  const details =
    eventHandlingInformation.formatContext?.(matrixEvent, context) ?? context;
  if (eventHandlingInformation.pivot) {
    const pivotValue = context.content[eventHandlingInformation.pivot];
    return (
      eventHandlingInformation.handlers[pivotValue]?.(matrixEvent, details) ??
      null
    );
  }
  return eventHandlingInformation.handler(matrixEvent, details);
}
