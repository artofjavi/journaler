<template>
  <div
    v-if="showScrollbar"
    class="custom-scrollbar"
    :class="{ 'scrollbar-isVisible': isVisible }"
    :style="{
      top: `${containerTop}px`,
      height: `${containerHeight}px`,
      right: `${containerRight}px`
    }"
    @mousedown="handleTrackClick"
    @mouseenter="handleMouseEnter">
    <div
      class="custom-scrollbar-thumb"
      :style="{ height: `${thumbHeight}px`, top: `${thumbTop}px` }"
      @mousedown.stop="handleThumbMouseDown" />
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";

// ------------------------ Props

const props = withDefaults(
  defineProps<{
    scrollContainer: HTMLElement | null;
    alignToViewport?: boolean;
  }>(),
  {
    alignToViewport: true
  }
);

// ------------------------ Variables

const scrollHeight = ref(0);
const clientHeight = ref(0);
const scrollTop = ref(0);
const containerTop = ref(0);
const containerHeight = ref(0);
const containerRight = ref(0);

const isDragging = ref(false);
const dragStartY = ref(0);
const dragStartScrollTop = ref(0);

const isVisible = ref(true);
let hideTimer: ReturnType<typeof setTimeout> | null = null;

let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let observedContainer: HTMLElement | null = null;

// ------------------------ Computed

const showScrollbar = computed(() => scrollHeight.value > clientHeight.value);

const thumbHeight = computed(() => {
  if (!showScrollbar.value) return 0;

  const ratio = clientHeight.value / scrollHeight.value;
  return Math.min(clientHeight.value, Math.max(clientHeight.value * ratio, 40));
});

const thumbTop = computed(() => {
  if (!showScrollbar.value) return 0;

  const maxScroll = scrollHeight.value - clientHeight.value;
  const maxThumbTop = clientHeight.value - thumbHeight.value;
  if (maxScroll <= 0 || maxThumbTop <= 0) return 0;

  const scrollRatio = scrollTop.value / maxScroll;
  return scrollRatio * maxThumbTop;
});

// ------------------------ Helpers

const resetHideTimer = () => {
  isVisible.value = true;

  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  hideTimer = setTimeout(() => {
    isVisible.value = false;
  }, 2000);
};

const updateScrollMetrics = () => {
  if (!props.scrollContainer) return;

  const rect = props.scrollContainer.getBoundingClientRect();

  scrollHeight.value = props.scrollContainer.scrollHeight;
  clientHeight.value = props.scrollContainer.clientHeight;
  scrollTop.value = props.scrollContainer.scrollTop;
  containerTop.value = rect.top;
  containerHeight.value = rect.height;

  if (props.alignToViewport) {
    containerRight.value = 8;
  } else {
    containerRight.value = window.innerWidth - rect.right + 8;
  }
};

// ------------------------ Event Handlers

const handleScroll = () => {
  updateScrollMetrics();
  resetHideTimer();
};

const handleWindowScroll = () => {
  updateScrollMetrics();
};

const handleMouseEnter = () => {
  resetHideTimer();
};

const handleTrackClick = (e: MouseEvent) => {
  if (!props.scrollContainer || clientHeight.value <= 0) return;

  const target = e.target as HTMLElement;
  if (target.classList.contains("custom-scrollbar-thumb")) return;

  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
  const clickY = e.clientY - rect.top;
  const clickRatio = clickY / clientHeight.value;
  const newScrollTop = clickRatio * scrollHeight.value;

  props.scrollContainer.scrollTo({
    top: newScrollTop,
    behavior: "smooth"
  });
};

const handleThumbMouseDown = (e: MouseEvent) => {
  isDragging.value = true;
  dragStartY.value = e.clientY;
  dragStartScrollTop.value = scrollTop.value;
  document.body.style.userSelect = "none";
  e.preventDefault();
};

const handleMouseMove = (e: MouseEvent) => {
  const container = props.scrollContainer;
  if (!isDragging.value || !container) return;

  const maxScroll = scrollHeight.value - clientHeight.value;
  const maxThumbTop = clientHeight.value - thumbHeight.value;
  if (maxScroll <= 0 || maxThumbTop <= 0) return;

  const deltaY = e.clientY - dragStartY.value;
  const scrollRatio = deltaY / maxThumbTop;
  const newScrollTop = dragStartScrollTop.value + scrollRatio * maxScroll;

  container.scrollTop = Math.max(0, Math.min(newScrollTop, maxScroll));
};

const handleMouseUp = () => {
  isDragging.value = false;
  document.body.style.userSelect = "";
};

const detachObservers = () => {
  if (observedContainer) {
    observedContainer.removeEventListener("scroll", handleScroll);
    observedContainer = null;
  }

  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }

  if (mutationObserver) {
    mutationObserver.disconnect();
    mutationObserver = null;
  }
};

const attachObservers = (container: HTMLElement) => {
  detachObservers();
  observedContainer = container;

  container.addEventListener("scroll", handleScroll);
  updateScrollMetrics();
  resetHideTimer();

  resizeObserver = new ResizeObserver(() => {
    updateScrollMetrics();
  });
  resizeObserver.observe(container);

  for (const child of container.children) {
    resizeObserver.observe(child);
  }

  mutationObserver = new MutationObserver(() => {
    updateScrollMetrics();
    resetHideTimer();
  });
  mutationObserver.observe(container, {
    childList: true,
    subtree: true,
    characterData: true
  });
};

// ------------------------ Lifecycle

onMounted(() => {
  if (props.scrollContainer) {
    attachObservers(props.scrollContainer);
  }

  document.addEventListener("mousemove", handleMouseMove);
  document.addEventListener("mouseup", handleMouseUp);
  window.addEventListener("scroll", handleWindowScroll);
  window.addEventListener("resize", updateScrollMetrics);
});

onBeforeUnmount(() => {
  if (hideTimer) {
    clearTimeout(hideTimer);
  }

  detachObservers();

  document.removeEventListener("mousemove", handleMouseMove);
  document.removeEventListener("mouseup", handleMouseUp);
  window.removeEventListener("scroll", handleWindowScroll);
  window.removeEventListener("resize", updateScrollMetrics);
});

// ------------------------ Watch

watch(
  () => props.scrollContainer,
  (newVal) => {
    if (newVal) {
      attachObservers(newVal);
    } else {
      detachObservers();
    }
  }
);
</script>

<style scoped>
.custom-scrollbar {
  position: fixed;
  width: 6px;
  z-index: 100;
  opacity: 0;
  transition: opacity 0.3s ease;
}

.custom-scrollbar.scrollbar-isVisible {
  opacity: 1;
}

.custom-scrollbar-thumb {
  position: absolute;
  right: 0;
  width: 3px;
  background-color: #c5c5c5;
  border-radius: 3px;
  transition: background-color 0.2s ease;
}

.dark .custom-scrollbar-thumb {
  background-color: #52525b;
}

.custom-scrollbar-thumb:hover {
  background-color: #a0a0a0;
}

.dark .custom-scrollbar-thumb:hover {
  background-color: #71717a;
}

.custom-scrollbar-thumb:active {
  background-color: #a0a0a0;
}

.dark .custom-scrollbar-thumb:active {
  background-color: #71717a;
}
</style>
