/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

const JOIN_LINK_PATTERNS = [
  // Zoom.
  /https?:\/\/(?:[\w.-]+\.)?zoom\.us\/j\/\d+/i,
  /https?:\/\/(?:[\w.-]+\.)?zoom\.us\/wc\/join\/\d+/i,
  /https?:\/\/events\.zoom\.us\/ejl\/[^\s<>]+/i,

  // Microsoft Teams.
  /https?:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>]+/i,

  // WebEx.
  /https?:\/\/meetings\.webex\.com\/collabs\/meetings\/join[^\s<>]*/i,

  // Google Meet.
  /https?:\/\/meet\.google\.com\/[a-z0-9-]+/i,

  // GoToMeeting.
  /https?:\/\/meet\.goto\.com\/\d+/i,

  // BlueJeans.
  /https?:\/\/(?:www\.)?bluejeans\.com\/[a-z0-9]+/i,

  // Jitsi Meet.
  /https?:\/\/meet\.jit\.si\/[A-Za-z0-9-_]+/,

  // Whereby.
  /https?:\/\/(?:www\.)?whereby\.com\/[A-Za-z0-9-_]+/i,

  // Ring Central.
  /https?:\/\/meetings\.ringcentral\.com\/j\/\d+/i,

  // Amazon Chime.
  /https?:\/\/chime\.aws\/[A-Za-z0-9]+/i,
];

/**
 * Parses a string and returns a string of a link that joins a video
 * conference on any of the apps listed in JOIN_LINK_PATTERNS. If a
 * join link can't be found, null is returned.
 *
 * @param {string} text - String that will be parsed.
 * @returns {?string} - Join video conference link string.
 */
export function extractJoinLink(text) {
  for (const pattern of JOIN_LINK_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      return match[0];
    }
  }
  return null;
}
