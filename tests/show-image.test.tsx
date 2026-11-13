import { expect, test } from 'claude-code/testing'

import { CHART_PNG } from './chart-png'

const TOOL = 'mcp__show-image__show_image'

const PNG = CHART_PNG

test('a PNG on disk is shown as it is', async ($, on) => {
  on('env.get', () => ({ value: '/tmp' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.stat', () => ({
    value: { kind: 'file', size: 1000, mtimeMs: 1, isLink: false },
  }))
  on('fs.read', () => ({ value: { base64: PNG } }))

  const ran = await $.tool.call({
    tool: TOOL,
    path: '/pics/chart.png',
  } as never)

  expect(ran.deny).toBeUndefined()
  expect(JSON.parse(ran.result as string)).toEqual({
    shown: '/pics/chart.png',
    png: '/pics/chart.png',
    width: 900,
    height: 450,
  })
})

test('a missing file is refused with a reason', async ($, on) => {
  on('env.get', () => ({ value: '/tmp' }))
  on('process.run', () => ({
    value: {
      exitCode: 0,
      stdout: '',
      stderr: '',
      isStdoutTruncated: false,
      isStderrTruncated: false,
    },
  }))
  on('fs.stat', () => {
    throw new Error('ENOENT')
  })

  const ran = await $.tool.call({ tool: TOOL, path: '/nope.png' } as never)

  expect(ran.deny).toBe('show_image: no file at /nope.png.')
})

const ROW = {
  plugin: 'show-image',
  component: 'ToolUse',
  requestId: 'tu-1',
  viewport: { columns: 120, rows: 40, isFullscreen: true },
  props: {
    tool_use_id: 'tu-1',
    tool: TOOL,
    input: { path: '/pics/chart.png' },
    isRunning: false,
    isErrored: false,
    isInterrupted: false,
    output: JSON.stringify({
      shown: '/pics/chart.png',
      png: '/pics/chart.png',
      width: 900,
      height: 450,
    }),
  },
} as const

test('the terminal draws the picture under the row, aspect kept', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>row</Text>
  })
  on('fs.read', () => ({ value: { base64: PNG } }))

  const ui = await $.ui.mount({ ...ROW, surface: 'terminal' })
  const image = await ui.find({ type: 'Image' })

  expect((await ui.find({ type: 'Text', text: 'row' }))?.text).toBe('row')
  // 900 px wide caps at 60 columns; 2:1 pixels in 1:2 cells is 15 rows.
  expect(image?.props.columns).toBe(60)
  expect(image?.props.rows).toBe(15)
  expect(image?.props.source).toEqual({ png: PNG })
  await ui.unmount()
})

test('other surfaces get the words in place of the picture', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>row</Text>
  })

  const ui = await $.ui.mount({ ...ROW, surface: 'mobile' })

  expect(await ui.find({ type: 'Image' })).toBeUndefined()
  expect(
    (await ui.find({ type: 'Text', text: /chart\.png/ }))?.text,
  ).toContain('[image: chart.png, 900x450]')
  await ui.unmount()
})

const RESULT = {
  plugin: 'show-image',
  component: 'ToolResult',
  requestId: 'tu-1',
  props: {
    tool_use_id: 'tu-1',
    tool: TOOL,
    output: ROW.props.output,
    isErrored: false,
  },
} as const

test('the JSON result is hidden, and shown in the ctrl+o transcript', async ($, on) => {
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)

    return <Text>json</Text>
  })

  const folded = await $.ui.mount({ ...RESULT, surface: 'terminal' })
  expect(await folded.find({ type: 'Text', text: 'json' })).toBeUndefined()
  await folded.unmount()

  const expanded = await $.ui.mount({
    ...RESULT,
    props: { ...RESULT.props, isExpanded: true },
    surface: 'terminal',
  })
  expect((await expanded.find({ type: 'Text', text: 'json' }))?.text).toBe('json')
  await expanded.unmount()
})

test('the row header shows a long path by its name alone', async ($, on) => {
  // The engine's row draws the input it is given.
  on('ui.render', ($, e) => {
    const { Text } = $.ui.resolve(e)
    const input = (e.props as { input?: unknown }).input

    return <Text>{JSON.stringify(input ?? null)}</Text>
  })
  on('fs.read', () => ({ value: { base64: PNG } }))

  const long = `/private/tmp/${'x'.repeat(60)}/it-works.jpg`
  const ui = await $.ui.mount({
    ...ROW,
    props: { ...ROW.props, input: { path: long, alt: 'words' } },
    surface: 'terminal',
  })

  expect(
    (await ui.find({ type: 'Text', text: /it-works/ }))?.text,
  ).toBe('{"path":"…/it-works.jpg"}')
  await ui.unmount()
})
