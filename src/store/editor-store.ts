import { defineStore } from "pinia";
import { ref, shallowRef } from "vue";

export const useEditorStore = defineStore("editor", () => {
  const content = shallowRef<string | Record<string, unknown>>("");
  const focusRequestCount = ref(0);

  const setContent = (nextContent: string | Record<string, unknown>) => {
    content.value = nextContent;
  };

  const requestFocus = () => {
    focusRequestCount.value += 1;
  };

  return {
    content,
    setContent,
    focusRequestCount,
    requestFocus
  };
});
