import type { EngineInterface, Register, RenderViewport } from 'claude-code'

// The model calls it as `mcp__<plugin>__<name>`; the plugin is "inline-images".
const NAME = 'show_image'
const TOOL = 'mcp__inline-images__show_image'

// What a terminal can take as inline bytes (2 MiB decoded) and as a side.
const MAX_BYTES = 2 * 1024 * 1024
const MAX_SIDE = 2048

// A terminal cell is about 9 by 18 pixels; pi's defaults, as are the sizes.
const CELL_WIDTH_PX = 9
const CELL_HEIGHT_PX = 18
const DEFAULT_COLUMNS = 60

const DESCRIPTION = `Show an image to the user, drawn inline in their terminal.

Use it whenever the user asks to see, view, open, preview or display an image, and whenever a picture would help more than words: a screenshot, a chart or diagram you made, a design mock, a photo, an icon. Call it after you write an image file (for example a matplotlib chart) so the user sees the result. Prefer it to telling the user to open the file.

Takes a local path (absolute, relative to the working directory, or ~/...) or an http(s) URL. Reads PNG, JPEG, GIF (first frame), WebP, HEIC, TIFF, BMP, SVG and PDF (first page).

The user sees the image; you do not. To look at the image yourself, use Read.`

const INPUT_SCHEMA = {
  type: 'object',
  properties: {
    path: {
      type: 'string',
      description: 'The image: a file path or an http(s) URL.',
    },
    width: {
      type: 'integer',
      minimum: 4,
      maximum: 255,
      description:
        'Width in terminal columns. Leave it out for the default (at most 60 columns, the terminal width allowing). Ask for more only when detail matters.',
    },
    alt: {
      type: 'string',
      description:
        'A few words that say what the image shows. Drawn where the terminal cannot draw images.',
    },
  },
  required: ['path'],
  additionalProperties: false,
}

type Input = { path: string; width?: number; alt?: string }

// What the tool stores as its result: what the render hook draws from.
type Shown = {
  shown: string
  png: string
  width: number
  height: number
  columns?: number
  alt?: string
}

// PNG bytes the render hook has read, by file. Starts empty after a reload.
const bytesByFile = new Map<string, string>()

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: NAME,
      description: DESCRIPTION,
      inputSchema: INPUT_SCHEMA,
      isDeferred: false,
    })

    return next(e)
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const input = e as unknown as Input
    try {
      // A plugin tool's result is text: the JSON the render hook reads back.
      return { result: JSON.stringify(await prepare($, input)) }
    } catch (error) {
      return { deny: `show_image: ${messageOf(error)}` }
    }
  }).catch(() => ({ deny: 'show_image: the tool failed.' }))

  // Keep the tool's own row, its input cut to a short path, and draw the
  // picture under it. The ctrl+o transcript shows the input in full.
  on(
    'ui.render',
    { component: 'ToolUse', props: { tool: TOOL } },
    async ($, e, next) => {
      const row = await next(
        e.props.isExpanded === true
          ? e
          : { ...e, props: { ...e.props, input: shortInput(e.props.input) } },
      )
      const shown = shownOf(e.props.output)
      if (e.props.isErrored || e.props.isInterrupted || shown === undefined) {
        return row
      }

      const alt =
        shown.alt ??
        `[image: ${baseName(shown.shown)}, ${shown.width}x${shown.height}]`
      if (e.surface !== 'terminal') {
        const { Box, Text } = $.ui.resolve(e)

        return (
          <Box flexDirection="column">
            {row}
            <Text dimColor>  {alt}</Text>
          </Box>
        )
      }

      const { Box, Image, Text } = $.ui.resolve(e)
      const png = await bytesOf($, shown.png)
      if (png === undefined) {
        return (
          <Box flexDirection="column">
            {row}
            <Text dimColor>  The image file is gone: {shown.png}</Text>
          </Box>
        )
      }

      const size = fit(shown, e.viewport)

      return (
        <Box flexDirection="column">
          {row}
          <Box paddingLeft={2} marginTop={1}>
            <Image
              source={{ png }}
              columns={size.columns}
              rows={size.rows}
              alt={alt}
            />
          </Box>
        </Box>
      )
    },
  )

  // The result is JSON for the hook above to read: the picture already says
  // it. Drawn as nothing, except in the ctrl+o transcript or after an error.
  on(
    'ui.render',
    { component: 'ToolResult', props: { tool: TOOL } },
    ($, e, next) => {
      if (
        e.props.isErrored ||
        e.props.isExpanded === true ||
        shownOf(e.props.output) === undefined
      ) {
        return next(e)
      }
      const { Box } = $.ui.resolve(e)

      return <Box />
    },
  )
}

// What the row's header shows: the path alone, a long one cut to its name.
function shortInput(input: unknown): unknown {
  if (typeof input !== 'object' || input === null) return input
  const path = (input as Partial<Input>).path
  if (typeof path !== 'string') return input

  return { path: path.length > 60 ? `…/${baseName(path)}` : path }
}

// Turns what the model asked for into a PNG a terminal can draw.
async function prepare($: EngineInterface, input: Input): Promise<Shown> {
  if (typeof input.path !== 'string' || input.path.trim() === '') {
    throw new Error('give a file path or an http(s) URL as "path".')
  }

  const cacheDir = await cacheDirOf($)
  const asked = input.path.trim()
  const isUrl = /^https?:\/\//i.test(asked)
  const file = isUrl
    ? await download($, asked, cacheDir)
    : await absolute($, asked)

  const stat = await $.fs.stat(file).catch(() => undefined)
  if (stat === undefined) throw new Error(`no file at ${file}.`)
  if (stat.kind !== 'file') throw new Error(`${file} is not a file.`)

  let png = file
  let header: Header | undefined
  if (stat.size <= MAX_BYTES) {
    header = pngHeader(await readBase64($, file))
  }
  if (header === undefined || header.width > MAX_SIDE || header.height > MAX_SIDE) {
    const key = await hash(`${file}\0${stat.size}\0${stat.mtimeMs}`)
    png = `${cacheDir}/${key}.png`
    header = await convert($, file, png, cacheDir)
  }

  return {
    shown: isUrl ? asked : file,
    png,
    width: header.width,
    height: header.height,
    ...(input.width === undefined ? {} : { columns: input.width }),
    ...(input.alt === undefined ? {} : { alt: input.alt }),
  }
}

// Converts any image to a PNG of at most MAX_SIDE a side and MAX_BYTES.
async function convert(
  $: EngineInterface,
  from: string,
  to: string,
  cacheDir: string,
): Promise<Header> {
  const isSvg = /\.svgz?$/i.test(from)
  const failures: string[] = []
  // sips -Z enlarges as well as shrinks, so it is given only when needed.
  const longest = isSvg ? undefined : await longestSide($, from)

  for (const side of [MAX_SIDE, 1024, 512]) {
    const attempts: string[][] = [
      [
        'magick',
        ...(isSvg ? ['-density', '192', '-background', 'none'] : []),
        `${from}[0]`,
        '-auto-orient',
        '-resize',
        `${side}x${side}>`,
        `png:${to}`,
      ],
      isSvg
        ? ['qlmanage', '-t', '-s', String(side), '-o', cacheDir, from]
        : [
            'sips',
            '-s',
            'format',
            'png',
            ...(longest === undefined || longest > side ? ['-Z', String(side)] : []),
            from,
            '--out',
            to,
          ],
      ['convert', `${from}[0]`, '-resize', `${side}x${side}>`, `png:${to}`],
    ]

    for (const argv of attempts) {
      const ran = await $.process
        .run(argv, { timeoutMs: 60_000 })
        .catch(() => undefined)
      if (ran === undefined) continue
      if (ran.exitCode !== 0) {
        failures.push(`${argv[0]}: ${ran.stderr.trim().split('\n')[0] ?? ''}`)
        continue
      }
      if (argv[0] === 'qlmanage') {
        // qlmanage names its output after the input: <name>.png in cacheDir.
        const made = `${cacheDir}/${baseName(from)}.png`
        await $.process.run(['mv', '-f', made, to]).catch(() => undefined)
      }

      const stat = await $.fs.stat(to).catch(() => undefined)
      if (stat === undefined) continue
      if (stat.size > MAX_BYTES) break

      const header = pngHeader(await readBase64($, to))
      if (header !== undefined) return header
    }
  }

  const why = failures.length > 0 ? ` (${failures.join('; ')})` : ''
  throw new Error(
    `could not turn ${from} into a PNG${why}. Install ImageMagick (brew install imagemagick) for more formats.`,
  )
}

// The longer side in pixels, as sips reads it; undefined where it cannot.
async function longestSide(
  $: EngineInterface,
  file: string,
): Promise<number | undefined> {
  const ran = await $.process
    .run(['sips', '-g', 'pixelWidth', '-g', 'pixelHeight', file])
    .catch(() => undefined)
  if (ran === undefined || ran.exitCode !== 0) return undefined
  const sides = [...ran.stdout.matchAll(/pixel(?:Width|Height):\s*(\d+)/g)].map(
    match => Number(match[1]),
  )

  return sides.length === 2 ? Math.max(...sides) : undefined
}

async function download(
  $: EngineInterface,
  url: string,
  cacheDir: string,
): Promise<string> {
  const to = `${cacheDir}/url-${await hash(url)}`
  const ran = await $.process.run(
    [
      'curl',
      '-fsSL',
      '--max-time',
      '30',
      '--max-filesize',
      '52428800',
      '-o',
      to,
      url,
    ],
    { timeoutMs: 40_000 },
  )
  if (ran.exitCode !== 0) {
    throw new Error(`could not download ${url}: ${ran.stderr.trim()}`)
  }

  return to
}

async function absolute($: EngineInterface, path: string): Promise<string> {
  if (path === '~' || path.startsWith('~/')) {
    const home = await $.env.get('HOME')
    if (home !== undefined) return home + path.slice(1)
  }
  if (path.startsWith('/')) return path

  const cwd = await $.session.cwd()

  return `${cwd.replace(/\/$/, '')}/${path.replace(/^\.\//, '')}`
}

async function cacheDirOf($: EngineInterface): Promise<string> {
  const tmp = (await $.env.get('TMPDIR')) ?? '/tmp'
  const dir = `${tmp.replace(/\/$/, '')}/claude-inline-images`
  await $.process.run(['mkdir', '-p', dir])

  return dir
}

async function readBase64($: EngineInterface, file: string): Promise<string> {
  const { base64 } = await $.fs.read(file, { as: 'bytes' })

  return base64
}

async function bytesOf(
  $: EngineInterface,
  file: string,
): Promise<string | undefined> {
  const known = bytesByFile.get(file)
  if (known !== undefined) return known

  const read = await readBase64($, file).catch(() => undefined)
  if (read === undefined || pngHeader(read) === undefined) return undefined
  bytesByFile.set(file, read)

  return read
}

type Header = { width: number; height: number }

// Reads width and height from a PNG's IHDR chunk; undefined for any other file.
function pngHeader(base64: string): Header | undefined {
  const head = decodeBase64(base64.slice(0, 32))
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (head.length < 24 || signature.some((byte, i) => head[i] !== byte)) {
    return undefined
  }
  const view = new DataView(head.buffer, head.byteOffset, head.byteLength)
  const width = view.getUint32(16)
  const height = view.getUint32(20)

  return width > 0 && height > 0 ? { width, height } : undefined
}

// The box of cells the picture fills, its aspect kept. With no width asked,
// the box is at most DEFAULT_COLUMNS wide and as tall as it is wide in pixels.
function fit(
  shown: Shown,
  viewport: RenderViewport | undefined,
): { columns: number; rows: number } {
  const ratio = (shown.height / shown.width) * (CELL_WIDTH_PX / CELL_HEIGHT_PX)
  const room = clamp((viewport?.columns ?? 80) - 4, 4, 255)
  const maxColumns = clamp(shown.columns ?? DEFAULT_COLUMNS, 4, room)
  const maxRows = clamp(
    shown.columns === undefined
      ? Math.ceil(maxColumns * (CELL_WIDTH_PX / CELL_HEIGHT_PX))
      : Math.floor((viewport?.rows ?? 40) * 0.8),
    1,
    255,
  )
  // A small icon is not blown up past its own size in cells.
  const natural = Math.ceil(shown.width / CELL_WIDTH_PX)

  let columns = shown.columns === undefined ? Math.min(maxColumns, natural) : maxColumns
  columns = clamp(columns, 1, maxColumns)
  let rows = Math.max(1, Math.round(columns * ratio))
  if (rows > maxRows) {
    rows = maxRows
    columns = clamp(Math.round(rows / ratio), 1, maxColumns)
  }

  return { columns, rows }
}

const BASE64 =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

// Decodes standard base64 (a whole number of 4-character groups).
function decodeBase64(text: string): Uint8Array {
  const clean = text.replace(/=+$/, '')
  const bytes = new Uint8Array(Math.floor((clean.length * 3) / 4))
  let bits = 0
  let value = 0
  let at = 0
  for (const char of clean) {
    const index = BASE64.indexOf(char)
    if (index < 0) break
    value = (value << 6) | index
    bits += 6
    if (bits >= 8) {
      bits -= 8
      bytes[at++] = (value >> bits) & 0xff
    }
  }

  return bytes.subarray(0, at)
}

function shownOf(output: unknown): Shown | undefined {
  let value = output
  // The stored result may come back as MCP content blocks.
  if (Array.isArray(value)) {
    const block = value.find(
      (one): one is { type: 'text'; text: string } =>
        typeof one === 'object' &&
        one !== null &&
        one.type === 'text' &&
        typeof one.text === 'string',
    )
    value = block?.text
  }
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return undefined
    }
  }
  if (typeof value !== 'object' || value === null) return undefined
  const shown = value as Partial<Shown>
  if (
    typeof shown.png !== 'string' ||
    typeof shown.width !== 'number' ||
    typeof shown.height !== 'number'
  ) {
    return undefined
  }

  return shown as Shown
}

async function hash(text: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  )

  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path
}

function clamp(n: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, n))
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
