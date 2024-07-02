/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this file,
 * You can obtain one at http://mozilla.org/MPL/2.0/. */

export var ChatIcons = {
  /**
   * Get the icon URI for the given protocol.
   *
   * @param {prplIProtocol} protocol - The protocol to get the icon URI for.
   * @param {16|32|48} [size=16] - The width and height of the icon.
   *
   * @returns {string} - The icon's URI.
   */
  getProtocolIconURI(protocol, size = 16) {
    return `${protocol.iconBaseURI}icon${size === 16 ? "" : size}.png`;
  },

  /**
   * Sets the opacity of the given protocol icon depending on the given chat
   * status (see getStatusIconURI).
   *
   * @param {HTMLImageElement} protoIconElement - The protocol icon.
   * @param {string} statusName - The name for the chat status.
   */
  setProtocolIconOpacity(protoIconElement, statusName) {
    switch (statusName) {
      case "unknown":
      case "offline":
      case "left":
        protoIconElement.classList.add("protoIconDimmed");
        break;
      default:
        protoIconElement.classList.remove("protoIconDimmed");
    }
  },

  fallbackUserIconURI: "chrome://messenger/skin/icons/userIcon.svg",

  /**
   * Set up the user icon to show the given uri, or a fallback.
   *
   * @param {HTMLImageElement} userIconElement - An icon with the "userIcon"
   *   class.
   * @param {string|null} iconUri - The uri to set, or "" to use a fallback
   *   icon, or null to hide the icon.
   * @param {boolean} useFallback - True if the "fallback" icon should be shown
   *   if iconUri isn't provided.
   */
  setUserIconSrc(userIconElement, iconUri, useFallback) {
    if (iconUri) {
      userIconElement.setAttribute("src", iconUri);
      userIconElement.classList.remove("fillUserIcon");
    } else if (useFallback) {
      userIconElement.setAttribute("src", this.fallbackUserIconURI);
      userIconElement.classList.add("fillUserIcon");
    } else {
      userIconElement.removeAttribute("src");
      userIconElement.classList.remove("fillUserIcon");
    }
  },

  /**
   * Get the icon URI for the given chat status. Often given statusName would be
   * the return of Status.toAttribute for a given status type. But a few more
   * terms or aliases are supported.
   *
   * @param {string} statusName - The name for the chat status.
   *
   * @returns {string|null} - The icon URI for the given status, or null if none
   *   exists.
   */
  getStatusIconURI(statusName) {
    switch (statusName) {
      case "unknown":
        return "chrome://chat/skin/unknown.svg";
      case "available":
      case "connected":
        return "chrome://messenger/skin/icons/new/status-online.svg";
      case "unavailable":
      case "away":
        return "chrome://messenger/skin/icons/new/status-away.svg";
      case "offline":
      case "disconnected":
      case "invisible":
      case "left":
        return "chrome://messenger/skin/icons/new/status-offline.svg";
      case "connecting":
      case "disconnecting":
      case "joining":
        return "chrome://messenger/skin/icons/spinning.svg";
      case "idle":
        return "chrome://messenger/skin/icons/new/status-idle.svg";
      case "mobile":
        return "chrome://chat/skin/mobile.svg";
      case "chat":
        return "chrome://messenger/skin/icons/new/compact/chat.svg";
      case "chat-left":
        return "chrome://chat/skin/chat-left.svg";
      case "active-typing":
        return "chrome://chat/skin/typing.svg";
      case "paused-typing":
        return "chrome://chat/skin/typed.svg";
    }
    return null;
  },
};
