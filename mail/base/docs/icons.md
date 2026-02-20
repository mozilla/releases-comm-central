# Icons

## Icon file structure

Icons are placed into the appropriate folder for their size. They are then
registered at the very bottom in the `jar.inc.mn` of the `mail/themes/shared` folder and have a custom property of the
form `--icon-$name-$size` in `mail/themes/shared/mail/icons.css`.

Icon size (px) | Folder                              | Custom property size suffix
---------------|-------------------------------------|----------------------------
12x12          | `mail/themes/shared/mail/icons/xs/` | `xs`
16x16          | `mail/themes/shared/mail/icons/sm/` | `sm`
20x20          | `mail/themes/shared/mail/icons/md/` | `md`
24x24          | `mail/themes/shared/mail/icons/lg/` | `lg`

Icons were previously placed just in the `icons` folder itself, and then later in the `new` subfolder. The goal is to eventually migrate and consolidate all icons to the new structure. There might still be exceptions for things like illustrations (which aren't really icons) or other higher resolution or color icons.

## Using icons

Icons are defined as custom properties in `chrome://messenger/skin/icons.css`. Whenever possible those definitions should be used to show an icon.

We can do this even in `<img>` elements by setting the `content` property:

```css
img {
  content: var(--icon-upload-sm);
}
```

We normally control the colors of the icons using `fill` and `stroke` from CSS. A few icons have hard-coded colors, either because they need more than two colors or because they are brand colors that should not change. Some icons also use the `fill-opacity` and `stroke-opacity` if set.

```css
img {
  content: var(--icon-upload-sm);
  fill: grey;
  stroke: currentColor;
  -moz-context-properties: fill, stroke;
}
```

To see what all the various icons we have defined look like, check out the Design System → Icons story in [Storybook](storybook).
