<script setup lang="ts">
import { UserService, type UserProfile } from '@/api/index'
import ChannelComponent from '@/components/ChannelComponent.vue'
import SidebarComponent from '@/components/SidebarComponent.vue'
import { useApiErrors } from '@/composible/useApiErrors'
import router from '@/router'
import { useAuthStore } from '@/stores/authStore'
import { onMounted, ref, type Ref } from 'vue'

const { parseApiError } = useApiErrors()
const authStore = useAuthStore()

const selectedChannelId = ref<string | undefined>(undefined)
const user: Ref<UserProfile> = ref({ id: '', username: '' })

const getUser = async () => {
  try {
    const response = await UserService.getCurrentUser()

    if (
      typeof response === 'object' &&
      response !== null &&
      'id' in response &&
      'username' in response
    ) {
      user.value = response
    } else {
      throw { message: 'Invalid user data' }
    }
  } catch (e) {
    console.error(e)
    parseApiError(e)
    authStore.clearTokens()
    router.push({ name: 'Login' })
  }
}

function selectChannel(channelId: string) {
  selectedChannelId.value = channelId
}

onMounted(async () => {
  await getUser()
})
</script>

<template>
  <div class="flex h-screen">
    <SidebarComponent @channel-selected="selectChannel" :user="user" />
    <div class="flex-1 overflow-auto">
      <ChannelComponent :selectedChannelId="selectedChannelId" />
    </div>
  </div>
</template>
