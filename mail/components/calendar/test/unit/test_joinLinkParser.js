/* -*- Mode: JavaScript; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

const { extractJoinLink } = ChromeUtils.importESModule(
  "resource:///modules/calendar/JoinLinkParser.sys.mjs"
);

const providers = {
  zoom: [
    {
      joinLink: "https://events.zoom.us/ejl/abc123",
      description: `
        You don't often get email from noreply-zoomevents@zoom.us.
        Learn why this is important<https://aka.ms/LearnAboutSenderIdentification>
        View event<https://events.zoom.us/ev/abc123>
        [https://file-paa.zoom.us/anlksdc6]
        •       Oct 5, 2024 8:45 AM - Oct 5, 2024 3:30 PM EDT
        •       Organized by me
        •       1 Ticket
        Join<https://events.zoom.us/ejl/abc123>
      `,
    },
    {
      joinLink: "https://test.zoom.us/wc/join/12345",
      description: `
        You don't often get email from noreply-zoomevents@zoom.us.
        Learn why this is important<https://aka.ms/LearnAboutSenderIdentification>
        View event<https://events.zoom.us/ev/abc123>
        [https://file-paa.zoom.us/anlksdc6]
        •       Oct 5, 2024 8:45 AM - Oct 5, 2024 3:30 PM EDT
        •       Organized by me
        •       1 Ticket
        Join<https://test.zoom.us/wc/join/12345>
      `,
    },
    {
      joinLink: "https://test.zoom.us/j/12345",
      description: `
        You don't often get email from noreply-zoomevents@zoom.us.
        Learn why this is important<https://aka.ms/LearnAboutSenderIdentification>
        View event<https://test.zoom.us/j/12345>
        [https://file-paa.zoom.us/anlksdc6]
        •       Oct 5, 2024 8:45 AM - Oct 5, 2024 3:30 PM EDT
        •       Organized by me
        •       1 Ticket
        Join<https://test.zoom.us/j/12345>
      `,
    },
  ],
  teams: [
    {
      joinLink: "https://teams.microsoft.com/l/meetup-join/19%3ameeting_Njlj",
      description: `
        Microsoft Teams Need help?<https://aka.ms/JoinTeamsMeeting?omkt=en-GB>
        Join the meeting now<https://teams.microsoft.com/l/meetup-join/19%3ameeting_Njlj>
      `,
    },
  ],
  webex: [
    {
      joinLink: "https://meetings.webex.com/collabs/meetings/join?uuid=MAZ1",
      description: `
        Hotspex's WebEx Meeting
        When it's time, join the meeting from here:
        https://meetings.webex.com/collabs/meetings/join?uuid=MAZ1
      `,
    },
  ],
  meet: [
    {
      joinLink: "https://meet.google.com/43523234",
      description: `
        Meeting from https://www.google.com
        When it's time, join the meeting from here:
        https://meet.google.com/43523234
      `,
    },
  ],
  goToMeet: [
    {
      joinLink: "https://meet.goto.com/43523234",
      description: `
        Meeting from https://www.goto.com
        When it's time, join the meeting from here:
        https://meet.goto.com/43523234
      `,
    },
  ],
  blueJeans: [
    {
      joinLink: "https://www.bluejeans.com/435abc123",
      description: `Meeting from https://www.bluejeans.com
        When it's time, join the meeting from here:
        https://www.bluejeans.com/435abc123`,
    },
  ],
  jitsi: [
    {
      joinLink: "https://meet.jit.si/435abc123",
      description: `
        Meeting from https://www.jist.si
        When it's time, join the meeting from here:
        https://meet.jit.si/435abc123
      `,
    },
  ],
  whereby: [
    {
      joinLink: "https://www.whereby.com/435abc123",
      description: `
        Meeting from https://www.whereby.com
        When it's time, join the meeting from here:
        https://www.whereby.com/435abc123
      `,
    },
  ],
  ringcentral: [
    {
      joinLink: "https://meetings.ringcentral.com/j/435",
      description: `
        Meeting from https://www.ringcentral.com
        When it's time, join the meeting from here:
        https://meetings.ringcentral.com/j/435
      `,
    },
  ],
  chime: [
    {
      joinLink: "https://chime.aws/43dscvsd5",
      description: `
        Meeting from https://www.app.chime.aws
        When it's time, join the meeting from here:
        https://chime.aws/43dscvsd5
      `,
    },
  ],
};

add_task(function test_noJoinkLink() {
  const description =
    "This is an example description with a link https://testzoom.us";
  const joinLink = extractJoinLink(description);
  Assert.equal(joinLink, null, "Should not return a join link");
});

add_task(function test_providerJoinLinks() {
  for (const [provider, dataArray] of Object.entries(providers)) {
    for (const data of dataArray) {
      const joinLink = extractJoinLink(data.description);
      Assert.equal(
        joinLink,
        data.joinLink,
        `Should return correct ${provider} link`
      );
    }
  }
});
