<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import * as THREE from 'three'

const container = ref<HTMLDivElement | null>(null)
let scene: THREE.Scene
let camera: THREE.PerspectiveCamera
let renderer: THREE.WebGLRenderer
let globe: THREE.Mesh
let animId: number

onMounted(() => {
  if (!container.value) return
  const width = container.value.clientWidth || 400
  const height = container.value.clientHeight || 400

  scene = new THREE.Scene()
  camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000)
  camera.position.z = 2.5

  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true })
  renderer.setSize(width, height)
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.value.appendChild(renderer.domElement)

  const geometry = new THREE.SphereGeometry(1, 32, 24)
  const material = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    wireframe: true,
    transparent: true,
    opacity: 0.75,
  })
  globe = new THREE.Mesh(geometry, material)
  scene.add(globe)

  const animate = () => {
    animId = requestAnimationFrame(animate)
    globe.rotation.y += 0.005
    globe.rotation.x += 0.002
    renderer.render(scene, camera)
  }
  animate()
})

onBeforeUnmount(() => {
  cancelAnimationFrame(animId)
  if (renderer && renderer.domElement && container.value) {
    container.value.removeChild(renderer.domElement)
    renderer.dispose()
  }
})
</script>

<template>
  <div ref="container" class="w-full h-64 flex items-center justify-center"></div>
</template>
