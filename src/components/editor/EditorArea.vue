<template>
  <div class="flex h-full w-full flex-row justify-center pt-12">
    <TextEditor
      ref="textEditorRef"
      v-model="editorStore.content" />
  </div>
</template>

<script setup lang="ts">
import TextEditor from "@/components/editor/TextEditor.vue";
import { useEditorStore } from "@/store/editor-store";
import { ref } from "vue";

// ------------------------ Variables

const editorStore = useEditorStore();

// ------------------------ Editor Ref

const textEditorRef = ref<{ focusEnd: () => void } | null>(null);

const focusEnd = () => {
  textEditorRef.value?.focusEnd();
};

// ------------------------ Expose

defineExpose({
  focusEnd
});
</script>

<style scoped></style>
