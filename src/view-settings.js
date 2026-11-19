export const defaultView = { zoom: 110, width: 'standard' }
export function normalizeView(value) {
  const zoom = Number(value?.zoom)
  return {
    zoom: Number.isFinite(zoom) ? Math.max(70, Math.min(180, Math.round(zoom / 10) * 10)) : defaultView.zoom,
    width: ['compact', 'standard', 'wide'].includes(value?.width) ? value.width : defaultView.width,
  }
}
export function loadView() {
  try { return normalizeView(JSON.parse(localStorage.getItem('mdtex.view.v1'))) } catch { return { ...defaultView } }
}
