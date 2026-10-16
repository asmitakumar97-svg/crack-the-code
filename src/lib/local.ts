const TOKEN_KEY = 'crack-the-code.local.session'
let token = localStorage.getItem(TOKEN_KEY)

export async function localRequest<T>(path: string, args?: Record<string, unknown>): Promise<T> {
  let response: Response
  try {
    response = await fetch(`/__local_game${path}`, {
      method: args === undefined ? 'GET' : 'POST',
      headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(args === undefined ? {} : { 'Content-Type': 'application/json' }) },
      body: args === undefined ? undefined : JSON.stringify(args),
      cache: 'no-store',
    })
  } catch (error) {
    throw new Error('The local multiplayer server is unavailable. Make sure npm run dev:local is running.', { cause: error })
  }
  const result: unknown = await response.json()
  if (!response.ok) {
    const message = result && typeof result === 'object' && 'message' in result && typeof result.message === 'string' ? result.message : `Local server request failed (${response.status}).`
    throw new Error(message)
  }
  return result as T
}

export async function authenticateLocal() {
  const session = await localRequest<{ user_id: string; token: string }>('/session', {})
  token = session.token
  localStorage.setItem(TOKEN_KEY, token)
  return session.user_id
}
