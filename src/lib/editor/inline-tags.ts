import { TAG_TOKEN_REGEX } from "@shared/utils/tag-utils";
import { Extension } from "@tiptap/core";
import { type EditorState, Plugin, PluginKey } from "@tiptap/pm/state";
import { Decoration, DecorationSet } from "@tiptap/pm/view";

export interface ActiveTagQuery {
  query: string;
  from: number;
  to: number;
}

const ACTIVE_TAG_REGEX = /(?:^|\s)(#([a-zA-Z0-9_-]*))$/;

export function findActiveTagQuery(state: EditorState): ActiveTagQuery | null {
  const { selection } = state;
  if (!selection.empty) return null;

  const { $from } = selection;
  if (!$from.parent.isTextblock) return null;

  const textBefore = $from.parent.textBetween(0, $from.parentOffset, undefined, "\ufffc");
  const match = ACTIVE_TAG_REGEX.exec(textBefore);
  if (!match) return null;

  const hashToken = match[1] ?? "";
  const query = (match[2] ?? "").toLowerCase();

  return {
    query,
    from: $from.pos - hashToken.length,
    to: $from.pos
  };
}

function buildInlineTagDecorations(state: EditorState): DecorationSet {
  const decorations: Decoration[] = [];

  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) return;

    const text = node.text;
    TAG_TOKEN_REGEX.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = TAG_TOKEN_REGEX.exec(text)) !== null) {
      const leadingSpace = match[1] ?? "";
      const tagBody = match[2] ?? "";
      if (!tagBody) continue;

      const startInNode = match.index + leadingSpace.length;
      const from = pos + startInNode;
      const to = from + 1 + tagBody.length;

      // Also verify boundary across inline siblings (start of block or preceded by whitespace)
      if (startInNode === 0) {
        const $resolved = state.doc.resolve(from);
        const charBefore =
          $resolved.parentOffset > 0
            ? $resolved.parent.textBetween($resolved.parentOffset - 1, $resolved.parentOffset)
            : "";
        if (charBefore && !/\s/.test(charBefore)) {
          continue;
        }
      }

      decorations.push(
        Decoration.inline(from, to, {
          class: "journal-inline-tag"
        })
      );
    }
  });

  return DecorationSet.create(state.doc, decorations);
}

const inlineTagsPluginKey = new PluginKey("inlineTags");

export const InlineTags = Extension.create({
  name: "inlineTags",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: inlineTagsPluginKey,
        state: {
          init: (_config, state) => buildInlineTagDecorations(state),
          apply: (tr, oldSet, _oldState, newState) => {
            if (!tr.docChanged) return oldSet;
            return buildInlineTagDecorations(newState);
          }
        },
        props: {
          decorations: (state) => inlineTagsPluginKey.getState(state)
        }
      })
    ];
  }
});
