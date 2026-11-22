import { useEffect, useRef } from 'react';

/**
 * A deliberately small rich-text editor — DESIGN.md §6.7: "a simple content
 * editor for readable text, links and basic formatting, not a full complex
 * rich-text suite".
 *
 * It offers exactly what the server's sanitiser keeps (bold, italic, a heading,
 * lists, links), so nothing the admin formats is silently lost on save. The
 * browser's editing commands produce somewhat messy HTML (`<b>`, `<div>`); the
 * server normalises it (`server/src/lib/sanitize.ts`), which is the only
 * cleaning that matters for safety.
 *
 * **Paste is plain text.** Pasting from Word or WhatsApp Web would otherwise
 * bring fonts, colours and hidden markup the sanitiser would then have to
 * strip, leaving the admin wondering where the formatting went.
 */

export interface RichTextEditorProps {
  id: string;
  labelId: string;
  /** Initial HTML. The editor is uncontrolled after mount, so typing never jumps the cursor. */
  initialHtml: string;
  onChange: (html: string) => void;
  error?: string;
  describedBy?: string;
}

interface ToolProps {
  label: string;
  command: string;
  value?: string;
  children: React.ReactNode;
  onRun: (command: string, value?: string) => void;
}

function Tool({ label, command, value, children, onRun }: ToolProps) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      // Keep the selection in the editor when the toolbar is clicked.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => onRun(command, value)}
      className="min-h-9 min-w-9 rounded-[var(--radius-control)] px-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
    >
      {children}
    </button>
  );
}

export function RichTextEditor({ id, labelId, initialHtml, onChange, error, describedBy }: RichTextEditorProps) {
  const ref = useRef<HTMLDivElement>(null);

  // Set the starting content once. Re-setting innerHTML on every change would
  // reset the caret to the start while the admin types.
  useEffect(() => {
    if (ref.current) ref.current.innerHTML = initialHtml;
    // Enter starts a new <p> rather than a <div>, matching what is stored.
    document.execCommand('defaultParagraphSeparator', false, 'p');
  }, []); // Intentionally once: see above.

  function emit() {
    onChange(ref.current?.innerHTML ?? '');
  }

  function run(command: string, value?: string) {
    ref.current?.focus();
    // `execCommand` is deprecated but remains the only built-in way to apply
    // formatting to a selection in every browser, and is all this editor needs.
    document.execCommand(command, false, value);
    emit();
  }

  function addLink() {
    const url = window.prompt('Link address (starting with https://)', 'https://');
    if (!url || url === 'https://') return;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(url.trim())) {
      window.alert('Links must start with https://, http://, mailto: or tel:');
      return;
    }
    run('createLink', url.trim());
  }

  function onPaste(event: React.ClipboardEvent<HTMLDivElement>) {
    event.preventDefault();
    document.execCommand('insertText', false, event.clipboardData.getData('text/plain'));
    emit();
  }

  return (
    <div
      className={
        'rounded-[var(--radius-control)] border bg-surface ' + (error ? 'border-danger' : 'border-line focus-within:border-brand/60')
      }
    >
      <div role="toolbar" aria-label="Formatting" aria-controls={id} className="flex flex-wrap gap-1 border-b border-line p-1">
        <Tool label="Bold" command="bold" onRun={run}>
          <strong>B</strong>
        </Tool>
        <Tool label="Italic" command="italic" onRun={run}>
          <em>I</em>
        </Tool>
        <Tool label="Heading" command="formatBlock" value="h2" onRun={run}>
          H
        </Tool>
        <Tool label="Normal text" command="formatBlock" value="p" onRun={run}>
          ¶
        </Tool>
        <Tool label="Bulleted list" command="insertUnorderedList" onRun={run}>
          • List
        </Tool>
        <Tool label="Numbered list" command="insertOrderedList" onRun={run}>
          1. List
        </Tool>
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={addLink}
          className="min-h-9 rounded-[var(--radius-control)] px-2 text-sm font-medium text-brand-dark hover:bg-brand-soft"
        >
          Link
        </button>
        <Tool label="Remove link" command="unlink" onRun={run}>
          Unlink
        </Tool>
      </div>
      <div
        id={id}
        ref={ref}
        role="textbox"
        aria-multiline="true"
        aria-labelledby={labelId}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        contentEditable
        suppressContentEditableWarning
        onInput={emit}
        onBlur={emit}
        onPaste={onPaste}
        className="rich-text min-h-48 px-3 py-2 text-base text-ink focus-visible:outline-none"
      />
    </div>
  );
}
