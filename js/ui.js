// Shared chrome: topbar context controls, drawer, toast.

const esc = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c])

/** Fill topbar selects and wire changes. onChange re-renders the page. */
function initTopbar(data, onChange) {
  const ctx = getCtx()
  const sel = document.querySelector('.context select')
  sel.innerHTML = data.corridors
    .map((c) => `<option value="${c.id}" ${c.id === ctx.corridorId ? 'selected' : ''}>${c.id} · ${esc(c.name)}</option>`)
    .join('')
  const dateInput = document.querySelector('.context input[type="date"]')
  dateInput.value = ctx.date
  sel.addEventListener('change', () => onChange(setCtx({ corridorId: sel.value })))
  dateInput.addEventListener('change', () => onChange(setCtx({ date: dateInput.value || DEFAULT_DATE })))
  return ctx
}

function closeDrawer() {
  const d = document.querySelector('.drawer')
  if (d) d.remove()
  document.removeEventListener('keydown', drawerEsc)
}

function drawerEsc(e) {
  if (e.key === 'Escape') closeDrawer()
}

function openDrawer({ title, badge = '', body, footer = '' }) {
  closeDrawer()
  const el = document.createElement('aside')
  el.className = 'drawer'
  el.setAttribute('role', 'dialog')
  el.innerHTML = `
    <div class="drawer-head">
      <span class="drawer-title">${title}</span>
      ${badge}
      <button class="drawer-close" aria-label="Close">✕</button>
    </div>
    <div class="drawer-body">${body}</div>
    ${footer ? `<div class="drawer-foot">${footer}</div>` : ''}`
  el.querySelector('.drawer-close').addEventListener('click', closeDrawer)
  document.body.appendChild(el)
  document.addEventListener('keydown', drawerEsc)
  return el
}

let toastTimer = null
function toast(msg) {
  let el = document.querySelector('.toast')
  if (!el) {
    el = document.createElement('div')
    el.className = 'toast'
    document.body.appendChild(el)
  }
  el.textContent = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => el.remove(), 2600)
}
