import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/**
 * Renders model output as Markdown.
 *
 * GFM is enabled because live replies use tables. Safe by default:
 * react-markdown escapes raw HTML and we deliberately do not add rehype-raw,
 * so model text cannot inject markup into the page.
 */
export function Markdown({ children, className = "" }) {
  return (
    <div className={`md${className ? ` ${className}` : ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children: linkChildren, ...props }) => (
            <a href={href} target="_blank" rel="noreferrer" {...props}>
              {linkChildren}
            </a>
          ),
        }}
      >
        {String(children ?? "")}
      </ReactMarkdown>
    </div>
  );
}
