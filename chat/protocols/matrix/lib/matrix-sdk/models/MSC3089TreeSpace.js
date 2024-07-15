"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.TreePermissions = exports.MSC3089TreeSpace = exports.DEFAULT_TREE_POWER_LEVELS_TEMPLATE = void 0;
var _pRetry = _interopRequireDefault(require("p-retry"));
var _event = require("../@types/event");
var _logger = require("../logger");
var _utils = require("../utils");
var _MSC3089Branch = require("./MSC3089Branch");
var _megolm = require("../crypto/algorithms/megolm");
var _membership = require("../@types/membership");
function _interopRequireDefault(e) { return e && e.__esModule ? e : { default: e }; }
function ownKeys(e, r) { var t = Object.keys(e); if (Object.getOwnPropertySymbols) { var o = Object.getOwnPropertySymbols(e); r && (o = o.filter(function (r) { return Object.getOwnPropertyDescriptor(e, r).enumerable; })), t.push.apply(t, o); } return t; }
function _objectSpread(e) { for (var r = 1; r < arguments.length; r++) { var t = null != arguments[r] ? arguments[r] : {}; r % 2 ? ownKeys(Object(t), !0).forEach(function (r) { _defineProperty(e, r, t[r]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(e, Object.getOwnPropertyDescriptors(t)) : ownKeys(Object(t)).forEach(function (r) { Object.defineProperty(e, r, Object.getOwnPropertyDescriptor(t, r)); }); } return e; }
function _defineProperty(e, r, t) { return (r = _toPropertyKey(r)) in e ? Object.defineProperty(e, r, { value: t, enumerable: !0, configurable: !0, writable: !0 }) : e[r] = t, e; }
function _toPropertyKey(t) { var i = _toPrimitive(t, "string"); return "symbol" == typeof i ? i : i + ""; }
function _toPrimitive(t, r) { if ("object" != typeof t || !t) return t; var e = t[Symbol.toPrimitive]; if (void 0 !== e) { var i = e.call(t, r || "default"); if ("object" != typeof i) return i; throw new TypeError("@@toPrimitive must return a primitive value."); } return ("string" === r ? String : Number)(t); } /*
Copyright 2021 The Matrix.org Foundation C.I.C.

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/
/**
 * The recommended defaults for a tree space's power levels. Note that this
 * is UNSTABLE and subject to breaking changes without notice.
 */
const DEFAULT_TREE_POWER_LEVELS_TEMPLATE = exports.DEFAULT_TREE_POWER_LEVELS_TEMPLATE = {
  // Owner
  invite: 100,
  kick: 100,
  ban: 100,
  // Editor
  redact: 50,
  state_default: 50,
  events_default: 50,
  // Viewer
  users_default: 0,
  // Mixed
  events: {
    [_event.EventType.RoomPowerLevels]: 100,
    [_event.EventType.RoomHistoryVisibility]: 100,
    [_event.EventType.RoomTombstone]: 100,
    [_event.EventType.RoomEncryption]: 100,
    [_event.EventType.RoomName]: 50,
    [_event.EventType.RoomMessage]: 50,
    [_event.EventType.RoomMessageEncrypted]: 50,
    [_event.EventType.Sticker]: 50
  },
  users: {} // defined by calling code
};

/**
 * Ease-of-use representation for power levels represented as simple roles.
 * Note that this is UNSTABLE and subject to breaking changes without notice.
 */
let TreePermissions = exports.TreePermissions = /*#__PURE__*/function (TreePermissions) {
  TreePermissions["Viewer"] = "viewer";
  TreePermissions["Editor"] = "editor";
  TreePermissions["Owner"] = "owner";
  return TreePermissions;
}({}); // "Admin" or PL100
/**
 * Represents a [MSC3089](https://github.com/matrix-org/matrix-doc/pull/3089)
 * file tree Space. Note that this is UNSTABLE and subject to breaking changes
 * without notice.
 */
class MSC3089TreeSpace {
  constructor(client, roomId) {
    this.client = client;
    this.roomId = roomId;
    _defineProperty(this, "room", void 0);
    this.room = this.client.getRoom(this.roomId);
    if (!this.room) throw new Error("Unknown room");
  }

  /**
   * Syntactic sugar for room ID of the Space.
   */
  get id() {
    return this.roomId;
  }

  /**
   * Whether or not this is a top level space.
   */
  get isTopLevel() {
    // XXX: This is absolutely not how you find out if the space is top level
    // but is safe for a managed usecase like we offer in the SDK.
    const parentEvents = this.room.currentState.getStateEvents(_event.EventType.SpaceParent);
    if (!parentEvents?.length) return true;
    return parentEvents.every(e => !e.getContent()?.["via"]);
  }

  /**
   * Sets the name of the tree space.
   * @param name - The new name for the space.
   * @returns Promise which resolves when complete.
   */
  async setName(name) {
    await this.client.sendStateEvent(this.roomId, _event.EventType.RoomName, {
      name
    }, "");
  }

  /**
   * Invites a user to the tree space. They will be given the default Viewer
   * permission level unless specified elsewhere.
   * @param userId - The user ID to invite.
   * @param andSubspaces - True (default) to invite the user to all
   * directories/subspaces too, recursively.
   * @param shareHistoryKeys - True (default) to share encryption keys
   * with the invited user. This will allow them to decrypt the events (files)
   * in the tree. Keys will not be shared if the room is lacking appropriate
   * history visibility (by default, history visibility is "shared" in trees,
   * which is an appropriate visibility for these purposes).
   * @returns Promise which resolves when complete.
   */
  async invite(userId, andSubspaces = true, shareHistoryKeys = true) {
    const promises = [this.retryInvite(userId)];
    if (andSubspaces) {
      promises.push(...this.getDirectories().map(d => d.invite(userId, andSubspaces, shareHistoryKeys)));
    }
    return Promise.all(promises).then(() => {
      // Note: key sharing is default on because for file trees it is relatively important that the invite
      // target can actually decrypt the files. The implied use case is that by inviting a user to the tree
      // it means the sender would like the receiver to view/download the files contained within, much like
      // sharing a folder in other circles.
      if (shareHistoryKeys && (0, _megolm.isRoomSharedHistory)(this.room)) {
        // noinspection JSIgnoredPromiseFromCall - we aren't concerned as much if this fails.
        this.client.sendSharedHistoryKeys(this.roomId, [userId]);
      }
    });
  }
  retryInvite(userId) {
    return (0, _utils.simpleRetryOperation)(async () => {
      await this.client.invite(this.roomId, userId).catch(e => {
        // We don't want to retry permission errors forever...
        if (e?.errcode === "M_FORBIDDEN") {
          throw new _pRetry.default.AbortError(e);
        }
        throw e;
      });
    });
  }

  /**
   * Sets the permissions of a user to the given role. Note that if setting a user
   * to Owner then they will NOT be able to be demoted. If the user does not have
   * permission to change the power level of the target, an error will be thrown.
   * @param userId - The user ID to change the role of.
   * @param role - The role to assign.
   * @returns Promise which resolves when complete.
   */
  async setPermissions(userId, role) {
    const currentPls = this.room.currentState.getStateEvents(_event.EventType.RoomPowerLevels, "");
    if (Array.isArray(currentPls)) throw new Error("Unexpected return type for power levels");
    const pls = currentPls?.getContent() || {};
    const viewLevel = pls["users_default"] || 0;
    const editLevel = pls["events_default"] || 50;
    const adminLevel = pls["events"]?.[_event.EventType.RoomPowerLevels] || 100;
    const users = pls["users"] || {};
    switch (role) {
      case TreePermissions.Viewer:
        users[userId] = viewLevel;
        break;
      case TreePermissions.Editor:
        users[userId] = editLevel;
        break;
      case TreePermissions.Owner:
        users[userId] = adminLevel;
        break;
      default:
        throw new Error("Invalid role: " + role);
    }
    pls["users"] = users;
    await this.client.sendStateEvent(this.roomId, _event.EventType.RoomPowerLevels, pls, "");
  }

  /**
   * Gets the current permissions of a user. Note that any users missing explicit permissions (or not
   * in the space) will be considered Viewers. Appropriate membership checks need to be performed
   * elsewhere.
   * @param userId - The user ID to check permissions of.
   * @returns The permissions for the user, defaulting to Viewer.
   */
  getPermissions(userId) {
    const currentPls = this.room.currentState.getStateEvents(_event.EventType.RoomPowerLevels, "");
    if (Array.isArray(currentPls)) throw new Error("Unexpected return type for power levels");
    const pls = currentPls?.getContent() || {};
    const viewLevel = pls["users_default"] || 0;
    const editLevel = pls["events_default"] || 50;
    const adminLevel = pls["events"]?.[_event.EventType.RoomPowerLevels] || 100;
    const userLevel = pls["users"]?.[userId] || viewLevel;
    if (userLevel >= adminLevel) return TreePermissions.Owner;
    if (userLevel >= editLevel) return TreePermissions.Editor;
    return TreePermissions.Viewer;
  }

  /**
   * Creates a directory under this tree space, represented as another tree space.
   * @param name - The name for the directory.
   * @returns Promise which resolves to the created directory.
   */
  async createDirectory(name) {
    const directory = await this.client.unstableCreateFileTree(name);
    await this.client.sendStateEvent(this.roomId, _event.EventType.SpaceChild, {
      via: [this.client.getDomain()]
    }, directory.roomId);
    await this.client.sendStateEvent(directory.roomId, _event.EventType.SpaceParent, {
      via: [this.client.getDomain()]
    }, this.roomId);
    return directory;
  }

  /**
   * Gets a list of all known immediate subdirectories to this tree space.
   * @returns The tree spaces (directories). May be empty, but not null.
   */
  getDirectories() {
    const trees = [];
    const children = this.room.currentState.getStateEvents(_event.EventType.SpaceChild);
    for (const child of children) {
      try {
        const stateKey = child.getStateKey();
        if (stateKey) {
          const tree = this.client.unstableGetFileTreeSpace(stateKey);
          if (tree) trees.push(tree);
        }
      } catch (e) {
        _logger.logger.warn("Unable to create tree space instance for listing. Are we joined?", e);
      }
    }
    return trees;
  }

  /**
   * Gets a subdirectory of a given ID under this tree space. Note that this will not recurse
   * into children and instead only look one level deep.
   * @param roomId - The room ID (directory ID) to find.
   * @returns The directory, or undefined if not found.
   */
  getDirectory(roomId) {
    return this.getDirectories().find(r => r.roomId === roomId);
  }

  /**
   * Deletes the tree, kicking all members and deleting **all subdirectories**.
   * @returns Promise which resolves when complete.
   */
  async delete() {
    const subdirectories = this.getDirectories();
    for (const dir of subdirectories) {
      await dir.delete();
    }
    const kickMemberships = [_membership.KnownMembership.Invite, _membership.KnownMembership.Knock, _membership.KnownMembership.Join];
    const members = this.room.currentState.getStateEvents(_event.EventType.RoomMember);
    for (const member of members) {
      const isNotUs = member.getStateKey() !== this.client.getUserId();
      if (isNotUs && kickMemberships.includes(member.getContent().membership)) {
        const stateKey = member.getStateKey();
        if (!stateKey) {
          throw new Error("State key not found for branch");
        }
        await this.client.kick(this.roomId, stateKey, "Room deleted");
      }
    }
    await this.client.leave(this.roomId);
  }
  getOrderedChildren(children) {
    const ordered = children.map(c => ({
      roomId: c.getStateKey(),
      order: c.getContent()["order"]
    })).filter(c => c.roomId);
    ordered.sort((a, b) => {
      if (a.order && !b.order) {
        return -1;
      } else if (!a.order && b.order) {
        return 1;
      } else if (!a.order && !b.order) {
        const roomA = this.client.getRoom(a.roomId);
        const roomB = this.client.getRoom(b.roomId);
        if (!roomA || !roomB) {
          // just don't bother trying to do more partial sorting
          return (0, _utils.lexicographicCompare)(a.roomId, b.roomId);
        }
        const createTsA = roomA.currentState.getStateEvents(_event.EventType.RoomCreate, "")?.getTs() ?? 0;
        const createTsB = roomB.currentState.getStateEvents(_event.EventType.RoomCreate, "")?.getTs() ?? 0;
        if (createTsA === createTsB) {
          return (0, _utils.lexicographicCompare)(a.roomId, b.roomId);
        }
        return createTsA - createTsB;
      } else {
        // both not-null orders
        return (0, _utils.lexicographicCompare)(a.order, b.order);
      }
    });
    return ordered;
  }
  getParentRoom() {
    const parents = this.room.currentState.getStateEvents(_event.EventType.SpaceParent);
    const parent = parents[0]; // XXX: Wild assumption
    if (!parent) throw new Error("Expected to have a parent in a non-top level space");

    // XXX: We are assuming the parent is a valid tree space.
    // We probably don't need to validate the parent room state for this usecase though.
    const stateKey = parent.getStateKey();
    if (!stateKey) throw new Error("No state key found for parent");
    const parentRoom = this.client.getRoom(stateKey);
    if (!parentRoom) throw new Error("Unable to locate room for parent");
    return parentRoom;
  }

  /**
   * Gets the current order index for this directory. Note that if this is the top level space
   * then -1 will be returned.
   * @returns The order index of this space.
   */
  getOrder() {
    if (this.isTopLevel) return -1;
    const parentRoom = this.getParentRoom();
    const children = parentRoom.currentState.getStateEvents(_event.EventType.SpaceChild);
    const ordered = this.getOrderedChildren(children);
    return ordered.findIndex(c => c.roomId === this.roomId);
  }

  /**
   * Sets the order index for this directory within its parent. Note that if this is a top level
   * space then an error will be thrown. -1 can be used to move the child to the start, and numbers
   * larger than the number of children can be used to move the child to the end.
   * @param index - The new order index for this space.
   * @returns Promise which resolves when complete.
   * @throws Throws if this is a top level space.
   */
  async setOrder(index) {
    if (this.isTopLevel) throw new Error("Cannot set order of top level spaces currently");
    const parentRoom = this.getParentRoom();
    const children = parentRoom.currentState.getStateEvents(_event.EventType.SpaceChild);
    const ordered = this.getOrderedChildren(children);
    index = Math.max(Math.min(index, ordered.length - 1), 0);
    const currentIndex = this.getOrder();
    const movingUp = currentIndex < index;
    if (movingUp && index === ordered.length - 1) {
      index--;
    } else if (!movingUp && index === 0) {
      index++;
    }
    const prev = ordered[movingUp ? index : index - 1];
    const next = ordered[movingUp ? index + 1 : index];
    let newOrder = _utils.DEFAULT_ALPHABET[0];
    let ensureBeforeIsSane = false;
    if (!prev) {
      // Move to front
      if (next?.order) {
        newOrder = (0, _utils.prevString)(next.order);
      }
    } else if (index === ordered.length - 1) {
      // Move to back
      if (next?.order) {
        newOrder = (0, _utils.nextString)(next.order);
      }
    } else {
      // Move somewhere in the middle
      const startOrder = prev?.order;
      const endOrder = next?.order;
      if (startOrder && endOrder) {
        if (startOrder === endOrder) {
          // Error case: just move +1 to break out of awful math
          newOrder = (0, _utils.nextString)(startOrder);
        } else {
          newOrder = (0, _utils.averageBetweenStrings)(startOrder, endOrder);
        }
      } else {
        if (startOrder) {
          // We're at the end (endOrder is null, so no explicit order)
          newOrder = (0, _utils.nextString)(startOrder);
        } else if (endOrder) {
          // We're at the start (startOrder is null, so nothing before us)
          newOrder = (0, _utils.prevString)(endOrder);
        } else {
          // Both points are unknown. We're likely in a range where all the children
          // don't have particular order values, so we may need to update them too.
          // The other possibility is there's only us as a child, but we should have
          // shown up in the other states.
          ensureBeforeIsSane = true;
        }
      }
    }
    if (ensureBeforeIsSane) {
      // We were asked by the order algorithm to prepare the moving space for a landing
      // in the undefined order part of the order array, which means we need to update the
      // spaces that come before it with a stable order value.
      let lastOrder;
      for (let i = 0; i <= index; i++) {
        const target = ordered[i];
        if (i === 0) {
          lastOrder = target.order;
        }
        if (!target.order) {
          // XXX: We should be creating gaps to avoid conflicts
          lastOrder = lastOrder ? (0, _utils.nextString)(lastOrder) : _utils.DEFAULT_ALPHABET[0];
          const currentChild = parentRoom.currentState.getStateEvents(_event.EventType.SpaceChild, target.roomId);
          const content = currentChild?.getContent() ?? {
            via: [this.client.getDomain()]
          };
          await this.client.sendStateEvent(parentRoom.roomId, _event.EventType.SpaceChild, _objectSpread(_objectSpread({}, content), {}, {
            order: lastOrder
          }), target.roomId);
        } else {
          lastOrder = target.order;
        }
      }
      if (lastOrder) {
        newOrder = (0, _utils.nextString)(lastOrder);
      }
    }

    // TODO: Deal with order conflicts by reordering

    // Now we can finally update our own order state
    const currentChild = parentRoom.currentState.getStateEvents(_event.EventType.SpaceChild, this.roomId);
    const content = currentChild?.getContent() ?? {
      via: [this.client.getDomain()]
    };
    await this.client.sendStateEvent(parentRoom.roomId, _event.EventType.SpaceChild, _objectSpread(_objectSpread({}, content), {}, {
      // TODO: Safely constrain to 50 character limit required by spaces.
      order: newOrder
    }), this.roomId);
  }

  /**
   * Creates (uploads) a new file to this tree. The file must have already been encrypted for the room.
   * The file contents are in a type that is compatible with MatrixClient.uploadContent().
   * @param name - The name of the file.
   * @param encryptedContents - The encrypted contents.
   * @param info - The encrypted file information.
   * @param additionalContent - Optional event content fields to include in the message.
   * @returns Promise which resolves to the file event's sent response.
   */
  async createFile(name, encryptedContents, info, additionalContent) {
    const {
      content_uri: mxc
    } = await this.client.uploadContent(encryptedContents, {
      includeFilename: false
    });
    info.url = mxc;
    const fileContent = {
      msgtype: _event.MsgType.File,
      body: name,
      url: mxc,
      file: info
    };
    additionalContent = additionalContent ?? {};
    if (additionalContent["m.new_content"]) {
      // We do the right thing according to the spec, but due to how relations are
      // handled we also end up duplicating this information to the regular `content`
      // as well.
      additionalContent["m.new_content"] = fileContent;
    }
    const res = await this.client.sendMessage(this.roomId, _objectSpread(_objectSpread(_objectSpread({}, additionalContent), fileContent), {}, {
      [_event.UNSTABLE_MSC3089_LEAF.name]: {}
    }));
    await this.client.sendStateEvent(this.roomId, _event.UNSTABLE_MSC3089_BRANCH.name, {
      active: true,
      name: name
    }, res["event_id"]);
    return res;
  }

  /**
   * Retrieves a file from the tree.
   * @param fileEventId - The event ID of the file.
   * @returns The file, or null if not found.
   */
  getFile(fileEventId) {
    const branch = this.room.currentState.getStateEvents(_event.UNSTABLE_MSC3089_BRANCH.name, fileEventId);
    return branch ? new _MSC3089Branch.MSC3089Branch(this.client, branch, this) : null;
  }

  /**
   * Gets an array of all known files for the tree.
   * @returns The known files. May be empty, but not null.
   */
  listFiles() {
    return this.listAllFiles().filter(b => b.isActive);
  }

  /**
   * Gets an array of all known files for the tree, including inactive/invalid ones.
   * @returns The known files. May be empty, but not null.
   */
  listAllFiles() {
    const branches = this.room.currentState.getStateEvents(_event.UNSTABLE_MSC3089_BRANCH.name) ?? [];
    return branches.map(e => new _MSC3089Branch.MSC3089Branch(this.client, e, this));
  }
}
exports.MSC3089TreeSpace = MSC3089TreeSpace;