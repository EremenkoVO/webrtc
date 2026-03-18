<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseMessage } from '@/shared/utils/messageParser'

const props = defineProps<{ text: string }>()

const segments = computed(() => parseMessage(props.text))

const failedGifs = ref<Set<string>>(new Set())

function openLink(url: string, event: MouseEvent) {
  event.preventDefault()
  window.open(url, '_blank', 'noopener,noreferrer')
}

function handleGifError(url: string) {
  failedGifs.value.add(url)
}
</script>

<template>
  <span class="inline">
    <template v-for="(seg, i) in segments" :key="i">
      <!-- Plain text -->
      <span v-if="seg.type === 'text'">{{ seg.content }}</span>

      <!-- Bold -->
      <strong v-else-if="seg.type === 'bold'" class="font-semibold text-dc-text-heading">{{
        seg.content
      }}</strong>

      <!-- Italic -->
      <em v-else-if="seg.type === 'italic'" class="italic">{{ seg.content }}</em>

      <!-- Strikethrough -->
      <s v-else-if="seg.type === 'strike'" class="opacity-70">{{ seg.content }}</s>

      <!-- Inline code -->
      <code
        v-else-if="seg.type === 'code'"
        class="px-1 py-px rounded text-[0.875em] font-mono bg-dc-bg-tertiary text-dc-text border border-dc-separator/50"
        >{{ seg.content }}</code
      >

      <!-- Code block -->
      <span v-else-if="seg.type === 'codeblock'" class="block my-1">
        <code
          class="block w-full px-3 py-2.5 rounded-lg font-mono text-[0.85em] leading-relaxed bg-dc-bg-tertiary text-dc-text border border-dc-separator/40 whitespace-pre overflow-x-auto"
          >{{ seg.content }}</code
        >
      </span>

      <!-- Regular link -->
      <a
        v-else-if="seg.type === 'link'"
        :href="seg.url"
        target="_blank"
        rel="noopener noreferrer"
        @click="openLink(seg.url, $event)"
        class="underline break-all hover:underline"
        style="color: var(--color-dc-text-link)"
        >{{ seg.content }}</a
      >

      <!-- GIF / fallback link -->
      <span v-else-if="seg.type === 'gif'" class="inline-block my-1 max-w-full">
        <img
          v-if="!failedGifs.has(seg.url)"
          :src="seg.url"
          :alt="seg.content"
          class="max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-90 transition-opacity block"
          loading="lazy"
          @click="openLink(seg.url, $event)"
          @error="handleGifError(seg.url)"
        />
        <a
          v-else
          :href="seg.url"
          target="_blank"
          rel="noopener noreferrer"
          @click="openLink(seg.url, $event)"
          class="underline break-all hover:underline inline-block"
          style="color: var(--color-dc-text-link)"
          >{{ seg.content }}</a
        >
      </span>
    </template>
  </span>
</template>
