const LOGO_SELECTOR = 'img[alt="Fuego"]'
const USER_LOGO_URL = `${import.meta.env.BASE_URL}fuego-logo.png`

function isOpeningLogo(img) {
  const inlineHeight = Number.parseFloat(img.style.height || '0')
  const renderedHeight = img.getBoundingClientRect().height

  return inlineHeight >= 88 || renderedHeight >= 80
}

function polishLogo(img) {
  if (img.dataset.logoPolished === 'true') return

  if (img.getAttribute('src') === '/fuego-logo.png') {
    img.src = USER_LOGO_URL
  }

  img.classList.add('fuego-logo-img')

  if (isOpeningLogo(img)) {
    img.classList.add('fuego-logo-intro')
    img.parentElement?.classList.add('fuego-logo-home-bg')
  }

  img.dataset.logoPolished = 'true'
}

function polishExistingLogos() {
  document.querySelectorAll(LOGO_SELECTOR).forEach(polishLogo)
}

export function applyLogoPolish() {
  polishExistingLogos()

  const root = document.getElementById('root')
  if (!root) return

  const observer = new MutationObserver(polishExistingLogos)
  observer.observe(root, { childList: true, subtree: true })
}
