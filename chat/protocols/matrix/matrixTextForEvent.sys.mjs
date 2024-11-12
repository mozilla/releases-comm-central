/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { MatrixSDK } from "resource:///modules/matrix-sdk.sys.mjs";

const lazy = {};

ChromeUtils.defineLazyGetter(
  lazy,
  "l10n",
  () => new Localization(["chat/matrix-properties.ftl"], true)
);

ChromeUtils.defineESModuleGetters(lazy, {
  MatrixPowerLevels: "resource:///modules/matrixPowerLevels.sys.mjs",
});

/**
 * Shared handler for verification requests. We need it twice because the
 * request can be the msgtype of a normal message or its own event.
 *
 * @param {MatrixEvent} matrixEvent - Matrix Event this is handling.
 * @param {{sender: string, content: object}} param1 - handler context.
 * @returns {string}
 */
const keyVerificationRequest = (matrixEvent, { sender, content }) => {
  return lazy.l10n.formatValueSync("message-verification-request2", {
    user: sender,
    userReceiving: content.to || "",
  });
};
/**
 * Shared handler for room messages, since those come in the plain text and
 * encrypted form.
 */
const roomMessage = {
  pivot: "msgtype",
  handlers: {
    [MatrixSDK.MsgType.KeyVerificationRequest]: keyVerificationRequest,
    "m.bad.encrypted": () =>
      lazy.l10n.formatValueSync("message-decryption-error"),
  },
};

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
  [MatrixSDK.EventType.RoomMember]: {
    pivot: "membership",
    formatContext(matrixEvent, { sender, content }) {
      return {
        sender,
        content,
        target: matrixEvent.target,
        prevContent: matrixEvent.getPrevContent(),
        reason: content.reason,
        withReasonKey: content.reason ? "-with-reason" : "",
      };
    },
    handlers: {
      ban(matrixEvent, { sender, target, reason, withReasonKey }) {
        return lazy.l10n.formatValueSync(`message-banned${withReasonKey}`, {
          user: sender,
          userBanned: target.userId,
          reason,
        });
      },
      invite(matrixEvent, { sender, content, target }) {
        const thirdPartyInvite = content.third_party_invite;
        if (thirdPartyInvite) {
          if (thirdPartyInvite.display_name) {
            return lazy.l10n.formatValueSync("message-accepted-invite-for", {
              user: target.userId,
              userWhoSent: thirdPartyInvite.display_name,
            });
          }
          return lazy.l10n.formatValueSync("message-accepted-invite", {
            user: target.userId,
          });
        }
        return lazy.l10n.formatValueSync("message-invited", {
          user: sender,
          userWhoGotInvited: target.userId,
        });
      },
      join(matrixEvent, { sender, content, prevContent, target }) {
        if (
          prevContent &&
          prevContent.membership == MatrixSDK.KnownMembership.Join
        ) {
          if (
            prevContent.displayname &&
            content.displayname &&
            prevContent.displayname != content.displayname
          ) {
            return lazy.l10n.formatValueSync("message-display-name-changed", {
              user: sender,
              oldDisplayName: prevContent.displayname,
              newDisplayName: content.displayname,
            });
          } else if (!prevContent.displayname && content.displayname) {
            return lazy.l10n.formatValueSync("message-display-name-set", {
              user: sender,
              changedName: content.displayname,
            });
          } else if (prevContent.displayname && !content.displayname) {
            return lazy.l10n.formatValueSync("message-display-name-remove", {
              user: sender,
              nameRemoved: prevContent.displayname,
            });
          }
          return null;
        }
        return lazy.l10n.formatValueSync("message-joined", {
          user: target.userId,
        });
      },
      leave(
        matrixEvent,
        { sender, prevContent, target, reason, withReasonKey }
      ) {
        // kick and unban just change the membership to "leave".
        // So we need to look at each transition to what happened to the user.
        if (matrixEvent.getSender() === target.userId) {
          if (prevContent.membership === MatrixSDK.KnownMembership.Invite) {
            return lazy.l10n.formatValueSync("message-rejected-invite", {
              user: target.userId,
            });
          }
          return lazy.l10n.formatValueSync("message-left", {
            user: target.userId,
          });
        } else if (prevContent.membership === MatrixSDK.KnownMembership.Ban) {
          return lazy.l10n.formatValueSync("message-unbanned", {
            user: sender,
            userUnbanned: target.userId,
          });
        } else if (prevContent.membership === MatrixSDK.KnownMembership.Join) {
          return lazy.l10n.formatValueSync(`message-kicked${withReasonKey}`, {
            user: sender,
            userGotKicked: target.userId,
            reason,
          });
        } else if (
          prevContent.membership === MatrixSDK.KnownMembership.Invite
        ) {
          return lazy.l10n.formatValueSync(
            `message-withdrew-invite${withReasonKey}`,
            {
              user: sender,
              userInvitationWithdrawn: target.userId,
              reason,
            }
          );
        }
        // ignore rest of the cases.
        return null;
      },
    },
  },
  [MatrixSDK.EventType.RoomPowerLevels]: {
    handler(matrixEvent, { sender, content }) {
      const prevContent = matrixEvent.getPrevContent();
      if (!prevContent?.users) {
        return null;
      }
      const userDefault = content.users_default || lazy.MatrixPowerLevels.user;
      const prevDefault =
        prevContent.users_default || lazy.MatrixPowerLevels.user;
      // Construct set of userIds.
      const users = new Set(
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
            return lazy.l10n.formatValueSync("message-power-level-from-to", {
              user: userId,
              oldPowerLevel: lazy.MatrixPowerLevels.toText(
                prevPowerLevel,
                prevDefault
              ),
              newPowerLevel: lazy.MatrixPowerLevels.toText(
                currentPowerLevel,
                userDefault
              ),
            });
          }
          return null;
        })
        .filter(change => Boolean(change));
      // Since the power levels event also contains role power levels, not
      // every event update will affect user power levels.
      if (!changes.length) {
        return null;
      }
      return lazy.l10n.formatValueSync("message-power-level-changed", {
        user: sender,
        powerLevelChanges: changes.join(", "),
      });
    },
  },
  [MatrixSDK.EventType.RoomName]: {
    handler(matrixEvent, { sender, content }) {
      const roomName = content.name;
      if (!roomName) {
        return lazy.l10n.formatValueSync("message-room-name-remove", {
          user: sender,
        });
      }
      return lazy.l10n.formatValueSync("message-room-name-changed", {
        user: sender,
        newRoomName: roomName,
      });
    },
  },
  [MatrixSDK.EventType.RoomGuestAccess]: {
    pivot: "guest_access",
    handlers: {
      [MatrixSDK.GuestAccess.Forbidden](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-guest-prevented", {
          user: sender,
        });
      },
      [MatrixSDK.GuestAccess.CanJoin](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-guest-allowed", {
          user: sender,
        });
      },
    },
  },
  [MatrixSDK.EventType.RoomHistoryVisibility]: {
    pivot: "history_visibility",
    handlers: {
      [MatrixSDK.HistoryVisibility.WorldReadable](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-history-anyone", {
          user: sender,
        });
      },
      [MatrixSDK.HistoryVisibility.Shared](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-history-shared", {
          user: sender,
        });
      },
      [MatrixSDK.HistoryVisibility.Invited](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-history-invited", {
          user: sender,
        });
      },
      [MatrixSDK.HistoryVisibility.Joined](matrixEvent, { sender }) {
        return lazy.l10n.formatValueSync("message-history-joined", {
          user: sender,
        });
      },
    },
  },
  [MatrixSDK.EventType.RoomCanonicalAlias]: {
    handler(matrixEvent, { sender, content }) {
      const prevContent = matrixEvent.getPrevContent();
      if (content.alias != prevContent.alias) {
        return lazy.l10n.formatValueSync("message-alias-main", {
          user: sender,
          oldAddress: prevContent.alias || "",
          newAddress: content.alias,
        });
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
        return lazy.l10n.formatValueSync("message-alias-removed-and-added", {
          user: sender,
          removedAddresses: removedAliases,
          addedAddresses: addedAliases,
        });
      } else if (removedAliases) {
        return lazy.l10n.formatValueSync("message-alias-removed", {
          user: sender,
          addresses: removedAliases,
        });
      } else if (addedAliases) {
        return lazy.l10n.formatValueSync("message-alias-added", {
          user: sender,
          addresses: addedAliases,
        });
      }
      // No discernible changes to aliases
      return null;
    },
  },

  [MatrixSDK.EventType.RoomMessage]: roomMessage,
  [MatrixSDK.EventType.RoomMessageEncrypted]: roomMessage,
  [MatrixSDK.EventType.KeyVerificationRequest]: {
    handler: keyVerificationRequest,
  },
  [MatrixSDK.EventType.KeyVerificationCancel]: {
    handler(matrixEvent, { sender, content }) {
      return lazy.l10n.formatValueSync("message-verification-cancel2", {
        user: sender,
        reason: content.reason,
      });
    },
  },
  [MatrixSDK.EventType.KeyVerificationDone]: {
    handler() {
      return lazy.l10n.formatValueSync("message-verification-done");
    },
  },
  [MatrixSDK.EventType.RoomEncryption]: {
    handler() {
      return lazy.l10n.formatValueSync("message-encryption-start");
    },
  },

  // TODO : Events to be handled:
  // 'm.call.invite'
  // 'm.call.answer'
  // 'm.call.hangup'
  // 'm.room.third_party_invite'

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
export function getMatrixTextForEvent(matrixEvent) {
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
