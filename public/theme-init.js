// FOUC-prevention for vsizer's dark-mode toggle. Externalised from
// index.html so the container's strict CSP (script-src 'self') applies.
// Behaviour is byte-identical to the previous inline script. See ADR-0013.
;(() => {
  var pref = null
  try {
    pref = localStorage.getItem('vsizer-theme')
  } catch (_) {}
  var resolved =
    pref === 'light' || pref === 'dark'
      ? pref
      : window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
  if (resolved === 'dark') document.documentElement.classList.add('dark')
})()
