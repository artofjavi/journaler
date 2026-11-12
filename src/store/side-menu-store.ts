import { useSlidePanelStore } from "@/store/slide-panel-store";
import { defineStore } from "pinia";
import { ref } from "vue";

export const useSideMenuStore = defineStore("side-menu", () => {
  const isVisible = ref(false);
  const slidePanelStore = useSlidePanelStore();

  const setIsVisible = (state: boolean) => {
    slidePanelStore.close();
    isVisible.value = state;
  };

  return { isVisible, setIsVisible };
});
