export async function safeBack(router, fallback = '/') {
  const back = router.options.history.state.back
  if (typeof back === 'string' && back.startsWith('/') && !back.startsWith('//')) {
    router.back()
    return true
  }
  await router.replace(fallback)
  return false
}
