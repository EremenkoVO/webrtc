<script setup lang="ts">
import { ref, computed } from 'vue'

const emit = defineEmits<{ (e: 'pick', emoji: string): void }>()

const searchQuery = ref('')
const activeCategory = ref(0)

const categories = [
  {
    icon: '😀',
    label: 'Смайлы',
    emojis: [
      '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩',
      '😘','😗','😚','😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐',
      '🤨','😐','😑','😶','😏','😒','🙄','😬','🤥','😌','😔','😪','🤤','😴','😷','🤒',
      '🤕','🤢','🤮','🤧','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸','😎','🤓','🧐',
      '😕','😟','🙁','☹️','😮','😯','😲','😳','🥺','😦','😧','😨','😰','😥','😢','😭',
      '😱','😖','😣','😞','😓','😩','😫','🥱','😤','😡','😠','🤬','😈','👿','💀','☠️',
      '💩','🤡','👹','👺','👻','👽','👾','🤖',
    ],
  },
  {
    icon: '👋',
    label: 'Жесты',
    emojis: [
      '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆',
      '🖕','👇','☝️','👍','👎','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','🙏',
      '✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🫀','🫁','🧠','🦷','🦴',
      '👀','👁️','👅','👄','💋','🩸',
    ],
  },
  {
    icon: '🐶',
    label: 'Животные',
    emojis: [
      '🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐻‍❄️','🐨','🐯','🦁','🐮','🐷','🐽',
      '🐸','🐵','🙈','🙉','🙊','🐒','🐔','🐧','🐦','🐤','🦆','🦅','🦉','🦇','🐺','🐗',
      '🐴','🦄','🐝','🐛','🦋','🐌','🐞','🐜','🦟','🦗','🦂','🐢','🐍','🦎','🦖','🦕',
      '🐙','🦑','🦐','🦞','🦀','🐡','🐠','🐟','🐬','🐳','🐋','🦈','🐊','🐅','🐆','🦓',
      '🦍','🦧','🦣','🐘','🦛','🦏','🐪','🐫','🦒','🦘','🦬','🐃','🐂','🐄','🐎','🐖',
      '🐏','🐑','🦙','🐐','🦌','🐕','🐩','🦮','🐕‍🦺','🐈','🐈‍⬛','🐓','🦃','🦤','🦚','🦜',
    ],
  },
  {
    icon: '🌺',
    label: 'Природа',
    emojis: [
      '🌸','💮','🏵️','🌹','🥀','🌺','🌻','🌼','🌷','🌱','🌲','🌳','🌴','🌵','🎄','🌾',
      '🍀','🍁','🍂','🍃','🍄','🌰','🦔','🐚','🪸','🌊','🌬️','🌀','🌈','🌂','☂️',
      '⛱️','⚡','❄️','☃️','⛄','🌤️','⛅','🌥️','🌦️','🌧️','⛈️','🌩️','🌨️','🌫️','🌪️',
      '🌡️','☀️','🌝','🌛','🌜','🌚','🌕','🌖','🌗','🌘','🌑','🌒','🌓','🌔','🌙','🌟',
      '⭐','🌠','🌌','☁️','⛅','🌤️','🔥','💧','🌊',
    ],
  },
  {
    icon: '🍕',
    label: 'Еда',
    emojis: [
      '🍎','🍐','🍊','🍋','🍌','🍍','🥭','🍓','🍒','🍑','🥝','🍅','🥥','🥑','🍆','🥔',
      '🥕','🌽','🌶️','🫑','🥒','🥬','🥦','🧄','🧅','🍄','🥜','🫘','🌰','🍞','🥐','🥖',
      '🫓','🥨','🥯','🧀','🥚','🍳','🧈','🥞','🧇','🥓','🥩','🍗','🍖','🦴','🌭','🍔',
      '🍟','🍕','🫔','🌮','🌯','🥙','🧆','🥚','🍿','🧂','🥫','🍱','🍘','🍙','🍚','🍛',
      '🍜','🍝','🍠','🍢','🍣','🍤','🍥','🥮','🍡','🥟','🦪','🍦','🍧','🍨','🍩','🍪',
      '🎂','🍰','🧁','🥧','🍫','🍬','🍭','🍮','🍯','🍼','🥛','☕','🫖','🍵','🧃','🥤',
      '🧋','🍶','🍺','🍻','🥂','🍷','🥃','🍸','🍹','🧉','🍾','🧊',
    ],
  },
  {
    icon: '⚽',
    label: 'Активность',
    emojis: [
      '⚽','🏀','🏈','⚾','🥎','🏐','🏉','🎾','🥏','🎳','🏏','🏑','🏒','🥍','🏓','🏸',
      '🥊','🥋','🎽','🛹','🛼','🛷','⛸️','🤺','⛷️','🏂','🪂','🏋️','🤼','🤸','⛹️','🤺',
      '🏇','🧘','🏄','🏊','🤽','🚣','🧗','🚴','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️',
      '🎯','🎱','🔫','🎮','🕹️','🎲','🧩','🃏','🀄','🎭','🎨','🖌️','🖍️','🎤','🎧',
      '🎼','🎹','🥁','🪘','🎷','🎺','🎸','🪕','🎻','🎬','🎤',
    ],
  },
  {
    icon: '🚀',
    label: 'Путешествия',
    emojis: [
      '🚗','🚕','🚙','🚌','🚎','🏎️','🚓','🚑','🚒','🚐','🛻','🚚','🚛','🚜','🏍️','🛵',
      '🛺','🚲','🛴','🛹','🛼','🚏','🛣️','🛤️','⛽','🚧','⚓','⛵','🛶','🚤','🛳️','⛴️',
      '🛥️','🚢','✈️','🛩️','🛫','🛬','🛰️','🚀','🛸','🚁','🛺','🪂','💺','🚡','🚠',
      '🚟','🚃','🚋','🚞','🚝','🚄','🚅','🚈','🚂','🚆','🚇','🚊','🚉','🛖','🏠','🏡',
      '🏢','🏣','🏤','🏥','🏦','🏨','🏩','🏪','🏫','🏭','🏗️','🧱','🗼','🗽','⛪','🕌',
      '🛕','🕍','⛩️','🗾','🎌','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏟️','🗺️',
    ],
  },
  {
    icon: '💡',
    label: 'Предметы',
    emojis: [
      '⌚','📱','💻','⌨️','🖥️','🖨️','🖱️','🖲️','💽','💾','💿','📀','📷','📸','📹','🎥',
      '📽️','🎞️','📞','☎️','📟','📠','📺','📻','🧭','⏱️','⏲️','⏰','🕰️','⌛','📡','🔋',
      '🔌','💡','🔦','🕯️','🪔','🧯','💰','💴','💵','💶','💷','💸','💳','🪙','💹','📈',
      '📉','📊','📋','📁','📂','🗂️','📄','📃','📑','📊','📝','📌','📍','🗺️','🔍','🔎',
      '🔏','🔐','🔒','🔓','🔑','🗝️','🔨','🪓','⛏️','⚒️','🛠️','🗡️','⚔️','🔧','🪛','🔩',
      '⚙️','🗜️','🔗','⛓️','🪤','🧲','🪜','🧰','🪣','🧪','🧫','🧬','🔬','🔭','📡','🩺',
      '💊','🩹','🩼','🩻','🚪','🛏️','🛋️','🪑','🚽','🚿','🛁','🪒','🧴','🪥','🧹','🧺',
    ],
  },
  {
    icon: '❤️',
    label: 'Символы',
    emojis: [
      '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕','💞','💓','💗','💖',
      '💘','💝','💟','☮️','✝️','☪️','🕉️','☸️','✡️','🔯','🕎','☯️','☦️','🛐','⛎','♈',
      '♉','♊','♋','♌','♍','♎','♏','♐','♑','♒','♓','🆔','⚕️','♻️','⚜️','🔰',
      '✅','❎','🆗','🆙','🆒','🆕','🆓','⛔','🚫','❌','⭕','🛑','💯','✨','🎉','🎊',
      '🎈','🎁','🎀','🎗️','🎟️','🎫','🏷️','🔔','🔕','🎵','🎶','💤','🔥','💥','💢','💦',
      '💨','💫','💬','💭','🗯️','💠','🔵','🟤','⚫','⚪','🟣','🔴','🟠','🟡','🟢','🔶',
      '🔷','🔸','🔹','🔺','🔻','💠','🔘','🔲','🔳','⬛','⬜','◼️','◻️','▪️','▫️',
    ],
  },
]

const filteredCategories = computed(() => {
  if (!searchQuery.value.trim()) return categories
  const q = searchQuery.value.toLowerCase()
  return categories
    .map((cat) => ({
      ...cat,
      emojis: cat.emojis.filter((e) => {
        // Simple substring match on the emoji itself — lets users type emoji chars
        return e.includes(q)
      }),
    }))
    .filter((cat) => cat.emojis.length > 0)
})

const searchResults = computed(() => {
  if (!searchQuery.value.trim()) return null
  return filteredCategories.value.flatMap((c) => c.emojis)
})

function pick(emoji: string) {
  emit('pick', emoji)
}
</script>

<template>
  <div
    class="w-72 bg-dc-bg-floating border border-dc-separator rounded-xl shadow-2xl overflow-hidden flex flex-col"
    @click.stop
  >
    <!-- Search -->
    <div class="px-3 pt-3 pb-2">
      <input
        v-model="searchQuery"
        type="text"
        placeholder="Поиск эмодзи..."
        class="w-full px-3 py-1.5 rounded-lg bg-dc-bg-tertiary text-dc-text text-sm placeholder-dc-text-muted outline-none focus:ring-1 focus:ring-dc-blurple/40 border border-dc-separator/50"
        autofocus
      />
    </div>

    <!-- Category tabs (hidden during search) -->
    <div v-if="!searchQuery" class="flex gap-0.5 px-2 pb-1 overflow-x-auto no-scrollbar">
      <button
        v-for="(cat, idx) in categories"
        :key="idx"
        @click="activeCategory = idx"
        :class="[
          'flex-shrink-0 w-8 h-8 flex items-center justify-center rounded-lg text-[16px] transition-colors',
          activeCategory === idx ? 'bg-dc-bg-active' : 'hover:bg-dc-bg-hover',
        ]"
        :title="cat.label"
      >
        {{ cat.icon }}
      </button>
    </div>

    <div class="h-px bg-dc-separator mx-3" />

    <!-- Category label -->
    <div
      v-if="!searchQuery"
      class="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wider text-dc-text-muted"
    >
      {{ categories[activeCategory].label }}
    </div>

    <!-- Emoji grid -->
    <div class="overflow-y-auto dc-scrollbar-thin px-2 pb-2" style="max-height: 220px">
      <!-- Search results -->
      <div v-if="searchResults" class="flex flex-wrap gap-0.5">
        <button
          v-for="emoji in searchResults"
          :key="emoji"
          @click="pick(emoji)"
          class="w-8 h-8 flex items-center justify-center rounded-lg text-[20px] hover:bg-dc-bg-hover transition-colors leading-none"
        >
          {{ emoji }}
        </button>
        <div v-if="searchResults.length === 0" class="w-full py-6 text-center text-dc-text-muted text-sm">
          Не найдено
        </div>
      </div>

      <!-- Category emojis -->
      <div v-else class="flex flex-wrap gap-0.5">
        <button
          v-for="emoji in categories[activeCategory].emojis"
          :key="emoji"
          @click="pick(emoji)"
          class="w-8 h-8 flex items-center justify-center rounded-lg text-[20px] hover:bg-dc-bg-hover transition-colors leading-none"
        >
          {{ emoji }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
