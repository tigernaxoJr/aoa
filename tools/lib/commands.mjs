// Agent command files generated from specs/workflow.json (SPEC §8.3–8.4). Each step or operation
// with a `command` becomes a thin wrapper pointing at the workflow step and its Skill section;
// rules stay in AGENTS.md and the Skill. Only Claude Code is generated for now.

/** init runs before the project (and its command files) exists; it is reached through the Skill or agent-guide. */
const PROJECT_LEVEL = (step) => step.command && step.id !== 'init'

/** Returns [{ path, content }] for Claude Code (`.claude/commands/*.md`). */
export function claudeCommands(workflow, siteUrl) {
  const out = []
  for (const [kind, list] of [['steps', workflow.steps], ['operations', workflow.operations]]) {
    for (const step of list.filter(PROJECT_LEVEL)) {
      const name = step.command.replace(/^\//, '')
      const args = step.args ?? []
      const hint = args.map((a) => (a.required ? `<${a.name}>` : `[${a.name}]`)).join(' ')
      const lines = [
        '---',
        `description: ${step.title}`,
        ...(hint ? [`argument-hint: ${hint}`] : []),
        '---',
        '',
        `${step.title}${args.length ? '：$ARGUMENTS' : ''}`,
        '',
        `依專案 \`AGENTS.md\` 的規則，執行 \`schemas/workflow.json\` 中 \`${kind}\` 的 \`${step.id}\`：先確認 \`requires\`，再依序完成 \`actions\`；有 \`checkpoint\` 時停下等待使用者確認。`,
      ]
      if (args.length) {
        lines.push('', '參數：', ...args.map((a) => `- \`${a.name}\`${a.required ? '（必填）' : ''}${a.description ? `：${a.description}` : ''}`))
      }
      if (step.guide) {
        const guide = step.guide.replace(/^skills\/product-video\//, '')
        lines.push('', `做法見 product-video Skill 的 \`${guide}\`；未安裝 Skill 時讀取 ${siteUrl}/api/skills/product-video/${guide}`)
      }
      out.push({ path: `.claude/commands/${name}.md`, content: `${lines.join('\n')}\n` })
    }
  }
  return out
}
