'use client'
import { useEffect, useRef } from 'react'
import * as THREE from 'three'

export default function ThreeBackground() {
  const mountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const mount = mountRef.current
    if (!mount) return

    const w = window.innerWidth
    const h = window.innerHeight

    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setSize(w, h)
    renderer.setClearColor(0x0a0a0f)
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    scene.fog = new THREE.FogExp2(0x0a0a0f, 0.08)

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100)
    camera.position.set(0, 3, 10)
    camera.lookAt(0, 0, 0)

    // 顶部聚光灯
    const spot = new THREE.SpotLight(0xffc878, 8)
    spot.position.set(0, 12, 0)
    spot.angle = Math.PI / 6
    spot.penumbra = 0.4
    spot.target.position.set(0, 0, 0)
    scene.add(spot)
    scene.add(spot.target)

    // 环境光（极暗）
    scene.add(new THREE.AmbientLight(0x111122, 0.3))

    // 地面
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(30, 30),
      new THREE.MeshStandardMaterial({ color: 0x0d0d1a, roughness: 1 })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -2
    scene.add(floor)

    // 远处山体
    const mountainMat = new THREE.MeshStandardMaterial({ color: 0x1a1030, roughness: 1 })
    const mountains = [
      { x: -6, z: -8, scale: 2.5 },
      { x: -3, z: -10, scale: 1.8 },
      { x: 4, z: -9, scale: 2.2 },
      { x: 7, z: -7, scale: 1.6 },
      { x: 0, z: -12, scale: 3 },
    ]
    mountains.forEach(({ x, z, scale }) => {
      const m = new THREE.Mesh(new THREE.ConeGeometry(scale, scale * 1.5, 5), mountainMat)
      m.position.set(x, -2 + (scale * 1.5) / 2, z)
      scene.add(m)
    })

    // 粒子
    const particleGeo = new THREE.BufferGeometry()
    const count = 200
    const positions = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 20
      positions[i * 3 + 1] = Math.random() * 4 - 2
      positions[i * 3 + 2] = (Math.random() - 0.5) * 20
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({ color: 0xffc878, size: 0.08, transparent: true, opacity: 0.5 })
    )
    scene.add(particles)

    // 动画
    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t = Date.now() * 0.001
      spot.intensity = 7 + Math.sin(t * 0.5) * 1.5
      particles.rotation.y = t * 0.02
      renderer.render(scene, camera)
    }
    animate()

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight
      camera.updateProjectionMatrix()
      renderer.setSize(window.innerWidth, window.innerHeight)
    }
    window.addEventListener('resize', onResize)

    return () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', onResize)
      mount.removeChild(renderer.domElement)
      renderer.dispose()
    }
  }, [])

  return (
    <div
      ref={mountRef}
      style={{
        position: 'fixed',
        top: 0, left: 0,
        width: '100vw', height: '100vh',
        zIndex: -1,
        pointerEvents: 'none',
      }}
    />
  )
}