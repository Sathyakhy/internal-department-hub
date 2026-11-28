import React, { useEffect, useRef } from 'react';
import {
  Bold,
  Heading2,
  Italic,
  List,
  ListOrdered,
  RemoveFormatting,
  Underline,
} from 'lucide-react';
import { sanitizeLessonHtml, stripHtmlToText } from '../../utils/sanitizeHtml';

interface RichTextLessonEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

export const RichTextLessonEditor: React.FC<RichTextLessonEditorProps> = ({
  value,
  onChange,
  placeholder = 'Write formatted lesson guidance, headings, and checklists...',
}) => {
  const editorRef = useRef<HTMLDivElement>(null);
  const lastEmittedRef = useRef<string>('');

  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const normalized = sanitizeLessonHtml(value);
    if (normalized !== lastEmittedRef.current && el.innerHTML !== normalized) {
      el.innerHTML = normalized;
      lastEmittedRef.current = normalized;
    }
  }, [value]);

  const emitCleanHtml = () => {
    const el = editorRef.current;
    if (!el) return;
    const clean = stripHtmlToText(el.innerHTML).length === 0 ? '' : sanitizeLessonHtml(el.innerHTML);
    lastEmittedRef.current = clean;
    onChange(clean);
  };

  const runCommand = (command: string, commandValue?: string) => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand(command, false, commandValue);
    emitCleanHtml();
  };

  const toggleHeading = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    const currentBlock = document.queryCommandValue('formatBlock').toLowerCase();
    document.execCommand('formatBlock', false, currentBlock === 'h2' ? 'p' : 'h2');
    emitCleanHtml();
  };

  const clearFormatting = () => {
    const el = editorRef.current;
    if (!el) return;
    el.focus();
    document.execCommand('removeFormat', false);
    document.execCommand('formatBlock', false, 'p');
    emitCleanHtml();
  };

  const isEmpty = stripHtmlToText(value).length === 0;

  return (
    <div className="rounded-lg border border-neutral-200 dark:border-zinc-800 bg-white dark:bg-black overflow-hidden">
      <div
        role="toolbar"
        aria-label="Lesson formatting toolbar"
        className="flex flex-wrap items-center gap-1 px-2 py-1.5 border-b border-neutral-200 dark:border-zinc-800 bg-neutral-50 dark:bg-[#0A0A0C]"
      >
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand('bold');
          }}
          title="Bold"
          aria-label="Bold"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <Bold className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand('italic');
          }}
          title="Italic"
          aria-label="Italic"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <Italic className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand('underline');
          }}
          title="Underline"
          aria-label="Underline"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <Underline className="h-3.5 w-3.5" />
        </button>

        <span className="h-4 w-px bg-neutral-200 dark:bg-zinc-800 mx-0.5" />

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            toggleHeading();
          }}
          title="Heading"
          aria-label="Toggle heading"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <Heading2 className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand('insertUnorderedList');
          }}
          title="Bulleted list"
          aria-label="Bulleted list"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <List className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            runCommand('insertOrderedList');
          }}
          title="Numbered list"
          aria-label="Numbered list"
          className="p-1.5 rounded text-neutral-700 dark:text-neutral-300 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <ListOrdered className="h-3.5 w-3.5" />
        </button>

        <span className="h-4 w-px bg-neutral-200 dark:bg-zinc-800 mx-0.5" />

        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault();
            clearFormatting();
          }}
          title="Clear formatting"
          aria-label="Clear formatting"
          className="p-1.5 rounded text-neutral-600 dark:text-neutral-400 hover:bg-neutral-200/70 dark:hover:bg-zinc-800 transition-colors"
        >
          <RemoveFormatting className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="relative">
        {isEmpty && (
          <div className="pointer-events-none absolute inset-x-3 top-2.5 text-xs text-neutral-400 dark:text-neutral-500">
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          onInput={emitCleanHtml}
          onBlur={emitCleanHtml}
          className="lms-rich-text min-h-[120px] max-h-[300px] overflow-y-auto px-3 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none"
        />
      </div>
    </div>
  );
};
