/* Any copyright is dedicated to the Public Domain.
 * http://creativecommons.org/publicdomain/zero/1.0/ */

var { MatrixMessageContent } = ChromeUtils.importESModule(
  "resource:///modules/matrixMessageContent.sys.mjs"
);
const { XPCShellContentUtils } = ChromeUtils.importESModule(
  "resource://testing-common/XPCShellContentUtils.sys.mjs"
);
var { getMatrixTextForEvent } = ChromeUtils.importESModule(
  "resource:///modules/matrixTextForEvent.sys.mjs"
);
var l10n = new Localization(["chat/matrix-properties.ftl"], true);

// Required to make it so the DOMParser can handle images and such.
XPCShellContentUtils.init(this);

const PLAIN_FIXTURES = [
  {
    description: "Normal text message plain quote",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum
> dolor sit amet

dolor sit amet`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum!",
      },
      sender: "@foo:example.com",
    },
    result: `@foo:example.com:
&gt; lorem ipsum!

dolor sit amet`,
  },
  {
    description: "Normal text message plain quote with missing quote message",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum

dolor sit amet`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    result: `&gt; lorem ipsum

dolor sit amet`,
  },
  {
    description: "Emote message plain quote",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum

dolor sit amet`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Emote,
        body: "lorem ipsum",
      },
      sender: "@foo:example.com",
    },
    result: `&gt; * @foo:example.com lorem ipsum *

dolor sit amet`,
  },
  {
    description: "Reply is emote",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Emote,
        body: `> lorem ipsum

dolor sit amet`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum",
      },
      sender: "@foo:example.com",
    },
    result: "\ndolor sit amet",
  },
  {
    description: "Attachment",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.File,
        body: "example.png",
        url: "mxc://example.com/asdf",
      },
      sender: "@bar:example.com",
    },
    result: "https://example.com/_matrix/media/v3/download/example.com/asdf",
  },
  {
    description: "Sticker",
    event: {
      type: MatrixSDK.EventType.Sticker,
      content: {
        body: "example.png",
        url: "mxc://example.com/asdf",
      },
      sender: "@bar:example.com",
    },
    result: "https://example.com/_matrix/media/v3/download/example.com/asdf",
  },
  {
    description: "Normal body with HTML-y contents",
    event: {
      type: MatrixSDK.EventType.Text,
      content: {
        body: "<foo>",
      },
      sender: "@bar:example.com",
    },
    result: "&lt;foo&gt;",
  },
  {
    description: "Non-mxc attachment",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "hello.jpg",
        msgtype: MatrixSDK.MsgType.Image,
        url: "https://example.com/hello.jpg",
      },
      sender: "@bar:example.com",
    },
    result: "hello.jpg",
  },
  {
    description: "Key verification request",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.KeyVerificationRequest,
      },
      sender: "@bar:example.com",
    },
    isGetTextForEvent: true,
  },
  {
    description: "Decryption failure",
    event: {
      type: MatrixSDK.EventType.RoomMessageEncrypted,
      content: {
        msgtype: "m.bad.encrypted",
      },
    },
    isGetTextForEvent: true,
  },
  {
    description: "Being decrypted",
    event: {
      type: MatrixSDK.EventType.RoomMessageEncrypted,
      decrypting: true,
    },
    result: l10n.formatValueSync("message-decrypting"),
  },
  {
    description: "Unsent event",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "foo",
        msgtype: MatrixSDK.MsgType.Text,
      },
      sender: "@bar:example.com",
      status: MatrixSDK.EventStatus.NOT_SENT,
    },
    result: "",
  },
  {
    description: "Redacted event",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {},
      sender: "@bar:example.com",
      redacted: true,
    },
    result: l10n.formatValueSync("message-redacted"),
  },
  {
    description: "Tombstone",
    event: {
      type: MatrixSDK.EventType.RoomTombstone,
      content: {
        body: "tombstone",
      },
      sender: "@bar:example.com",
    },
    result: "tombstone",
  },
  {
    description: "Encryption start",
    event: {
      type: MatrixSDK.EventType.RoomEncryption,
      content: {},
      sender: "@bar:example.com",
    },
    isGetTextForEvent: true,
  },
  {
    description: "Reaction",
    event: {
      type: MatrixSDK.EventType.Reaction,
      content: {
        ["m.relates_to"]: {
          rel_type: MatrixSDK.RelationType.Annotation,
          event_id: "!event:example.com",
          key: "🐦",
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum!",
      },
      sender: "@foo:example.com",
    },
    result: l10n.formatValueSync("message-reaction", {
      userThatReacted: "@bar:example.com",
      userThatSentMessage: "@foo:example.com",
      reaction: "🐦",
    }),
  },
];

const HTML_FIXTURES = [
  {
    description: "Normal text message plain quote",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum
> dolor sit amet

dolor sit amet`,
        format: "org.matrix.custom.html",
        formatted_body: `<mx-reply>
    <a href="https://matrix.to/#/@foo:example.com">Foo</a> wrote:<br>
    <blockquote>lorem ipsum</blockquote>
</mx-reply>
<p>dolor sit amet</p>`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum!",
      },
      sender: "@foo:example.com",
    },
    result: `<span class="ib-person">@foo:example.com</span>:<blockquote>lorem ipsum!</blockquote>\n<p>dolor sit amet</p>`,
  },
  {
    description: "Normal text message with missing quote message",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum
> dolor sit amet

dolor sit amet`,
        format: "org.matrix.custom.html",
        formatted_body: `<mx-reply>
    <a href="https://matrix.to/#/@foo:example.com">Foo</a> wrote:<br>
    <blockquote>lorem ipsum</blockquote>
</mx-reply>
<p>dolor sit amet</p>`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    result: `
    <span class="ib-person">@foo:example.com</span> wrote:<br>
    <blockquote>lorem ipsum</blockquote>

<p>dolor sit amet</p>`,
  },
  {
    description: "Quoted emote message",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `> lorem ipsum

dolor sit amet`,
        format: "org.matrix.custom.html",
        formatted_body: `<mx-reply>
    <a href="https://matrix.to/#/@foo:example.com">Foo</a> wrote:<br>
    <blockquote>lorem ipsum</blockquote>
</mx-reply>
<p>dolor sit amet</p>`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Emote,
        body: "lorem ipsum",
        format: "org.matrix.custom.html",
        formatted_body: "<p>lorem ipsum</p>",
      },
      sender: "@foo:example.com",
    },
    result: `<blockquote>* @foo:example.com <p>lorem ipsum</p> *</blockquote>
<p>dolor sit amet</p>`,
  },
  {
    description: "Reply is emote",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Emote,
        body: `> lorem ipsum

dolor sit amet`,
        format: "org.matrix.custom.html",
        formatted_body: `<mx-reply>
    <a href="https://matrix.to/#/@foo:example.com">Foo</a> wrote:<br>
    <blockquote>lorem ipsum</blockquote>
</mx-reply>
<p>dolor sit amet</p>`,
        ["m.relates_to"]: {
          "m.in_reply_to": {
            event_id: "!event:example.com",
          },
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum",
      },
      sender: "@foo:example.com",
    },
    result: "\n<p>dolor sit amet</p>",
  },
  {
    description: "Attachment",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.File,
        body: "example.png",
        url: "mxc://example.com/asdf",
      },
      sender: "@bar:example.com",
    },
    result:
      '<a href="https://example.com/_matrix/media/v3/download/example.com/asdf">example.png</a>',
  },
  {
    description: "Sticker",
    event: {
      type: MatrixSDK.EventType.Sticker,
      content: {
        body: "example.png",
        url: "mxc://example.com/asdf",
      },
      sender: "@bar:example.com",
    },
    result:
      '<a href="https://example.com/_matrix/media/v3/download/example.com/asdf">example.png</a>',
  },
  {
    description: "Normal formatted body",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "foo bar",
        msgtype: MatrixSDK.MsgType.Text,
        format: "org.matrix.custom.html",
        formatted_body: "<p>foo bar</p>",
      },
      sender: "@bar:example.com",
    },
    result: "<p>foo bar</p>",
  },
  {
    description: "Inline image",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: ":emote:",
        msgtype: MatrixSDK.MsgType.Text,
        format: "org.matrix.custom.html",
        formatted_body: '<img alt=":emote:" src="mxc://example.com/emote">',
      },
      sender: "@bar:example.com",
    },
    result:
      '<a href="https://example.com/_matrix/media/v3/download/example.com/emote">:emote:</a>',
  },
  {
    description: "Non-mxc attachment",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "foo.png",
        msgtype: MatrixSDK.MsgType.Image,
        url: "https://example.com/image.png",
      },
      sender: "@bar:example.com",
    },
    result: "foo.png",
  },
  {
    description: "Fallback to normal body",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "hello world <!>",
        msgtype: MatrixSDK.MsgType.Notice,
      },
      sender: "@bar:example.com",
    },
    result: "hello world &lt;!&gt;",
  },
  {
    description: "Colored text",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "rainbow",
        msgtype: MatrixSDK.MsgType.Text,
        format: "org.matrix.custom.html",
        formatted_body:
          '<font data-mx-color="ff0000">ra</font><span data-mx-color="00ff00">inb</span><i data-mx-color="0000ff">ow</i>',
      },
      sender: "@bar:example.com",
    },
    result:
      '<font style="color: rgb(255, 0, 0);">ra</font><span style="color: rgb(0, 255, 0);">inb</span><i data-mx-color="0000ff">ow</i>',
  },
  {
    description: "Unsent event",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        body: "foo",
        msgtype: MatrixSDK.MsgType.Text,
      },
      sender: "@bar:example.com",
      status: MatrixSDK.EventStatus.NOT_SENT,
    },
    result: "",
  },
  {
    description: "Redacted event",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {},
      sender: "@bar:example.com",
      redacted: true,
    },
    result: l10n.formatValueSync("message-redacted"),
  },
  {
    description: "Tombstone",
    event: {
      type: MatrixSDK.EventType.RoomTombstone,
      content: {
        body: "tombstone",
      },
      sender: "@bar:example.com",
    },
    result: "tombstone",
  },
  {
    description: "Encryption start",
    event: {
      type: MatrixSDK.EventType.RoomEncryption,
      content: {},
      sender: "@bar:example.com",
    },
    isGetTextForEvent: true,
  },
  {
    description: "Reaction",
    event: {
      type: MatrixSDK.EventType.Reaction,
      content: {
        ["m.relates_to"]: {
          rel_type: MatrixSDK.RelationType.Annotation,
          event_id: "!event:example.com",
          key: "🐦",
        },
      },
      sender: "@bar:example.com",
    },
    getEventResult: {
      id: "!event:example.com",
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: "lorem ipsum!",
      },
      sender: "@foo:example.com",
    },
    result: l10n.formatValueSync("message-reaction", {
      userThatReacted: '<span class="ib-person">@bar:example.com</span>',
      userThatSentMessage: '<span class="ib-person">@foo:example.com</span>',
      reaction: "🐦",
    }),
  },
  {
    description: "URL encoded mention",
    event: {
      type: MatrixSDK.EventType.RoomMessage,
      content: {
        msgtype: MatrixSDK.MsgType.Text,
        body: `@foo:example.com dolor sit amet`,
        format: "org.matrix.custom.html",
        formatted_body: `<a href="https://matrix.to/#/%40foo%3Aexample.com">Foo</a> dolor sit amet`,
      },
      sender: "@bar:example.com",
    },
    result: '<span class="ib-person">@foo:example.com</span> dolor sit amet',
  },
];

add_task(function test_plainBody() {
  for (const fixture of PLAIN_FIXTURES) {
    const event = makeEvent(fixture.event);
    const result = MatrixMessageContent.getIncomingPlain(
      event,
      "https://example.com",
      eventId => {
        if (fixture.getEventResult) {
          equal(
            eventId,
            fixture.getEventResult.id,
            `${fixture.description}: getEvent event ID`
          );
          return makeEvent(fixture.getEventResult);
        }
        return undefined;
      }
    );
    if (fixture.isGetTextForEvent) {
      equal(result, getMatrixTextForEvent(event));
    } else {
      equal(result, fixture.result, fixture.description);
    }
  }
});

add_task(function test_htmlBody() {
  for (const fixture of HTML_FIXTURES) {
    const event = makeEvent(fixture.event);
    const result = MatrixMessageContent.getIncomingHTML(
      event,
      "https://example.com",
      eventId => {
        if (fixture.getEventResult) {
          equal(
            eventId,
            fixture.getEventResult.id,
            `${fixture.description}: getEvent event ID`
          );
          return makeEvent(fixture.getEventResult);
        }
        return undefined;
      }
    );
    if (fixture.isGetTextForEvent) {
      equal(result, getMatrixTextForEvent(event));
    } else {
      equal(result, fixture.result, fixture.description);
    }
  }
});
