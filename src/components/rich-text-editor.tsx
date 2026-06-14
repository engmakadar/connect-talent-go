import { useEditor, EditorContent, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useMemo } from "react";
import { Bold, Italic, Strikethrough, List, ListOrdered, Heading2, Heading3, Link2, Undo2, Redo2, Quote } from "lucide-react";
import DOMPurify from "isomorphic-dompurify";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  className?: string;
}

export function RichTextEditor({ value, onChange, placeholder, minHeight = 140, className }: Props) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3] } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: "text-primary underline" } }),
      Placeholder.configure({ placeholder: placeholder ?? "Write here…" }),
    ],
    content: value || "",
    immediatelyRender: false,
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm max-w-none focus:outline-none px-3 py-2 text-foreground",
          "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5",
          "[&_h2]:text-lg [&_h2]:font-semibold [&_h3]:text-base [&_h3]:font-semibold",
          "[&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic",
        ),
        style: `min-height: ${minHeight}px;`,
      },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });

  // Keep editor in sync when value resets externally
  useEffect(() => {
    if (!editor) return;
    if (value !== editor.getHTML()) editor.commands.setContent(value || "", { emitUpdate: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return <div className="rounded-md border border-input bg-white h-32 animate-pulse" />;

  return (
    <div className={cn("rounded-md border border-input bg-white overflow-hidden shadow-sm", className)}>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const Btn = ({ active, onClick, label, children }: { active?: boolean; onClick: () => void; label: string; children: React.ReactNode }) => (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "grid h-8 w-8 place-items-center rounded text-ink-soft hover:bg-secondary transition",
        active && "bg-primary/10 text-primary",
      )}
    >
      {children}
    </button>
  );
  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-input bg-secondary/40 px-1.5 py-1">
      <Btn label="Bold" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}><Bold className="h-4 w-4" /></Btn>
      <Btn label="Italic" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}><Italic className="h-4 w-4" /></Btn>
      <Btn label="Strikethrough" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}><Strikethrough className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn label="Heading 2" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}><Heading2 className="h-4 w-4" /></Btn>
      <Btn label="Heading 3" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}><Heading3 className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn label="Bulleted list" active={editor.isActive("bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()}><List className="h-4 w-4" /></Btn>
      <Btn label="Numbered list" active={editor.isActive("orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()}><ListOrdered className="h-4 w-4" /></Btn>
      <Btn label="Quote" active={editor.isActive("blockquote")} onClick={() => editor.chain().focus().toggleBlockquote().run()}><Quote className="h-4 w-4" /></Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn
        label="Link"
        active={editor.isActive("link")}
        onClick={() => {
          const prev = editor.getAttributes("link").href as string | undefined;
          const url = typeof window !== "undefined" ? window.prompt("URL", prev ?? "https://") : null;
          if (url === null) return;
          if (url === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
          else editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
        }}
      >
        <Link2 className="h-4 w-4" />
      </Btn>
      <span className="mx-1 h-5 w-px bg-border" />
      <Btn label="Undo" onClick={() => editor.chain().focus().undo().run()}><Undo2 className="h-4 w-4" /></Btn>
      <Btn label="Redo" onClick={() => editor.chain().focus().redo().run()}><Redo2 className="h-4 w-4" /></Btn>
    </div>
  );
}

/** Render sanitized HTML (read-only). Use for displaying rich-text content. */
export function RichTextView({ html, className }: { html: string | null | undefined; className?: string }) {
  const clean = useMemo(() => (html ? DOMPurify.sanitize(html, { USE_PROFILES: { html: true } }) : ""), [html]);
  if (!clean) return null;
  return (
    <div
      className={cn(
        "prose prose-sm max-w-none text-[15px] leading-relaxed text-ink/85",
        "[&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:my-1",
        "[&_h2]:text-lg [&_h2]:font-semibold [&_h2]:mt-3 [&_h3]:text-base [&_h3]:font-semibold",
        "[&_a]:text-primary [&_a]:underline",
        "[&_blockquote]:border-l-2 [&_blockquote]:border-primary [&_blockquote]:pl-3 [&_blockquote]:italic",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
