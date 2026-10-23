// Package entry imported by the DSH plugin loader.
// A failure here must not take down the whole plugin tree: if the runtime API
// shape differs from what this plugin was written against, fall back to an
// inert plugin and say so once, instead of breaking every other plugin.
let plugin
try {
  plugin = await import('./plugin.js')
} catch (error) {
  const detail = error instanceof Error ? error.message : String(error)
  console.error(
    `[fatfish-memory] 插件加载失败，本次启动已自动停用（不影响其他功能）。\n`
    + `[fatfish-memory] 原因: ${detail}\n`,
  )
  plugin = { name: 'dsh-fatfish-memory', inject: [], apply() {} }
}

export const name = plugin.name
export const inject = plugin.inject
export function apply(ctx, config = {}) {
  return plugin.apply(ctx, config)
}
