<script setup lang="ts">
import { useI18n } from 'vue-i18n'
import { setLocale, SUPPORTED_LOCALES, type SupportedLocale } from '@/shared/i18n'

const { locale } = useI18n()

const labels: Record<SupportedLocale, string> = {
  en: 'EN',
  ru: 'RU',
}

function switchLocale() {
  const currentIndex = SUPPORTED_LOCALES.indexOf(locale.value as SupportedLocale)
  const nextIndex = (currentIndex + 1) % SUPPORTED_LOCALES.length
  const next = SUPPORTED_LOCALES[nextIndex]
  setLocale(next)
}
</script>

<template>
  <button
    type="button"
    @click="switchLocale"
    class="w-8 h-8 rounded flex items-center justify-center text-dc-text-muted hover:text-dc-text hover:bg-dc-bg-hover transition-colors text-xs font-semibold"
    :title="$t('common.language')"
  >
    {{ labels[locale as SupportedLocale] || 'EN' }}
  </button>
</template>
