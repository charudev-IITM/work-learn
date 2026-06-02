import { useMemo } from 'react'

/**
 * Lightweight markdown renderer for LLM chat output.
 * Supports: **bold**, *italic*, `inline code`, bullet lists (- / *), numbered lists,
 * and paragraph breaks. No external dependencies.
 */
export function GoldieMarkdown({ content }: { content: string }) {
  const rendered = useMemo(() => parseMarkdown(content), [content])
  return <div className="goldie-md">{rendered}</div>
}

// ── Inline formatting ──────────────────────────────────────

function renderInline(text: string): (string | JSX.Element)[] {
  const parts: (string | JSX.Element)[] = []
  // Match [text](url), **bold**, *italic*, `code` — order matters
  const re = /(\[([^\]]+)\]\((https?:\/\/[^)]+)\)|\*\*(.+?)\*\*|\*(.+?)\*|`(.+?)`)/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0

  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index))
    }
    if (match[2] && match[3]) {
      // [text](url)
      parts.push(
        <a key={key++} href={match[3]} target="_blank" rel="noopener noreferrer"
           className="text-amber-400 underline underline-offset-2 hover:text-amber-300">
          {match[2]}
        </a>,
      )
    } else if (match[4]) {
      // **bold**
      parts.push(<strong key={key++} className="font-semibold">{match[4]}</strong>)
    } else if (match[5]) {
      // *italic*
      parts.push(<em key={key++}>{match[5]}</em>)
    } else if (match[6]) {
      // `code`
      parts.push(
        <code key={key++} className="px-1 py-0.5 rounded bg-amber-100/50 dark:bg-amber-900/30 text-[0.85em] font-mono">
          {match[6]}
        </code>,
      )
    }
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex))
  }
  return parts.length ? parts : [text]
}

// ── Block-level parsing ──────────────────────────────────────

function parseMarkdown(text: string): JSX.Element[] {
  const lines = text.split('\n')
  const blocks: JSX.Element[] = []
  let listItems: string[] = []
  let listType: 'ul' | 'ol' | null = null
  let key = 0

  const flushList = () => {
    if (listItems.length === 0) return
    const Tag = listType === 'ol' ? 'ol' : 'ul'
    blocks.push(
      <Tag
        key={key++}
        className={
          listType === 'ol'
            ? 'list-decimal list-inside space-y-0.5 my-1'
            : 'list-disc list-inside space-y-0.5 my-1'
        }
      >
        {listItems.map((item, i) => (
          <li key={i}>{renderInline(item)}</li>
        ))}
      </Tag>,
    )
    listItems = []
    listType = null
  }

  for (const line of lines) {
    // Headings: # ## ###
    const headingMatch = line.match(/^(#{1,3})\s+(.+)/)
    if (headingMatch) {
      flushList()
      const level = headingMatch[1].length
      const text = headingMatch[2]
      if (level === 1) {
        blocks.push(<h3 key={key++} className="text-base font-bold mt-2 mb-1">{renderInline(text)}</h3>)
      } else if (level === 2) {
        blocks.push(<h4 key={key++} className="text-sm font-bold mt-1.5 mb-0.5">{renderInline(text)}</h4>)
      } else {
        blocks.push(<h5 key={key++} className="text-sm font-semibold mt-1 mb-0.5">{renderInline(text)}</h5>)
      }
      continue
    }

    // Bullet list: - or *
    const bulletMatch = line.match(/^\s*[-*]\s+(.+)/)
    if (bulletMatch) {
      if (listType !== 'ul') flushList()
      listType = 'ul'
      listItems.push(bulletMatch[1])
      continue
    }

    // Numbered list: 1. or 1)
    const numMatch = line.match(/^\s*\d+[.)]\s+(.+)/)
    if (numMatch) {
      if (listType !== 'ol') flushList()
      listType = 'ol'
      listItems.push(numMatch[1])
      continue
    }

    // Non-list line — flush any accumulated list
    flushList()

    // Empty line → spacing
    if (!line.trim()) {
      continue
    }

    // Regular paragraph line
    blocks.push(
      <p key={key++} className="my-0.5">
        {renderInline(line)}
      </p>,
    )
  }

  flushList()
  return blocks
}
