<template>
  <section class="card">
    <header class="card-header">
      <h2 class="card-title">Card</h2>
    </header>
    <div class="card-body" :class="{ active: isActive }" />
    <footer class="card-footer" :class="dynamicClass" />
  </section>
</template>

<script setup lang="ts">
const isActive = true
const dynamicClass = 'runtime-generated'
</script>
