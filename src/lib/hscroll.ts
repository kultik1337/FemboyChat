import { useEffect, useRef } from 'react'

/**
 * Горизонтальная полоска, которую реально листать.
 *
 * `overflow-x-auto` сам по себе честно работает только пальцем. Колёсико мыши
 * крутит страницу по вертикали, а у полоски вертикали нет — поэтому на десктопе
 * выглядит так, будто список просто обрезан и до остального не добраться.
 *
 * Здесь две привычки сразу: колёсико ездит вбок и полоску можно тащить
 * мышью. Перетаскивание гасит только тот клик, который на самом деле был жестом:
 * иначе попытка пролистать папки заодно открывала бы случайную папку.
 */
export function useHScroll<T extends HTMLElement>() {
  const ref = useRef<T | null>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const scrollable = () => el.scrollWidth - el.clientWidth > 1

    const onWheel = (e: WheelEvent) => {
      // Горизонтальное колёсо (трекпад, наклон колёса) браузер обработает сам.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      if (!scrollable()) return
      e.preventDefault()
      el.scrollLeft += e.deltaY
    }

    let dragging = false
    let moved = false
    let startX = 0
    let startScroll = 0

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0 || !scrollable()) return
      dragging = true
      moved = false
      startX = e.clientX
      startScroll = el.scrollLeft
    }

    const onPointerMove = (e: PointerEvent) => {
      if (!dragging) return
      const dx = e.clientX - startX
      if (!moved && Math.abs(dx) < 5) return
      moved = true
      el.scrollLeft = startScroll - dx
    }

    const endDrag = () => {
      dragging = false
      // Флаг снимается после того, как click успеет пройти и быть проглоченным.
      setTimeout(() => {
        moved = false
      }, 0)
    }

    const onClickCapture = (e: MouseEvent) => {
      if (!moved) return
      e.preventDefault()
      e.stopPropagation()
    }

    el.addEventListener('wheel', onWheel, { passive: false })
    el.addEventListener('pointerdown', onPointerDown)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', endDrag)
    el.addEventListener('click', onClickCapture, true)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', endDrag)
      el.removeEventListener('click', onClickCapture, true)
    }
  }, [])

  return ref
}
