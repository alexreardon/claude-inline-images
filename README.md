# show-image

A Claude Code mod that lets Claude show you images inline in your terminal.

It gives Claude a `show_image` tool. Claude calls it when you ask to see an image, and when a picture helps: a screenshot, a chart it made, a design. The image draws under the tool call in the transcript.

## What it reads

- Local paths: absolute, relative to the working directory, or `~/...`
- `http(s)` URLs (downloaded with `curl`)
- PNG as is. JPEG, GIF, WebP, HEIC, TIFF, BMP, SVG and PDF (first page) are turned into PNG with ImageMagick (`magick`) or, on macOS, `sips` and `qlmanage`.

Converted and downloaded files go to `$TMPDIR/claude-show-image/`.

## Terminals

Images draw in Ghostty and kitty, and in iTerm2 3.5+ under Claude Code's fullscreen layout. Inside tmux, turn on `allow-passthrough` and `focus-events`. Other terminals show a one-line description in place of the image.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install show-image --marketplace alexreardon/claude-show-image
```

Answer `y` to add the marketplace, then choose a scope (user is first). The mod runs at once.

From a shell:

```sh
claude plugin install show-image --marketplace alexreardon/claude-show-image
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `alexreardon/claude-show-image`, then Add plugin.

## Try it

> show me ~/Desktop/screenshot.png

## Develop

Clone the repository, then add your clone as a local marketplace so Claude Code reads the mod from it:

```sh
claude plugin marketplace add /path/to/claude-show-image
claude plugin install show-image@claude-show-image
```

After you edit `hooks/register.tsx`, run `/reload-plugins`. To check your changes:

```sh
claude plugin validate .
claude plugin test .
```

## License

MIT
