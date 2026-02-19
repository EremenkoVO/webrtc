<script setup lang="ts">
defineProps<{
  name: string
  conditionShow: boolean
  speaking: boolean
}>()
</script>

<template>
  <div
    :class="[
      'absolute flex items-center top-2 left-2 bg-dc-bg-floating/80 backdrop-blur-sm px-2 py-1 rounded text-xs transition-all duration-200 gap-1.5 z-20',
      speaking ? 'ring-2 ring-dc-green/60' : '',
    ]"
  >
    <!-- Muted mic icon -->
    <font-awesome-icon
      v-if="conditionShow"
      icon="microphone-slash"
      class="text-[11px] text-dc-red flex-shrink-0"
    />

    <span class="truncate max-w-[160px] text-dc-text">{{ name }}</span>

    <!-- Speaking indicator -->
    <font-awesome-icon
      v-if="speaking"
      icon="microphone"
      class="text-[11px] text-dc-green flex-shrink-0 animate-pulse"
    />
  </div>
</template>
