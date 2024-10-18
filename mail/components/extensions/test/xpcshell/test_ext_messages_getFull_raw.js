/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, you can obtain one at http://mozilla.org/MPL/2.0/. */

"use strict";

var { FileUtils } = ChromeUtils.importESModule(
  "resource://gre/modules/FileUtils.sys.mjs"
);
var { ExtensionTestUtils } = ChromeUtils.importESModule(
  "resource://testing-common/ExtensionXPCShellUtils.sys.mjs"
);

/**
 * Test requesting raw headers and content.
 */
add_task(async function test_encoding() {
  const _account = createAccount();
  const _folder = await createSubfolder(
    _account.incomingServer.rootFolder,
    "test1"
  );

  // Main body with disposition inline, base64 encoded,
  // subject is UTF-8 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample01.eml").path
  );
  // A multipart/mixed mime message, to header is iso-8859-1 encoded word,
  // body is quoted printable with iso-8859-1, attachments with different names
  // and filenames.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample02.eml").path
  );
  // Message with attachment only, From header is iso-8859-1 encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample03.eml").path
  );
  // Message with koi8-r + base64 encoded body, subject is koi8-r encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample04.eml").path
  );
  // Message with windows-1251 + base64 encoded body, subject is windows-1251
  // encoded word.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample05.eml").path
  );
  // Message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample06.eml").path
  );
  // A multipart/alternative message without plain/text content-type.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample07.eml").path
  );
  // A multipart/related message with an embedded image.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/sample08.eml").path
  );
  // A message with utf-8 encoded from and to header, which have an encoded comma
  // and should be quoted after RFC2047 decoding.
  await createMessageFromFile(
    _folder,
    do_get_file("messages/utf8MailboxStrings.eml").path
  );
  await createMessageFromFile(
    _folder,
    do_get_file("messages/attachedMessageWithMissingHeaders.eml").path
  );

  const extension = ExtensionTestUtils.loadExtension({
    files: {
      "background.js": async () => {
        const accounts = await browser.accounts.list();
        browser.test.assertEq(1, accounts.length);
        const account = accounts[0];
        const folder = account.folders.find(f => f.name == "test1");
        const { messages } = await browser.messages.list(folder.id);
        browser.test.assertEq(10, messages.length);

        const expectedData = {
          "01.eml@mime.sample": {
            decoded: {
              subject: ["αλφάβητο"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                from: ["Bug Reporter <new@thunderbird.bug>"],
                newsgroups: ["gmane.comp.mozilla.thundebird.user"],
                subject: ["=?UTF-8?B?zrHOu8+GzqzOss63z4TOvw==?="],
                date: ["Thu, 27 May 2021 21:23:35 +0100"],
                "message-id": ["<01.eml@mime.sample>"],
                "mime-version": ["1.0"],
              },
              parts: [
                {
                  contentType: "text/plain",
                  partName: "1",
                  rawBody: "zobOu8+GzrEK\r\n",
                  rawHeaders: {
                    "content-type": ["text/plain; charset=utf-8;"],
                    "content-transfer-encoding": ["base64"],
                    "content-disposition": ["inline"],
                  },
                },
              ],
            },
          },
          "02.eml@mime.sample": {
            decoded: {
              to: ["Heinz Müller <mueller@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                to: ["=?iso-8859-1?Q?Heinz_M=FCller?= <mueller@example.com>"],
                subject: ["Test message from Microsoft Outlook 00"],
                "message-id": ["<02.eml@mime.sample>"],
                "mime-version": ["1.0"],
                "x-priority": ["3 (Normal)"],
              },
              parts: [
                {
                  contentType: "multipart/mixed",
                  partName: "1",
                  rawBody: "",
                  rawHeaders: {
                    "content-type": [
                      'multipart/mixed;\r\n\tboundary="----=_NextPart_000_0002_01BFC036.AE309650"',
                    ],
                  },
                  parts: [
                    {
                      contentType: "text/plain",
                      partName: "1.1",
                      rawBody: "\r\nDie Hasen und die Fr=F6sche=20\r\n=20\r\n",
                      rawHeaders: {
                        "content-type": [
                          'text/plain;\r\n\tcharset="iso-8859-1"',
                        ],
                        "content-transfer-encoding": ["quoted-printable"],
                      },
                    },
                    {
                      contentType: "image/png",
                      partName: "1.2",
                      rawBody:
                        "iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAMAAAC6CgRnAAADAFBMVEX///8AAAgAABAAABgAAAAA\r\nCCkAEEIAEEoACDEAEFIIIXMIKXsIKYQIIWsAGFoACDkIIWMQOZwYQqUYQq0YQrUQOaUQMZQAGFIQ\r\nMYwpUrU5Y8Y5Y84pWs4YSs4YQs4YQr1Ca8Z7nNacvd6Mtd5jlOcxa94hUt4YStYYQsYQMaUAACHO\r\n5+/n7++cxu9ShO8pWucQOa1Ke86tzt6lzu9ajO8QMZxahNat1ufO7++Mve9Ke+8YOaUYSsaMvee1\r\n5++Uve8AAClajOdzpe9rnO8IKYwxY+8pWu8IIXsAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAADBMg1VAAAAAXRSTlMAQObYZgAAABZ0RVh0U29mdHdhcmUAZ2lmMnBuZyAyLjAu\r\nMT1evmgAAAGISURBVHicddJtV5swGAbgEk6AJhBSk4bMCUynBSLaqovbrG/bfPn/vyh70lbssceb\r\nL5xznTsh5BmNhgQoRChwo50EOIohUYLDj4zHhKYQkrEoQdvock4ne0IKMVUpKZLQDeqSTIsv+18P\r\nyqqWUw2IBsRM7307PPp+fDJrWtnpLDJvewYxnewfnvanZ+fzpmwXijC8KbqEa3Fx2ff91Y95U9XC\r\nUpaDeQwiMpHXP/v+1++bWVPWQoGFawtjury9vru/f/C1Vi7ezT0WWpQHf/7+u/G71aLThK/MjRxm\r\nT6KdzZ9fGk9yatMsTgZLl3XVgFRAC6spj/13enssqJVtWVa3NdBSacL8+VZmYqKmdd1CSYoOiMOS\r\nGwtzlqqlFFIuOqv0a1ZEZrUkWICLLFW266y1KvWE1zV/iDAH1EopnVLCiygZCIomH3NCKX0lnI+B\r\n1iuuzCGTxwXjnDO4d7NpbX42YJJHkBwmAm2TxwAZg40J3+Xtbv1rgOAZwG0NxW62p+lT+Yi747sD\r\n/wEUVMzYmWkOvwAAACV0RVh0Q29tbWVudABjbGlwMmdpZiB2LjAuNiBieSBZdmVzIFBpZ3VldDZz\r\nO7wAAAAASUVORK5CYII=\r\n",
                      rawHeaders: {
                        "content-type": [
                          'image/png;\r\n\tname="blueball1.png"',
                        ],
                        "content-transfer-encoding": ["base64"],
                        "content-disposition": [
                          'attachment;\r\n\tfilename="blueball2.png"',
                        ],
                      },
                      name: "blueball2.png",
                    },
                    {
                      contentType: "image/png",
                      partName: "1.3",
                      rawBody:
                        "iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAMAAAC6CgRnAAADAFBMVEX///8AAAAAEAAAGAAAIQAA\r\nCAAAMQAAQgAAUgAAWgAASgAIYwAIcwAIewAQjAAIawAAOQAAYwAQlAAQnAAhpQAQpQAhrQBCvRhj\r\nxjFjxjlSxiEpzgAYvQAQrQAYrQAhvQCU1mOt1nuE1lJK3hgh1gAYxgAYtQAAKQBCzhDO55Te563G\r\n55SU52NS5yEh3gAYzgBS3iGc52vW75y974yE71JC7xCt73ul3nNa7ykh5wAY1gAx5wBS7yFr7zlK\r\n7xgp5wAp7wAx7wAIhAAQtQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAp1fnZAAAAAXRSTlMAQObYZgAAABZ0RVh0U29mdHdhcmUAZ2lmMnBuZyAyLjAu\r\nMT1evmgAAAFtSURBVHicddJtV8IgFAdwD2zIgMEE1+NcqdsoK+m5tCyz7/+ZiLmHsyzvq53zO/cy\r\n+N9ery1bVe9PWQA9z4MQ+H8Yoj7GASZ95IHfaBGmLOSchyIgyOu22mgQSjUcDuNYcoGjLiLK1cHh\r\n0fHJaTKKOcMItgYxT89OzsfjyTTLC8UF0c2ZNmKquJhczq6ub+YmSVUYRF59GeDastu7+9nD41Nm\r\nkiJ2jc2J3kAWZ9Pr55fH18XSmRuKUTXUaqHy7O19tfr4NFle/w3YDrWRUIlZrL/W86XJkyJVG9Ea\r\nEjIx2XyZmZJGioeUaL+2AY8TY8omR6nkLKhu70zjUKVJXsp3quS2DVSJWNh3zzJKCyexI0ZxBP3a\r\nfE0ElyqOlZJyw8r3BE2SFiJCyxA434SCkg65RhdeQBljQtCg39LWrA90RDDG1EWrYUO23hMANUKR\r\nRl61E529cR++D2G5LK002dr/qrcfu9u0V3bxn/XdhR/NYeeN0ggsLAAAACV0RVh0Q29tbWVudABj\r\nbGlwMmdpZiB2LjAuNiBieSBZdmVzIFBpZ3VldDZzO7wAAAAASUVORK5CYII=\r\n",
                      rawHeaders: {
                        "content-type": [
                          'image/png;\r\n\tname="greenball.png"',
                        ],
                        "content-transfer-encoding": ["base64"],
                        "content-disposition": ["attachment"],
                      },
                      name: "greenball.png",
                    },
                    {
                      contentType: "image/png",
                      partName: "1.4",
                      rawBody:
                        "iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAMAAAC6CgRnAAADAFBMVEX///8AAAABAAALAAAVAAAa\r\nAAAXAAARAAAKAAADAAAcAAAyAABEAABNAABIAAA9AAAjAAAWAAAmAABhAAB7AACGAACHAAB9AAB0\r\nAABgAAA5AAAUAAAGAAAnAABLAABvAACQAAClAAC7AAC/AACrAAChAACMAABzAABbAAAuAAAIAABM\r\nAAB3AACZAAC0GRnKODjVPT3bKSndBQW4AACoAAB5AAAxAAAYAAAEAABFAACaAAC7JCTRYWHfhITm\r\nf3/mVlbqHx/SAAC5AACjAABdAABCAAAoAAAJAABnAAC6Dw/QVFTek5PlrKzpmZntZWXvJSXXAADB\r\nAACxAACcAABtAABTAAA2AAAbAAAFAABKAACBAADLICDdZ2fonJzrpqbtiorvUVHvFBTRAADDAAC2\r\nAAB4AABeAABAAAAiAABXAACSAADCAADaGxvoVVXseHjveHjvV1fvJibhAADOAAC3AACnAACVAABH\r\nAAArAAAPAACdAADFAADhBQXrKCjvPDzvNTXvGxvjAADQAADJAAC1AACXAACEAABsAABPAAASAAAC\r\nAABiAADpAADvAgLnAADYAADLAAC6AACwAABwAAATAAAkAABYAADIAADTAADNAACzAACDAABuAAAe\r\nAAB+AADAAACkAACNAAB/AABpAABQAAAwAACRAACpAAC8AACqAACbAABlAABJAAAqAAAOAAA0AACs\r\nAACvAACtAACmAACJAAB6AABrAABaAAA+AAApAABqAACCAACfAACeAACWAACPAAB8AAAZAAAHAABV\r\nAACOAACKAAA4AAAQAAA/AAByAACAAABcAAA3AAAsAABmAABDAABWAAAgAAAzAAA8AAA6AAAfAAAM\r\nAAAdAAANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAD8LtlFAAAAAXRSTlMAQObYZgAAABZ0RVh0U29mdHdhcmUAZ2lmMnBuZyAyLjAu\r\nMT1evmgAAAIISURBVHicY2CAg/8QwIABmJhZWFnZ2Dk4MaU5uLh5eHn5+LkFBDlQJf8zC/EIi4iK\r\niUtI8koJScsgyf5nlpWTV1BUUlZRVVPX4NFk1UJIyghp6+jq6RsYGhmbKJgK85mZW8Dk/rNaSlhZ\r\n29ja2Ts4Ojkr6Li4urFDNf53N/Ow8vTy9vH18w8IDAoWDQkNC4+ASP5ni4wKio6JjYtPSExKTnFW\r\nSE1LF4A69n9GZlZ2Tm5efkFhUXFySWlZlEd5RSVY7j+TkGRVdU1tXX1DY1Ozcktpa1t7h2YnOAj+\r\nd7l1tyo79vT29SdNSJ44SbFVdHIo9xSIHNPUaWqTpifNSJrZnK00S0U1a/acUG5piNz/uXLzVJ2q\r\nm6dXz584S2WB1cJFi5cshZr539xVftnyFKUVTi2TVjqvyhJLXb1m7TqoHPt6F/HW0g0bN63crGqV\r\ntWXrtu07BJihcsw71+zanRW8Z89eq337RQ/Ip60xO3gIElX/LbikDm8T36KwbNmRo7O3zpHkPSZw\r\nHBqL//8flz1x2OOkyKJTi7aqbzutfUZI2gIuF8F2lr/D5dw2+fZdwpl8YVOlI+CJ4/9/joOyYed5\r\nQzMvhGqnm2V0WiClm///D0lfXHtJ6vLlK9w7rx7vQk5SQJbFtSms1y9evXid7QZacgOxmSxktNzd\r\ntSwwU+J/VICaCPFIYU3XAJhIOtjf5sfyAAAAJXRFWHRDb21tZW50AGNsaXAyZ2lmIHYuMC42IGJ5\r\nIFl2ZXMgUGlndWV0NnM7vAAAAABJRU5ErkJggg==\r\n",
                      rawHeaders: {
                        "content-type": ["image/png"],
                        "content-transfer-encoding": ["base64"],
                        "content-disposition": [
                          'attachment;\r\n\tfilename="redball.png"',
                        ],
                      },
                      name: "redball.png",
                    },
                  ],
                },
              ],
            },
          },
          "03.eml@mime.sample": {
            decoded: {
              to: ["Joe Blow <jblow@example.com>"],
              subject: ["Test message from Microsoft Outlook 00"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                from: ["=?iso-8859-1?Q?Heinz_M=FCller?= <mueller@example.com>"],
                to: ['"Joe Blow" <jblow@example.com>'],
                subject: ["Test message from Microsoft Outlook 00"],
                date: ["Wed, 17 May 2000 19:35:05 -0400"],
                "message-id": ["<03.eml@mime.sample>"],
                "mime-version": ["1.0"],
                "x-priority": ["3 (Normal)"],
              },
              parts: [
                {
                  contentType: "image/png",
                  partName: "1",
                  rawBody:
                    "iVBORw0KGgoAAAANSUhEUgAAABsAAAAbCAMAAAC6CgRnAAADAFBMVEX///8AAAABAAALAAAVAAAa\r\nAAAXAAARAAAKAAADAAAcAAAyAABEAABNAABIAAA9AAAjAAAWAAAmAABhAAB7AACGAACHAAB9AAB0\r\nAABgAAA5AAAUAAAGAAAnAABLAABvAACQAAClAAC7AAC/AACrAAChAACMAABzAABbAAAuAAAIAABM\r\nAAB3AACZAAC0GRnKODjVPT3bKSndBQW4AACoAAB5AAAxAAAYAAAEAABFAACaAAC7JCTRYWHfhITm\r\nf3/mVlbqHx/SAAC5AACjAABdAABCAAAoAAAJAABnAAC6Dw/QVFTek5PlrKzpmZntZWXvJSXXAADB\r\nAACxAACcAABtAABTAAA2AAAbAAAFAABKAACBAADLICDdZ2fonJzrpqbtiorvUVHvFBTRAADDAAC2\r\nAAB4AABeAABAAAAiAABXAACSAADCAADaGxvoVVXseHjveHjvV1fvJibhAADOAAC3AACnAACVAABH\r\nAAArAAAPAACdAADFAADhBQXrKCjvPDzvNTXvGxvjAADQAADJAAC1AACXAACEAABsAABPAAASAAAC\r\nAABiAADpAADvAgLnAADYAADLAAC6AACwAABwAAATAAAkAABYAADIAADTAADNAACzAACDAABuAAAe\r\nAAB+AADAAACkAACNAAB/AABpAABQAAAwAACRAACpAAC8AACqAACbAABlAABJAAAqAAAOAAA0AACs\r\nAACvAACtAACmAACJAAB6AABrAABaAAA+AAApAABqAACCAACfAACeAACWAACPAAB8AAAZAAAHAABV\r\nAACOAACKAAA4AAAQAAA/AAByAACAAABcAAA3AAAsAABmAABDAABWAAAgAAAzAAA8AAA6AAAfAAAM\r\nAAAdAAANAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA\r\nAAAAAAAAAAAAAAD8LtlFAAAAAXRSTlMAQObYZgAAABZ0RVh0U29mdHdhcmUAZ2lmMnBuZyAyLjAu\r\nMT1evmgAAAIISURBVHicY2CAg/8QwIABmJhZWFnZ2Dk4MaU5uLh5eHn5+LkFBDlQJf8zC/EIi4iK\r\niUtI8koJScsgyf5nlpWTV1BUUlZRVVPX4NFk1UJIyghp6+jq6RsYGhmbKJgK85mZW8Dk/rNaSlhZ\r\n29ja2Ts4Ojkr6Li4urFDNf53N/Ow8vTy9vH18w8IDAoWDQkNC4+ASP5ni4wKio6JjYtPSExKTnFW\r\nSE1LF4A69n9GZlZ2Tm5efkFhUXFySWlZlEd5RSVY7j+TkGRVdU1tXX1DY1Ozcktpa1t7h2YnOAj+\r\nd7l1tyo79vT29SdNSJ44SbFVdHIo9xSIHNPUaWqTpifNSJrZnK00S0U1a/acUG5piNz/uXLzVJ2q\r\nm6dXz584S2WB1cJFi5cshZr539xVftnyFKUVTi2TVjqvyhJLXb1m7TqoHPt6F/HW0g0bN63crGqV\r\ntWXrtu07BJihcsw71+zanRW8Z89eq337RQ/Ip60xO3gIElX/LbikDm8T36KwbNmRo7O3zpHkPSZw\r\nHBqL//8flz1x2OOkyKJTi7aqbzutfUZI2gIuF8F2lr/D5dw2+fZdwpl8YVOlI+CJ4/9/joOyYed5\r\nQzMvhGqnm2V0WiClm///D0lfXHtJ6vLlK9w7rx7vQk5SQJbFtSms1y9evXid7QZacgOxmSxktNzd\r\ntSwwU+J/VICaCPFIYU3XAJhIOtjf5sfyAAAAJXRFWHRDb21tZW50AGNsaXAyZ2lmIHYuMC42IGJ5\r\nIFl2ZXMgUGlndWV0NnM7vAAAAABJRU5ErkJggg==\r\n",
                  rawHeaders: {
                    "content-type": [
                      'image/png;\r\n\tname="doubelspace  ball.png"',
                    ],
                    "content-transfer-encoding": ["base64"],
                    "content-disposition": [
                      'attachment;\r\n\tfilename="doubelspace  ball.png"',
                    ],
                  },
                  name: "doubelspace  ball.png",
                },
              ],
            },
          },
          "04.eml@mime.sample": {
            decoded: {
              subject: ["Алфавит"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                newsgroups: ["gmane.comp.mozilla.thundebird.user"],
                from: ["Bug Reporter <new@thunderbird.bug>"],
                subject: ["=?koi8-r?B?4czGwdfJ1Ao=?="],
                date: ["Sun, 27 May 2001 21:23:35 +0100"],
                "mime-version": ["1.0"],
                "message-id": ["<04.eml@mime.sample>"],
              },
              parts: [
                {
                  contentType: "text/plain",
                  partName: "1",
                  rawBody: "98/Q0s/TCg==\r\n",
                  rawHeaders: {
                    "content-type": ["text/plain; charset=koi8-r;"],
                    "content-transfer-encoding": ["base64"],
                  },
                },
              ],
            },
          },
          "05.eml@mime.sample": {
            decoded: {
              subject: ["Алфавит"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                newsgroups: ["gmane.comp.mozilla.thundebird.user"],
                from: ["Bug Reporter <new@thunderbird.bug>"],
                subject: ["=?windows-1251?B?wOv04OLo8go=?="],
                date: ["Sun, 27 May 2001 21:23:35 +0100"],
                "mime-version": ["1.0"],
                "message-id": ["<05.eml@mime.sample>"],
              },
              parts: [
                {
                  contentType: "text/plain",
                  partName: "1",
                  rawBody: "wu7v8O7xCg==\r\n",
                  rawHeaders: {
                    "content-type": ["text/plain; charset=windows-1251;"],
                    "content-transfer-encoding": ["base64"],
                  },
                },
              ],
            },
          },
          "06.eml@mime.sample": {
            decoded: {
              subject: ["I have no content type"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                newsgroups: ["gmane.comp.mozilla.thundebird.user"],
                from: ["Bug Reporter <new@thunderbird.bug>"],
                subject: ["I have no content type"],
                date: ["Sun, 27 May 2001 21:23:35 +0100"],
                "mime-version": ["1.0"],
                "message-id": ["<06.eml@mime.sample>"],
              },
              parts: [
                {
                  contentType: "text/plain",
                  partName: "1",
                  rawBody: "No content type\r\n",
                  rawHeaders: {},
                },
              ],
            },
          },
          "07.eml@mime.sample": {
            decoded: {
              to: ["Heinz <mueller@example.com>"],
              subject: ["Default content-types"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                "message-id": ["<07.eml@mime.sample>"],
                date: ["Fri, 19 May 2000 00:29:55 -0400"],
                to: ["Heinz <mueller@example.com>"],
                from: ["Doug Sauder <dwsauder@example.com>"],
                subject: ["Default content-types"],
                "mime-version": ["1.0"],
              },
              parts: [
                {
                  contentType: "multipart/alternative",
                  partName: "1",
                  rawBody: "",
                  rawHeaders: {
                    "content-type": [
                      'multipart/alternative;\r\n\tboundary="=====================_714967308==_.ALT"',
                    ],
                  },
                  parts: [
                    {
                      contentType: "text/plain",
                      partName: "1.1",
                      rawBody: "Die Hasen\r\n",
                      rawHeaders: {
                        "content-transfer-encoding": ["quoted-printable"],
                      },
                    },
                    {
                      contentType: "text/html",
                      partName: "1.2",
                      rawBody: "<html><body><b>Die Hasen</b></body></html>\r\n",
                      rawHeaders: {
                        "content-type": ["text/html"],
                      },
                    },
                  ],
                },
              ],
            },
          },
          "08.eml@mime.sample": {
            decoded: {
              to: ["user@invalid"],
              subject: ["Embedded Image"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                "message-id": ["<08.eml@mime.sample>"],
                date: ["Wed, 29 May 2024 15:26:47 +0200"],
                "mime-version": ["1.0"],
                from: ["John <john@example.com>"],
                to: ["user@invalid"],
                subject: ["Embedded Image"],
              },
              parts: [
                {
                  contentType: "multipart/related",
                  partName: "1",
                  rawBody: "",
                  rawHeaders: {
                    "content-language": ["en-US"],
                    "content-type": [
                      'multipart/related;\r\n boundary="------------XDhTrqqN5B126r5Y7JBH0YyJ"',
                    ],
                  },
                  parts: [
                    {
                      contentType: "text/html",
                      partName: "1.1",
                      rawBody:
                        '<!DOCTYPE html>\r\n<html>\r\n  <head>\r\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n  </head>\r\n  <body>\r\n    <p>Example body</p>\r\n    <img moz-do-not-send="false"\r\n      src="cid:part1.FxEY2Ivx.xSFtCdX4@example.com" alt="" width="1"\r\n      height="1" class="">\r\n    <p>with embedded image.<br>\r\n    </p>\r\n    <br>\r\n  </body>\r\n</html>',
                      rawHeaders: {
                        "content-type": ["text/html; charset=UTF-8"],
                        "content-transfer-encoding": ["7bit"],
                      },
                    },
                    {
                      contentType: "image/png",
                      partName: "1.2",
                      rawBody:
                        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAAKnRFWHRDcmVhdGlvbiBUaW1l\r\nAFNhIDQgTWFpIDIwMDIgMjM6MjA6MzYgKzAxMDBC3wLLAAAAB3RJTUUH0gUEFRUrVURxbAAA\r\nAAlwSFlzAAAK8AAACvABQqw0mAAAAARnQU1BAACxjwv8YQUAAAAMSURBVHjaY+CQbQEAANoA\r\nqj1ML8MAAAAASUVORK5CYII=\r\n",
                      rawHeaders: {
                        "content-type": [
                          'image/png; name="blue_pixel_1x1.png"',
                        ],
                        "content-disposition": [
                          'inline; filename="blue_pixel_1x1.png"',
                        ],
                        "content-id": ["<part1.FxEY2Ivx.xSFtCdX4@example.com>"],
                        "content-transfer-encoding": ["base64"],
                      },
                      name: "blue_pixel_1x1.png",
                    },
                  ],
                },
              ],
            },
          },
          "1919244@thunderbird.bug": {
            decoded: {
              to: [
                `"Hörst, Kenny" <K.Hoerst@invalid>, Bug Reporter <new@thunderbird.bug>`,
              ],
              subject: ["Message for Bug 1919244"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                "message-id": ["<1919244@thunderbird.bug>"],
                date: ["Mon, 23 Sep 2024 16:16:47 +0200"],
                "mime-version": ["1.0"],
                from: ["=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>"],
                to: [
                  "=?UTF-8?Q?H=C3=B6rst=2C_Kenny?= <K.Hoerst@invalid>, Bug Reporter <new@thunderbird.bug>",
                ],
                subject: ["Message for Bug 1919244"],
              },
              parts: [
                {
                  contentType: "text/plain",
                  partName: "1",
                  rawBody: "Test\r\n",
                  rawHeaders: {
                    "content-type": [
                      "text/plain; charset=UTF-8; format=flowed",
                    ],
                    "content-transfer-encoding": ["7bit"],
                  },
                },
              ],
            },
          },
          "sample.eml@mime.sample": {
            decoded: {
              to: ["Heinz <mueller@example.com>"],
              subject: ["Attached message without subject"],
            },
            full: {
              contentType: "message/rfc822",
              partName: "",
              rawHeaders: {
                "message-id": ["<sample.eml@mime.sample>"],
                date: ["Fri, 20 May 2000 00:29:55 -0400"],
                to: ["Heinz <mueller@example.com>"],
                from: ["Batman <bruce@example.com>"],
                subject: ["Attached message without subject"],
                "mime-version": ["1.0"],
              },
              parts: [
                {
                  contentType: "multipart/mixed",
                  partName: "1",
                  rawBody: "",
                  rawHeaders: {
                    "content-type": [
                      'multipart/mixed;\r\n  boundary="------------49CVLb1N6p6Spdka4qq7Naeg"',
                    ],
                  },
                  parts: [
                    {
                      contentType: "text/html",
                      partName: "1.1",
                      rawBody:
                        '<html>\r\n  <head>\r\n\r\n    <meta http-equiv="content-type" content="text/html; charset=UTF-8">\r\n  </head>\r\n  <body>\r\n    <p>This message has one email attachment with missing headers.<br>\r\n    </p>\r\n  </body>\r\n</html>',
                      rawHeaders: {
                        "content-type": ["text/html; charset=UTF-8"],
                        "content-transfer-encoding": ["7bit"],
                      },
                    },
                    {
                      contentType: "message/rfc822",
                      partName: "1.2",
                      rawBody:
                        "Message-ID: <sample-attached.eml@mime.sample>\r\nMIME-Version: 1.0\r\n\r\nThis is my body\r\n",
                      rawHeaders: {
                        "content-type": [
                          'message/rfc822; charset=UTF-8; name="message1.eml"',
                        ],
                        "content-disposition": [
                          'attachment; filename="message1.eml"',
                        ],
                        "content-transfer-encoding": ["7bit"],
                      },
                      name: "message1.eml",
                    },
                  ],
                },
              ],
            },
          },
        };

        for (const message of messages) {
          const full = await browser.messages.getFull(message.id, {
            decodeHeaders: false,
            decodeContent: false,
          });
          window.assertDeepEqual(
            expectedData[message.headerMessageId].full,
            full,
            `Raw return value of getFull() for message ${message.headerMessageId} should be correct`
          );

          const expectedDecoded = expectedData[message.headerMessageId].decoded;
          for (const [name, value] of Object.entries(expectedDecoded)) {
            const decoded = await browser.messengerUtilities.decodeMimeHeader(
              name,
              full.rawHeaders[name]
            );
            window.assertDeepEqual(
              value,
              decoded,
              `Manually decoded the '${name}' header for message ${message.headerMessageId} should be correct`
            );
          }
        }

        browser.test.notifyPass("finished");
      },
      "utils.js": await getUtilsJS(),
    },
    manifest: {
      manifest_version: 2,
      background: { scripts: ["utils.js", "background.js"] },
      permissions: ["accountsRead", "messagesRead"],
    },
  });

  await extension.startup();
  await extension.awaitFinish("finished");
  await extension.unload();

  cleanUpAccount(_account);
});
