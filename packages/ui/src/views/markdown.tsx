import Markdown from 'react-markdown';
import { urlReferenceSchema } from '@linuxcast/contracts';
export function safeLink(value: string): string | null {
  const result = urlReferenceSchema.safeParse({ kind: 'url', url: value });
  return result.success ? result.data.url : null;
}
/** No HTML, remote image loads, plugins, automatic navigation or executable code. */
export function SafeMarkdown({ text, openLink }: { text: string; openLink?: ((url: string) => void) | undefined }) {
  return <div className="lc-markdown"><Markdown skipHtml allowedElements={['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'em', 'strong', 'code', 'pre', 'blockquote', 'ul', 'ol', 'li', 'hr', 'br', 'a']}
    urlTransform={value => safeLink(value) ?? ''} components={{ a: ({ href, children }) => href && openLink ?
      <a role="link" tabIndex={0} onClick={() => openLink(href)} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); openLink(href); } }}>{children}</a> : <span>{children}</span> }}>{text}</Markdown></div>;
}
