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

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false })
    renderer.setSize(w, h)
    renderer.setClearColor(0x0a0a0f)
    renderer.domElement.style.position = 'fixed'
    renderer.domElement.style.top = '0'
    renderer.domElement.style.left = '0'
    renderer.domElement.style.width = '100%'
    renderer.domElement.style.height = '100%'
    renderer.domElement.style.zIndex = '-1'
    renderer.domElement.style.pointerEvents = 'none'
    mount.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    // 天空背景色 - 蓝黑色，带天边辉光
    scene.background = new THREE.Color(0x0a0a1a)
    scene.fog = new THREE.FogExp2(0x0a0a1a, 0.015)

    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100)
    camera.position.set(0, 0.8, 12)
    camera.lookAt(0, 0.5, -5)

    // 从正上方打下来的聚焦明亮白黄色聚光灯
    const spotLight = new THREE.SpotLight(0xfff4e0, 120)
    spotLight.position.set(0, 25, 0)
    spotLight.angle = Math.PI / 8
    spotLight.penumbra = 0.3
    spotLight.decay = 2
    spotLight.distance = 40
    spotLight.castShadow = true
    spotLight.target.position.set(0, 0, 0)
    scene.add(spotLight)
    scene.add(spotLight.target)

    // 环境光（提高亮度，让山体和植物可见）
    scene.add(new THREE.AmbientLight(0x3a3a5a, 0.8))

    // 天边辉光 - 半球光
    const hemiLight = new THREE.HemisphereLight(0x2a4a6a, 0x0a0a1a, 0.4)
    scene.add(hemiLight)

    // 地面（深色 #0a0a0f，接收聚光灯照射）
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(60, 60, 32, 32),
      new THREE.MeshStandardMaterial({
        color: 0x0a0a0f,
        roughness: 0.8,
        metalness: 0.2
      })
    )
    floor.rotation.x = -Math.PI / 2
    floor.position.y = -0.5
    floor.receiveShadow = true
    scene.add(floor)

    // 地面上的连绵山体 - 自然流畅，高低胖瘦不同，散布在前后远近
    const mountainMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a1a,
      roughness: 0.9,
      metalness: 0.1,
      emissive: 0x050510,
      emissiveIntensity: 0.3
    })

    // 创建自然山体（混合尖峰和圆润山形）
    const mountains = [
      // 左侧远景
      { x: -18, z: -25, radius: 5, height: 8, segments: 20, roundTop: true },
      { x: -14, z: -22, radius: 3, height: 6, segments: 16, roundTop: false },
      { x: -10, z: -18, radius: 4.5, height: 7, segments: 18, roundTop: true },
      { x: -6, z: -15, radius: 2.5, height: 4, segments: 16, roundTop: false },

      // 中央远景
      { x: -2, z: -28, radius: 6, height: 10, segments: 24, roundTop: true },
      { x: 2, z: -24, radius: 4, height: 7.5, segments: 18, roundTop: false },
      { x: 0, z: -20, radius: 3.5, height: 6, segments: 16, roundTop: true },

      // 右侧远景
      { x: 6, z: -16, radius: 3, height: 5, segments: 16, roundTop: false },
      { x: 10, z: -19, radius: 4.5, height: 8, segments: 20, roundTop: true },
      { x: 14, z: -23, radius: 3.5, height: 6.5, segments: 18, roundTop: false },
      { x: 18, z: -26, radius: 5.5, height: 9, segments: 22, roundTop: true },

      // 近景小山丘
      { x: -8, z: -10, radius: 2, height: 3, segments: 16, roundTop: true },
      { x: 8, z: -12, radius: 2.2, height: 3.5, segments: 16, roundTop: true },
      { x: -4, z: -8, radius: 1.8, height: 2.5, segments: 16, roundTop: true },
      { x: 4, z: -9, radius: 1.5, height: 2.8, segments: 16, roundTop: true },
    ]

    mountains.forEach(({ x, z, radius, height, segments, roundTop }) => {
      let geo
      if (roundTop) {
        // 圆润山形 - 使用球体的下半部分
        geo = new THREE.SphereGeometry(radius, segments, segments / 2, 0, Math.PI * 2, 0, Math.PI / 2)
        const mesh = new THREE.Mesh(geo, mountainMat)
        mesh.position.set(x, -0.5, z)
        mesh.scale.y = height / radius
        scene.add(mesh)
      } else {
        // 尖峰山形 - 使用圆锥体
        geo = new THREE.ConeGeometry(radius, height, segments)
        const mesh = new THREE.Mesh(geo, mountainMat)
        mesh.position.set(x, -0.5 + height / 2, z)
        scene.add(mesh)
      }
    })

    // 基础植物材质 - 深色偏暗，不再是亮绿色
    const baseFoliageMat = new THREE.MeshStandardMaterial({
      color: 0x1a2820,
      roughness: 0.85,
      metalness: 0.1,
      emissive: 0x0a1510,
      emissiveIntensity: 0.2
    })

    // 创建一棵随机形状的植物（主干 + 多根枝条 + 随机叶簇）
    function createPlant(x: number, z: number, scale: number) {
      const plant = new THREE.Group()

      // 单棵树的局部颜色变化（深色系，不要亮绿）
      const hueShift = (Math.random() - 0.5) * 0.08
      const darken = 0.6 + Math.random() * 0.3
      const treeColor = new THREE.Color(0x1a2820)
      treeColor.offsetHSL(hueShift, -0.2, -(1 - darken) * 0.3)
      const treeMat = baseFoliageMat.clone()
      treeMat.color = treeColor
      treeMat.emissive = new THREE.Color(treeColor).multiplyScalar(0.5)

      // 主干 - 细长，有轻微随机倾斜
      const trunkTiltX = (Math.random() - 0.5) * 0.15
      const trunkTiltZ = (Math.random() - 0.5) * 0.15
      const trunkHeight = (1.8 + Math.random() * 1.2) * scale
      const trunkBottom = 0.12 * scale + Math.random() * 0.06 * scale
      const trunkTop = 0.07 * scale + Math.random() * 0.04 * scale
      const trunkGeo = new THREE.CylinderGeometry(trunkTop, trunkBottom, trunkHeight, 8)
      const trunk = new THREE.Mesh(trunkGeo, treeMat)
      trunk.position.y = -0.5 + trunkHeight / 2
      trunk.rotation.x = trunkTiltX
      trunk.rotation.z = trunkTiltZ
      trunk.castShadow = true
      plant.add(trunk)

      // 2-4 根枝条，从主干不同高度斜向伸出
      const branchCount = 2 + Math.floor(Math.random() * 3)
      for (let b = 0; b < branchCount; b++) {
        const branchStartY = -0.5 + trunkHeight * (0.3 + Math.random() * 0.55)
        const branchLen = (0.5 + Math.random() * 0.8) * scale
        const branchAngle = Math.PI * (0.25 + Math.random() * 0.45) // 向外倾斜
        const branchDir = (Math.random() - 0.5) * Math.PI * 2 // 任意水平方向
        const branchGeo = new THREE.CylinderGeometry(
          trunkTop * 0.4,
          trunkTop * 0.6,
          branchLen, 6
        )
        const branch = new THREE.Mesh(branchGeo, treeMat)
        branch.position.set(
          Math.cos(branchDir) * branchLen * 0.4 * Math.sin(branchAngle),
          branchStartY + branchLen * 0.5 * Math.cos(branchAngle),
          Math.sin(branchDir) * branchLen * 0.4 * Math.sin(branchAngle)
        )
        branch.rotation.z = Math.cos(branchDir) * branchAngle
        branch.rotation.x = Math.sin(branchDir) * branchAngle
        branch.castShadow = true
        plant.add(branch)

        // 每根枝条末端一团叶簇
        const endY = branch.position.y + branchLen * 0.5 * Math.cos(branchAngle)
        const endX = branch.position.x + Math.cos(branchDir) * branchLen * 0.4 * Math.sin(branchAngle) * 2
        const endZ = branch.position.z + Math.sin(branchDir) * branchLen * 0.4 * Math.sin(branchAngle) * 2
        const leafCount = 3 + Math.floor(Math.random() * 4)
        for (let l = 0; l < leafCount; l++) {
          const lx = endX + (Math.random() - 0.5) * 0.7 * scale
          const ly = endY + (Math.random() - 0.5) * 0.6 * scale
          const lz = endZ + (Math.random() - 0.5) * 0.7 * scale
          const lSize = (0.25 + Math.random() * 0.45) * scale
          const isSphere = Math.random() > 0.4
          const leafGeo = isSphere
            ? new THREE.SphereGeometry(lSize, 8, 6)
            : new THREE.SphereGeometry(lSize, 8, 6)
          // 用椭球体模拟不规则形状
          const leafMesh = new THREE.Mesh(leafGeo, treeMat)
          leafMesh.position.set(lx, ly, lz)
          leafMesh.scale.set(
            0.7 + Math.random() * 0.6,
            0.7 + Math.random() * 0.5,
            0.7 + Math.random() * 0.6
          )
          plant.add(leafMesh)
        }
      }

      // 主干顶部一簇叶（随机大小和形态）
      const topClusterSize = (0.6 + Math.random() * 0.5) * scale
      for (let c = 0; c < 6 + Math.floor(Math.random() * 5); c++) {
        const cx = (Math.random() - 0.5) * topClusterSize * 1.8
        const cy = -0.5 + trunkHeight + (Math.random() - 0.5) * topClusterSize
        const cz = (Math.random() - 0.5) * topClusterSize * 1.4
        const cSize = (0.18 + Math.random() * 0.32) * scale
        const cGeo = new THREE.SphereGeometry(cSize, 8, 6)
        const cMesh = new THREE.Mesh(cGeo, treeMat)
        cMesh.position.set(cx, cy, cz)
        cMesh.scale.set(
          0.6 + Math.random() * 0.8,
          0.6 + Math.random() * 0.7,
          0.6 + Math.random() * 0.8
        )
        plant.add(cMesh)
      }

      plant.position.set(x, 0, z)
      plant.castShadow = true
      plant.receiveShadow = true
      return plant
    }

    // 左右两侧植物群 - 随机散布，不再是规则排列
    const leftPlantPositions = [
      { x: -10, z: 2, scale: 1.2 },
      { x: -8, z: -1, scale: 1.0 },
      { x: -11.5, z: -3.5, scale: 1.3 },
      { x: -9, z: 3.5, scale: 0.85 },
      { x: -12.5, z: 0.5, scale: 1.15 },
      { x: -7, z: 1.5, scale: 0.9 },
      { x: -9.5, z: -2, scale: 1.05 },
      { x: -8.5, z: 2.5, scale: 0.75 },
      { x: -11, z: 1.5, scale: 1.0 },
      { x: -10.5, z: -1, scale: 0.95 },
    ]
    leftPlantPositions.forEach(({ x, z, scale }) => {
      scene.add(createPlant(x, z, scale))
    })

    // 右侧植物群
    const rightPlantPositions = [
      { x: 10, z: 2, scale: 1.1 },
      { x: 8, z: -1, scale: 1.0 },
      { x: 11.5, z: -3.5, scale: 1.2 },
      { x: 9, z: 3.5, scale: 0.9 },
      { x: 12.5, z: 0.5, scale: 1.15 },
      { x: 7, z: 1.5, scale: 0.95 },
      { x: 9.5, z: -2, scale: 1.05 },
      { x: 8.5, z: 2.5, scale: 0.8 },
      { x: 11, z: 1.5, scale: 0.95 },
      { x: 10.5, z: -1, scale: 1.0 },
    ]
    rightPlantPositions.forEach(({ x, z, scale }) => {
      scene.add(createPlant(x, z, scale))
    })

    // 萤火虫粒子 - 圆形，呼吸感，微光闪烁
    const firefliesGeo = new THREE.BufferGeometry()
    const firefliesCount = 40
    const firefliesPositions = new Float32Array(firefliesCount * 3)
    const firefliesVelocities: Array<{ x: number; y: number; z: number }> = []
    const firefliesPhases: number[] = [] // 用于呼吸动画的相位

    for (let i = 0; i < firefliesCount; i++) {
      // 散开分布在整个场景中，往深处偏移
      firefliesPositions[i * 3] = (Math.random() - 0.5) * 20
      firefliesPositions[i * 3 + 1] = Math.random() * 4 + 0.5
      firefliesPositions[i * 3 + 2] = (Math.random() - 0.5) * 15 - 5

      firefliesVelocities.push({
        x: (Math.random() - 0.5) * 0.02,
        y: (Math.random() - 0.5) * 0.015,
        z: (Math.random() - 0.5) * 0.02
      })

      firefliesPhases.push(Math.random() * Math.PI * 2) // 随机初始相位
    }

    firefliesGeo.setAttribute('position', new THREE.BufferAttribute(firefliesPositions, 3))

    // 使用 Sprite 创建圆形柔和发光的萤火虫
    const firefliesGroup = new THREE.Group()
    const fireflySpriteTexture = createFireflyTexture()

    for (let i = 0; i < firefliesCount; i++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: fireflySpriteTexture,
          color: 0xffeb99,
          transparent: true,
          opacity: 0.8,
          blending: THREE.AdditiveBlending,
          depthWrite: false
        })
      )
      sprite.position.set(
        firefliesPositions[i * 3],
        firefliesPositions[i * 3 + 1],
        firefliesPositions[i * 3 + 2]
      )
      sprite.scale.setScalar(0.15)
      firefliesGroup.add(sprite)
    }
    scene.add(firefliesGroup)

    // 创建萤火虫纹理 - 圆形柔和发光
    function createFireflyTexture() {
      const canvas = document.createElement('canvas')
      canvas.width = 32
      canvas.height = 32
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16)
      gradient.addColorStop(0, 'rgba(255, 235, 153, 1)')
      gradient.addColorStop(0.4, 'rgba(255, 235, 153, 0.6)')
      gradient.addColorStop(0.7, 'rgba(255, 235, 153, 0.2)')
      gradient.addColorStop(1, 'rgba(255, 235, 153, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 32, 32)
      return new THREE.CanvasTexture(canvas)
    }


    // 雾气粒子 - 球形，柔和发光，往深处放置，数量减少到2/3，散开分布
    const fogParticleGeo = new THREE.BufferGeometry()
    const fogCount = 133 // 原来200，现在2/3
    const fogPositions = new Float32Array(fogCount * 3)
    const fogVelocities: Array<{ x: number; y: number; z: number }> = []

    for (let i = 0; i < fogCount; i++) {
      // 散开分布，往深处放置（z 负方向）
      const radius = Math.random() * 6
      const angle = Math.random() * Math.PI * 2
      fogPositions[i * 3] = Math.cos(angle) * radius
      fogPositions[i * 3 + 1] = Math.random() * 8 + 1
      fogPositions[i * 3 + 2] = Math.sin(angle) * radius - 10 // 往深处偏移更多

      fogVelocities.push({
        x: (Math.random() - 0.5) * 0.01,
        y: Math.random() * 0.008 + 0.002,
        z: (Math.random() - 0.5) * 0.01
      })
    }

    fogParticleGeo.setAttribute('position', new THREE.BufferAttribute(fogPositions, 3))

    // 使用 Sprite 创建球形柔和发光粒子，尺寸缩小
    const fogParticles = new THREE.Group()
    const fogSpriteMaterial = new THREE.SpriteMaterial({
      map: createGlowTexture(),
      color: 0xfff4e0,
      transparent: true,
      opacity: 0.5,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    })

    for (let i = 0; i < fogCount; i++) {
      const sprite = new THREE.Sprite(fogSpriteMaterial.clone())
      sprite.position.set(
        fogPositions[i * 3],
        fogPositions[i * 3 + 1],
        fogPositions[i * 3 + 2]
      )
      sprite.scale.setScalar(0.2) // 从 0.3 缩小到 0.2
      fogParticles.add(sprite)
    }
    scene.add(fogParticles)

    // 创建柔和发光纹理
    function createGlowTexture() {
      const canvas = document.createElement('canvas')
      canvas.width = 64
      canvas.height = 64
      const ctx = canvas.getContext('2d')!
      const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32)
      gradient.addColorStop(0, 'rgba(255, 255, 255, 1)')
      gradient.addColorStop(0.3, 'rgba(255, 244, 224, 0.8)')
      gradient.addColorStop(0.6, 'rgba(255, 244, 224, 0.3)')
      gradient.addColorStop(1, 'rgba(255, 244, 224, 0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, 64, 64)
      const texture = new THREE.CanvasTexture(canvas)
      return texture
    }

    // 动画
    let frameId: number
    const animate = () => {
      frameId = requestAnimationFrame(animate)
      const t = Date.now() * 0.001

      // 聚光灯强度脉动
      spotLight.intensity = 115 + Math.sin(t * 0.4) * 10

      // 萤火虫粒子飞舞 + 呼吸闪烁效果
      for (let i = 0; i < firefliesCount; i++) {
        const sprite = firefliesGroup.children[i] as THREE.Sprite

        // 位置移动
        sprite.position.x += firefliesVelocities[i].x
        sprite.position.y += firefliesVelocities[i].y
        sprite.position.z += firefliesVelocities[i].z

        // 边界循环 - 散开分布
        if (Math.abs(sprite.position.x) > 12) {
          sprite.position.x = (Math.random() - 0.5) * 20
        }
        if (sprite.position.y < 0.3 || sprite.position.y > 5) {
          sprite.position.y = Math.random() * 4 + 0.5
        }
        if (sprite.position.z > 5 || sprite.position.z < -15) {
          sprite.position.z = (Math.random() - 0.5) * 15 - 5
        }

        // 呼吸闪烁效果 - 使用正弦波调制透明度
        firefliesPhases[i] += 0.02
        const breathOpacity = 0.4 + Math.sin(firefliesPhases[i]) * 0.4
        sprite.material.opacity = breathOpacity
      }

      // 雾气粒子缓慢上升和漂移
      for (let i = 0; i < fogCount; i++) {
        const sprite = fogParticles.children[i] as THREE.Sprite
        sprite.position.x += fogVelocities[i].x
        sprite.position.y += fogVelocities[i].y
        sprite.position.z += fogVelocities[i].z

        // 边界循环 - 粒子从底部重新进入，散开分布
        if (sprite.position.y > 12) {
          sprite.position.y = 1
          const radius = Math.random() * 6
          const angle = Math.random() * Math.PI * 2
          sprite.position.x = Math.cos(angle) * radius
          sprite.position.z = Math.sin(angle) * radius - 10 // 保持往深处偏移
        }
        if (Math.abs(sprite.position.x) > 8) {
          sprite.position.x = (Math.random() - 0.5) * 6
        }
        if (sprite.position.z > 5 || sprite.position.z < -18) {
          const radius = Math.random() * 6
          const angle = Math.random() * Math.PI * 2
          sprite.position.z = Math.sin(angle) * radius - 10
        }
      }

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