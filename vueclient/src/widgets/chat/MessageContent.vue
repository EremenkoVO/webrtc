<script setup lang="ts">
import { computed, ref } from 'vue'
import { parseLinks, type ParsedLink } from '@/shared/utils/linkParser'

const props = defineProps<{
  text: string
}>()

const parsedContent = computed(() => {
  return parseLinks(props.text)
})

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
    <template v-for="(segment, index) in parsedContent" :key="index">
      <!-- Plain text -->
      <span v-if="segment.type === 'text'">{{ segment.content }}</span>
      
      <!-- Regular link -->
      <a
        v-else-if="segment.type === 'link'"
        :href="segment.url"
        target="_blank"
        rel="noopener noreferrer"
        @click="openLink(segment.url!, $event)"
        class="underline break-all hover:underline"
        style="color: var(--color-dc-text-link);"
      >
        {{ segment.content }}
      </a>
      
      <!-- GIF image or fallback link -->
      <span v-else-if="segment.type === 'gif'" class="inline-block my-1 max-w-full">
        <img
          v-if="!failedGifs.has(segment.url!)"
          :src="segment.url"
          :alt="segment.content"
          class="max-w-full max-h-96 rounded-lg cursor-pointer hover:opacity-90 transition-opacity block"
          loading="lazy"
          @click="openLink(segment.url!, $event)"
          @error="handleGifError(segment.url!)"
        />
        <a
          v-else
          :href="segment.url"
          target="_blank"
          rel="noopener noreferrer"
          @click="openLink(segment.url!, $event)"
          class="underline break-all hover:underline inline-block"
          style="color: var(--color-dc-text-link);"
        >
          {{ segment.content }}
        </a>
      </span>
    </template>
  </span>
</template>
