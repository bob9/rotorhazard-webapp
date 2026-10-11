import MarkdownIt from 'markdown-it'

// Plugins rely on raw HTML and links in their Markdown blocks (as the classic UI allowed).
const md = new MarkdownIt({ html: true, linkify: true, breaks: true })

export function renderMarkdown(src: string | null | undefined) {
  return src ? md.render(src) : ''
}
