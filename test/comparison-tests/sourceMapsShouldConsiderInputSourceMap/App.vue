<template>
  <h1>Hello World!</h1>
</template>

<script lang="ts">
/* eslint-disable import/no-extraneous-dependencies */
import { defineComponent } from "vue";

export default defineComponent({
  components: {
  },
  async created() {
    console.log("Hello World!");
  },
});
</script>
