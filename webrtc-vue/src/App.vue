<template>
  <CallView />
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import CallView from './components/CallView.vue';

export default defineComponent({
  name: 'App',
  components: { CallView },
});
</script>
