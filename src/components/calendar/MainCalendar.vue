<template>
  <div
    class="flex h-auto w-auto flex-col items-start justify-between gap-1 rounded-md border-1 border-zinc-300 p-2 shadow dark:border-zinc-700">
    <!-- Header -->

    <div class="mb-2 flex h-10 w-full flex-row items-center justify-between gap-1">
      <!-- Previous Month -->

      <Button
        size="icon-sm"
        class="w-7"
        aria-label="Previous Month"
        variant="ghost"
        @click="handlePreviousPress">
        <IconChevronLeft class="size-6 cursor-pointer text-zinc-500 dark:text-zinc-400" />
      </Button>

      <!-- Month Select -->

      <Select
        :model-value="selectedMonthName"
        @update:model-value="handleMonthChange">
        <SelectTrigger
          size="sm"
          class="w-[4.5rem] text-xs dark:text-zinc-50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="month in monthNames"
            :key="month"
            :value="month">
            {{ month }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Year Select -->

      <Select
        :model-value="currentMonth.year.toString()"
        @update:model-value="handleYearChange">
        <SelectTrigger
          size="sm"
          class="w-[5rem] text-xs dark:text-zinc-50">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem
            v-for="year in yearOptions"
            :key="year"
            :value="year.toString()">
            {{ year }}
          </SelectItem>
        </SelectContent>
      </Select>

      <!-- Next Month -->

      <Button
        size="icon-sm"
        class="w-7"
        aria-label="Next Month"
        variant="ghost"
        @click="handleNextPress">
        <IconChevronRight class="size-6 cursor-pointer text-zinc-500 dark:text-zinc-400" />
      </Button>
    </div>

    <!-- Weekday Names -->

    <div class="mb-1 flex w-full flex-row items-center justify-between">
      <p
        v-for="(name, index) in weekdayNames"
        :key="index"
        class="w-7 text-center text-xs text-zinc-600 dark:text-zinc-400">
        {{ name }}
      </p>
    </div>

    <!-- Grid -->

    <div
      v-for="(week, index) in calendarGrid"
      :key="index"
      class="flex w-full flex-row items-center justify-between">
      <button
        v-for="date in week"
        :key="date.toString()"
        class="relative flex size-7 items-center justify-center rounded-sm text-xs"
        :class="getCellClasses(date)"
        :title="hasPhoto(date) && !isFutureDate(date) ? 'Contains photos' : undefined"
        @click="handleDatePress(date)">
        <span>{{ date.day }}</span>
        <span
          v-if="hasPhoto(date) && !isFutureDate(date)"
          aria-hidden="true"
          class="pointer-events-none absolute bottom-[3px] h-[2px] w-2.5 rounded-full"
          :class="
            isSelected(date)
              ? 'bg-white/90 dark:bg-zinc-950/85'
              : isToday(date)
                ? 'bg-[rgb(var(--accent-today-fg)/0.9)]'
                : isCurrentMonth(date)
                  ? 'bg-[rgb(var(--accent-entry-fg)/0.85)] dark:bg-[rgb(var(--accent-entry-dark-fg)/0.85)]'
                  : 'bg-[rgb(var(--accent-700))] dark:bg-[rgb(var(--accent-300))]'
          " />
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { CalendarDate, getDayOfWeek, getLocalTimeZone } from "@internationalized/date";
import { isFutureDate as isFutureDateLib, isToday as isTodayLib } from "@shared/utils/date-utils";
import type { AcceptableValue } from "reka-ui";
import { computed, type PropType, ref, watch } from "vue";
import IconChevronLeft from "~icons/mdi/chevron-left";
import IconChevronRight from "~icons/mdi/chevron-right";

// ------------------------ Props

const props = defineProps({
  entryDates: {
    type: Array as PropType<Date[]>,
    default: () => []
  },
  photoDates: {
    type: Array as PropType<Date[]>,
    default: () => []
  },
  currentDate: {
    type: Object as PropType<Date | null>,
    default: null
  }
});

// ------------------------ Emits

const emit = defineEmits(["dateSelected"]);

// ------------------------ Variables

const initialNow = new Date();
const currentMonth = ref<CalendarDate>(
  new CalendarDate(initialNow.getFullYear(), initialNow.getMonth() + 1, 1)
);

const selectedDate = ref<CalendarDate | null>(null);

const weekdayNames: string[] = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

const monthNames: string[] = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

// Sync selectedDate and currentMonth with currentDate prop
watch(
  () => props.currentDate,
  (newDate) => {
    if (newDate) {
      const newCalendarDate = new CalendarDate(
        newDate.getFullYear(),
        newDate.getMonth() + 1, // Date months are 0-indexed, CalendarDate months are 1-indexed
        newDate.getDate()
      );
      selectedDate.value = newCalendarDate;

      // Update calendar month if the selected date is in a different month/year
      if (
        currentMonth.value.month !== newCalendarDate.month ||
        currentMonth.value.year !== newCalendarDate.year
      ) {
        currentMonth.value = new CalendarDate(newCalendarDate.year, newCalendarDate.month, 1);
      }
    } else {
      selectedDate.value = null;
    }
  },
  { immediate: true }
);

// ------------------------ Computed

const calendarGrid = computed(() => {
  const weeks: CalendarDate[][] = [];
  const firstOfMonth = new CalendarDate(currentMonth.value.year, currentMonth.value.month, 1);
  const dayOfWeek = getDayOfWeek(firstOfMonth, "en-US");

  let currentDate = firstOfMonth.subtract({ days: dayOfWeek });

  for (let week = 0; week < 6; week++) {
    const weekDays: CalendarDate[] = [];

    for (let day = 0; day < 7; day++) {
      weekDays.push(currentDate);
      currentDate = currentDate.add({ days: 1 });
    }

    weeks.push(weekDays);
  }

  return weeks;
});

const selectedMonthName = computed(() => {
  return monthNames[currentMonth.value.month - 1];
});

const yearOptions = computed(() => {
  const currentYear = currentMonth.value.year;
  const years: number[] = [];

  for (let i = currentYear - 10; i <= currentYear + 10; i++) {
    years.push(i);
  }

  return years;
});

// ------------------------ Functions

const getCellClasses = (date: CalendarDate) => {
  const selected = isSelected(date);
  const future = isFutureDate(date);
  const today = isToday(date);
  const currentMonth = isCurrentMonth(date);
  const hasEntryInCurrentMonth = hasEntryCurrentMonth(date);
  const hasEntryInOtherMonth = hasEntryNotCurrentMonth(date);

  // Future dates are disabled
  if (future) {
    return "!text-zinc-300/75 dark:!text-zinc-600/75 hover:bg-transparent";
  }

  // Selected date gets zinc background
  if (selected) {
    return "bg-zinc-700 dark:bg-zinc-400 dark:text-zinc-950 text-white hover:bg-zinc-600 dark:hover:bg-zinc-300";
  }

  // Today gets solid accent background
  if (today) {
    return "calendar-today";
  }

  // All dates with entries share the same accent color set in settings
  if (hasEntryInCurrentMonth) {
    return "calendar-entry-current font-semibold";
  }

  if (hasEntryInOtherMonth) {
    return "calendar-entry-other text-zinc-600 dark:text-zinc-400 font-base";
  }

  // Default styling based on whether it's in current month
  if (currentMonth) {
    return "text-zinc-800 dark:text-zinc-200 font-semibold hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50";
  }

  return "text-zinc-400 dark:text-zinc-600 font-base hover:bg-zinc-200/50 dark:hover:bg-zinc-700/50";
};

const getDate = (date: CalendarDate) => {
  return date.toDate(getLocalTimeZone());
};

const isSameCalendarDay = (a: Date, b: Date) => {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
};

const isToday = (date: CalendarDate) => {
  return isTodayLib(getDate(date));
};

const isCurrentMonth = (date: CalendarDate) => {
  return date.month === currentMonth.value.month;
};

const hasEntry = (date: CalendarDate) => {
  const converted = getDate(date);

  return props.entryDates.some((d) => isSameCalendarDay(d, converted));
};

const hasEntryCurrentMonth = (date: CalendarDate) => {
  return hasEntry(date) && isCurrentMonth(date);
};

const hasEntryNotCurrentMonth = (date: CalendarDate) => {
  return hasEntry(date) && !isCurrentMonth(date);
};

const hasPhoto = (date: CalendarDate) => {
  const converted = getDate(date);

  return props.photoDates.some((d) => isSameCalendarDay(d, converted));
};

const isSelected = (date: CalendarDate) => {
  if (!selectedDate.value) {
    return false;
  }

  return date.compare(selectedDate.value) === 0;
};

const isFutureDate = (date: CalendarDate) => {
  return isFutureDateLib(getDate(date));
};

const handlePreviousPress = () => {
  currentMonth.value = currentMonth.value.subtract({ months: 1 });
};

const handleNextPress = () => {
  currentMonth.value = currentMonth.value.add({ months: 1 });
};

const handleMonthChange = (monthName: AcceptableValue) => {
  if (!monthName || typeof monthName !== "string") return;
  const monthIndex = monthNames.indexOf(monthName) + 1;
  currentMonth.value = new CalendarDate(currentMonth.value.year, monthIndex, 1);
};

const handleYearChange = (year: AcceptableValue) => {
  if (!year) return;
  const yearValue = typeof year === "string" ? parseInt(year) : Number(year);
  currentMonth.value = new CalendarDate(yearValue, currentMonth.value.month, 1);
};

const handleDatePress = (date: CalendarDate) => {
  if (!isFutureDate(date)) {
    selectedDate.value = date;
    emit("dateSelected", date);
  }
};
</script>

<style scoped></style>
