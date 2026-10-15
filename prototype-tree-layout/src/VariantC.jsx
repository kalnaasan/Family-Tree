// C: Canvas 2D with wobbly hand-drawn branches and our own pan/zoom (the cost of leaving the DOM).
import { useEffect, useRef } from 'react'
export const name = 'Canvas 2D'
export default function VariantC({ L }) {
  const ref = useRef(null)
  const view = useRef({ x: 0, y: 0, k: 1 })
  useEffect(() => {
    const cv = ref.current, ctx = cv.getContext('2d')
    const draw = () => {
      const r = cv.getBoundingClientRect(); cv.width = r.width * devicePixelRatio; cv.height = r.height * devicePixelRatio
      const v = view.current
      ctx.setTransform(devicePixelRatio * v.k, 0, 0, devicePixelRatio * v.k, v.x * devicePixelRatio, v.y * devicePixelRatio)
      ctx.clearRect(0, 0, cv.width, cv.height)
      ctx.lineCap = 'round'
      L.parentEdges.forEach(({ child, parent }) => {
        const my = (child.y + parent.y) / 2, wob = (child.x - parent.x) * 0.08
        ctx.strokeStyle = '#6b3f1d'; ctx.lineWidth = Math.min(3 + parent.weight * 1.6, 18)
        ctx.beginPath(); ctx.moveTo(parent.x, parent.y)
        ctx.bezierCurveTo(parent.x + wob, my + 10, child.x - wob, my - 10, child.x, child.y); ctx.stroke()
      })
      L.partnerEdges.forEach(({ a, b, ended }) => {
        ctx.setLineDash(ended ? [6, 6] : []); ctx.strokeStyle = ended ? '#9ca3af' : '#be185d'; ctx.lineWidth = 3
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([])
      })
      ctx.font = '14px sans-serif'; ctx.textAlign = 'center'
      L.nodes.forEach(n => {
        ctx.save(); ctx.translate(n.x, n.y); ctx.rotate(((n.x * 7) % 20 - 10) * Math.PI / 180)
        ctx.fillStyle = '#65a30d'; ctx.beginPath(); ctx.ellipse(0, 0, 40, 22, 0, 0, 7); ctx.fill()
        ctx.restore(); ctx.fillStyle = 'white'; ctx.fillText(n.name, n.x, n.y + 5)
      })
    }
    draw()
    let drag = null
    const down = e => (drag = { x: e.clientX - view.current.x, y: e.clientY - view.current.y })
    const move = e => { if (drag) { view.current.x = e.clientX - drag.x; view.current.y = e.clientY - drag.y; draw() } }
    const up = () => (drag = null)
    const wheel = e => { e.preventDefault(); view.current.k = Math.min(3, Math.max(0.3, view.current.k * (e.deltaY < 0 ? 1.1 : 0.9))); draw() }
    cv.addEventListener('mousedown', down); window.addEventListener('mousemove', move); window.addEventListener('mouseup', up)
    cv.addEventListener('wheel', wheel, { passive: false }); window.addEventListener('resize', draw)
    return () => { cv.removeEventListener('mousedown', down); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); cv.removeEventListener('wheel', wheel); window.removeEventListener('resize', draw) }
  }, [L])
  return <canvas ref={ref} className="h-full w-full cursor-grab bg-gradient-to-t from-amber-100 to-sky-100" />
}
