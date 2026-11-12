import ImageBlockView from "@/components/editor/ImageBlockView.vue";
import { type JournalImage } from "@shared/types/journal-entry";
import { mergeAttributes, Node } from "@tiptap/core";
import { VueNodeViewRenderer } from "@tiptap/vue-3";

export const ImageBlock = Node.create({
  name: "imageBlock",
  group: "block",
  atom: true,
  draggable: false,
  selectable: true,

  addAttributes() {
    return {
      images: {
        default: [] as JournalImage[]
      }
    };
  },

  parseHTML() {
    return [
      {
        tag: "div[data-image-block]"
      }
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-image-block": "" })];
  },

  renderText() {
    return "";
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageBlockView);
  }
});
