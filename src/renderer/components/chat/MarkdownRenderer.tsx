import React from 'react'

interface MarkdownRendererProps {
  content: string
  className?: string
}

/**
 * Lightweight regex-based markdown renderer.
 * Supports: **bold**, *italic*, ~~strikethrough~~, `inline code`, ```code blocks```, [links](url), @mentions
 */
export default function MarkdownRenderer({ content, className = '' }: MarkdownRendererProps) {
  const elements = parseMarkdown(content)

  return (
    <span className={className}>
      {elements}
    </span>
  )
}

function parseMarkdown(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = []

  // Handle code blocks first (```...```)
  const codeBlockRegex = /```(?:\w*\n)?([\s\S]*?)```/g
  const parts = text.split(codeBlockRegex)

  let isCodeBlock = false
  for (let i = 0; i < parts.length; i++) {
    if (i > 0) isCodeBlock = !isCodeBlock

    if (isCodeBlock) {
      nodes.push(
        <code
          key={`cb-${i}`}
          className="markdown-code-block"
        >
          {parts[i].trim()}
        </code>
      )
    } else {
      nodes.push(...parseInline(parts[i], i))
    }
  }

  return nodes
}

function parseInline(text: string, keyPrefix: number): React.ReactNode[] {
  if (!text) return []

  const tokens: React.ReactNode[] = []
  // Combined regex for all inline patterns
  const inlineRegex = /(\*\*(.+?)\*\*)|(\*(.+?)\*)|(`(.+?)`)|(~~(.+?)~~)|(\[([^\]]+)\]\(([^)]+)\))|(@\w+)/g

  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = inlineRegex.exec(text)) !== null) {
    // Add text before the match
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index))
    }

    const key = `${keyPrefix}-${match.index}`

    if (match[1]) {
      // **bold**
      tokens.push(<strong key={key} className="font-bold">{match[2]}</strong>)
    } else if (match[3]) {
      // *italic*
      tokens.push(<em key={key} className="italic">{match[4]}</em>)
    } else if (match[5]) {
      // `inline code`
      tokens.push(
        <code key={key} className="markdown-inline-code">
          {match[6]}
        </code>
      )
    } else if (match[7]) {
      // ~~strikethrough~~
      tokens.push(<del key={key} className="line-through opacity-60">{match[8]}</del>)
    } else if (match[9]) {
      // [text](url)
      tokens.push(
        <a
          key={key}
          href={match[11]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-400 hover:underline"
        >
          {match[10]}
        </a>
      )
    } else if (match[12]) {
      // @mention
      tokens.push(
        <span key={key} className="markdown-mention">
          {match[12]}
        </span>
      )
    }

    lastIndex = match.index + match[0].length
  }

  // Add remaining text
  if (lastIndex < text.length) {
    tokens.push(text.slice(lastIndex))
  }

  return tokens.length > 0 ? tokens : [text]
}
