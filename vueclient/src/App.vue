<template>
  <router-view v-slot="{ Component }">
    <Transition name="fade" mode="in-out">
      <component :is="Component"></component>
    </Transition>
  </router-view>
</template>
