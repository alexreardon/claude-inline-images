<div align="center">

# show-image 🖼

_Images, right inside your Claude Code terminal_

<img src="assets/example.png" width="600px" alt="An image drawn by show-image inside a Claude Code terminal session">

</div>

<br/>

## About

`show-image` is a [Claude Code](https://claude.com/claude-code) plugin that lets Claude show you images inline in your terminal. Ask Claude to show you a screenshot, a chart it just made, or a design mock, and it will draw it right there in the conversation.

```
> show me ~/Desktop/screenshot.png
```

## Installation

1. At the prompt of a Claude Code terminal session, run:

```
/plugin install show-image --marketplace alexreardon/claude-show-image
```

2. Answer `y` to add the marketplace, and then pick a scope (`user` is a great default)

3. Profit 🕺

<details>
  <summary>Other ways to install</summary>

From your shell:

```bash
claude plugin install show-image --marketplace alexreardon/claude-show-image
```

From the Claude desktop app: click **+** next to the prompt box → **Plugins** → **Add marketplace** (`alexreardon/claude-show-image`) → **Add plugin**

</details>

## How it works 🤔

`show-image` gives Claude a new `show_image` tool. Claude reaches for it whenever you ask to see an image, or whenever a picture would help more than words. The image is drawn just below the tool call in your transcript.

- Works with local files (absolute paths, relative paths and `~/...`) and `http(s)` URLs
- `png` files are shown as they are. `jpeg`, `gif`, `webp`, `heic`, `tiff`, `bmp`, `svg` and `pdf` (first page) are converted to `png` with ImageMagick (`magick`), or with `sips` and `qlmanage` on macOS
- Converted and downloaded files are kept in `$TMPDIR/claude-show-image/`

The tool only shows the image to _you_. If Claude needs to look at an image itself, it will still use its own `Read` tool.

## Terminal support 🖥

| Terminal      | Support                                                   |
| ------------- | --------------------------------------------------------- |
| Ghostty       | ✅                                                        |
| kitty         | ✅                                                        |
| iTerm2 (3.5+) | ✅ when using the Claude Code fullscreen layout           |
| tmux          | ✅ with `allow-passthrough` and `focus-events` turned on  |
| Others        | A short text description is shown in place of the image   |

## Local development 👩‍💻

1. Clone this repository

2. Add your clone as a local marketplace, so Claude Code reads the plugin straight from your folder:

```bash
claude plugin marketplace add /path/to/claude-show-image
claude plugin install show-image@claude-show-image
```

3. After making a change, run `/reload-plugins` inside Claude Code to pick it up

Checking your changes:

```bash
claude plugin validate .
claude plugin test .
```

## Credits

Made with love by [Alex Reardon](https://twitter.com/alexandereardon)
