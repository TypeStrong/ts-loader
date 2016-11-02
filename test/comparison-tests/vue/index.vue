<template><p>hallo {{msg}}</p></template>
<script>
import component from './component.vue'
import {myMethod} from './helper'
export default {
  components: {component},
  data(): Object {
    return {
      msg: "world"
    }
  },
  method: {
    myMethod
  }
}
</script>
