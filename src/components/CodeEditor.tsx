import { useEffect, useRef } from 'react';
import { Compartment, EditorSelection, EditorState, type Extension } from '@codemirror/state';
import {
  EditorView,
  drawSelection,
  highlightActiveLine,
  highlightActiveLineGutter,
  highlightSpecialChars,
  keymap,
  lineNumbers,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentLess, indentMore } from '@codemirror/commands';
import {
  HighlightStyle,
  bracketMatching,
  ensureSyntaxTree,
  indentOnInput,
  indentUnit,
  syntaxHighlighting,
} from '@codemirror/language';
import { linter, lintGutter, type Diagnostic } from '@codemirror/lint';
import { autocompletion, closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { sql, SQLite } from '@codemirror/lang-sql';
import { tags as t } from '@lezer/highlight';
import type { Lang } from '../lib/tabs';

/** Optional editor help, each switched on in Settings. */
export interface EditorHelpers {
  liveLinting: boolean;
  autocomplete: boolean;
  closeBrackets: boolean;
}

interface Props {
  tabId: string;
  lang: Lang;
  code: string;
  helpers: EditorHelpers;
  /** Changes when the editor should take focus (e.g. a new tab was opened). */
  focusTick: number;
  onChange: (code: string) => void;
  onRun: () => void;
}

// Colours come from the CSS variables in styles.css, so the editor follows the theme tokens.
const editorTheme = EditorView.theme(
  {
    '&': { height: '100%', backgroundColor: 'var(--ed-bg)', color: 'var(--ed-ink)' },
    '.cm-scroller': { fontFamily: 'var(--font-code)', lineHeight: '1.6' },
    '.cm-content': { padding: '12px 0', caretColor: 'var(--ed-yellow)' },
    '.cm-line': { padding: '0 14px' },
    '.cm-gutters': { backgroundColor: 'var(--ed-gutter)', color: 'var(--ed-dim)', border: 'none' },
    '.cm-lineNumbers .cm-gutterElement': { padding: '0 10px 0 12px', minWidth: '44px' },
    '.cm-activeLine': { backgroundColor: 'rgba(255,255,255,0.035)' },
    '.cm-activeLineGutter': { backgroundColor: 'transparent', color: 'var(--ed-ink)' },
    '&.cm-focused .cm-cursor': { borderLeftColor: 'var(--ed-yellow)', borderLeftWidth: '2px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
      backgroundColor: 'rgba(127, 216, 180, 0.22) !important',
    },
    '&.cm-focused .cm-matchingBracket': { backgroundColor: 'rgba(242, 193, 78, 0.25)', outline: 'none' },
    '&.cm-focused': { outline: 'none' },
    '.cm-tooltip-autocomplete ul li[aria-selected]': { backgroundColor: 'var(--ed-line)', color: 'var(--ed-ink)' },
    '.cm-completionMatchedText': { textDecoration: 'none', color: 'var(--ed-yellow)' },
    '.cm-tooltip': { backgroundColor: 'var(--ed-gutter)', color: 'var(--ed-ink)', border: '1px solid var(--ed-line)' },
  },
  { dark: true },
);

const highlight = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword], color: '#C792EA' },
  { tag: [t.string, t.special(t.string)], color: '#A5E3A0' },
  { tag: [t.number, t.bool, t.null], color: '#F7A76C' },
  { tag: t.comment, color: 'var(--ed-dim)', fontStyle: 'italic' },
  { tag: [t.function(t.variableName), t.function(t.propertyName)], color: '#82AAFF' },
  { tag: t.definition(t.variableName), color: '#E6EBF5' },
  { tag: [t.className, t.typeName], color: '#FFCB6B' },
  { tag: [t.operator, t.compareOperator, t.arithmeticOperator], color: '#89DDFF' },
  { tag: [t.standard(t.variableName), t.self], color: '#F78C6C' },
  { tag: t.invalid, color: 'var(--ed-red)' },
]);

/** Tab: 4 spaces (or indent every selected line). Shift-Tab: un-indent. */
const tabKeymap = keymap.of([
  {
    key: 'Tab',
    run: (view) => {
      const multiLine = view.state.selection.ranges.some(
        (r) => view.state.doc.lineAt(r.from).number !== view.state.doc.lineAt(r.to).number,
      );
      if (multiLine) return indentMore(view);
      view.dispatch(view.state.replaceSelection('    '), { scrollIntoView: true, userEvent: 'input' });
      return true;
    },
    shift: indentLess,
  },
]);

/**
 * Live linting: underline the places the parser couldn't make sense of.
 * This only catches syntax errors (a missing colon, an unclosed bracket),
 * which is all we can know without running the code.
 */
const syntaxLinter = linter(
  (view) => {
    const { state } = view;
    const tree = ensureSyntaxTree(state, state.doc.length, 500);
    if (!tree) return [];
    const found: Diagnostic[] = [];
    tree.iterate({
      enter: (node) => {
        if (!node.type.isError) return;
        const len = state.doc.length;
        let from = Math.min(node.from, len);
        let to = Math.min(node.to, len);
        // Some errors have zero width (e.g. "something is missing here"); widen them by one character.
        if (from === to) {
          if (to < len) to++;
          else if (from > 0) from--;
          else return;
        }
        found.push({ from, to, severity: 'error', message: "Syntax error: this part doesn't follow the language's rules." });
      },
    });
    return found;
  },
  { delay: 600 },
);

function helperExtensions(h: EditorHelpers): Extension[] {
  const out: Extension[] = [];
  if (h.liveLinting) out.push(syntaxLinter, lintGutter());
  // Suggestions come from the language: Python keywords, built-ins and names in the file; SQL keywords.
  if (h.autocomplete) out.push(autocompletion({ icons: false }));
  if (h.closeBrackets) out.push(closeBrackets(), keymap.of(closeBracketsKeymap));
  return out;
}

function languageFor(lang: Lang): Extension {
  return lang === 'sql' ? sql({ dialect: SQLite }) : python();
}

export function CodeEditor({ tabId, lang, code, helpers, focusTick, onChange, onRun }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Each tab keeps its own editor state, so undo history and cursor survive tab switches.
  const statesRef = useRef(new Map<string, EditorState>());
  const tabIdRef = useRef(tabId);
  const languageConf = useRef(new Compartment());
  const helperConf = useRef(new Compartment());
  // The latest callbacks and settings, readable from inside CodeMirror without rebuilding it.
  const latest = useRef({ onChange, onRun, helpers });
  latest.current = { onChange, onRun, helpers };

  const makeState = (doc: string, language: Lang) =>
    EditorState.create({
      doc,
      selection: EditorSelection.cursor(0),
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        drawSelection(),
        indentOnInput(),
        bracketMatching(),
        highlightActiveLine(),
        indentUnit.of('    '),
        EditorState.tabSize.of(4),
        keymap.of([
          { key: 'Mod-Enter', run: () => (latest.current.onRun(), true), preventDefault: true },
        ]),
        tabKeymap,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        syntaxHighlighting(highlight),
        editorTheme,
        languageConf.current.of(languageFor(language)),
        helperConf.current.of(helperExtensions(latest.current.helpers)),
        EditorView.contentAttributes.of({ 'aria-label': 'Code editor' }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) latest.current.onChange(update.state.doc.toString());
        }),
      ],
    });

  // Create the editor once.
  useEffect(() => {
    const view = new EditorView({ state: makeState(code, lang), parent: hostRef.current! });
    viewRef.current = view;
    return () => view.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switching tabs: park the old tab's state, bring back (or create) the new one.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || tabIdRef.current === tabId) return;
    statesRef.current.set(tabIdRef.current, view.state);
    tabIdRef.current = tabId;
    const saved = statesRef.current.get(tabId);
    view.setState(saved && saved.doc.toString() === code ? saved : makeState(code, lang));
    // A parked state may have been made with different settings.
    view.dispatch({ effects: helperConf.current.reconfigure(helperExtensions(helpers)) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId]);

  // Turning a setting on or off.
  const { liveLinting, autocomplete, closeBrackets: autoClose } = helpers;
  useEffect(() => {
    viewRef.current?.dispatch({ effects: helperConf.current.reconfigure(helperExtensions(latest.current.helpers)) });
  }, [liveLinting, autocomplete, autoClose]);

  useEffect(() => {
    if (focusTick > 0) viewRef.current?.focus();
  }, [focusTick]);

  return <div className="editor-host" ref={hostRef} data-lang={lang} />;
}
