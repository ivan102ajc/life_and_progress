// Обращения к серверу.

const TOKEN_KEY = 'tol_token';

export const auth = {
  get token() { try { return localStorage.getItem(TOKEN_KEY); } catch { return null; } },
  set token(v) {
    try { v ? localStorage.setItem(TOKEN_KEY, v) : localStorage.removeItem(TOKEN_KEY); } catch { /* приватный режим */ }
  },
};

export async function request(path, { method = 'GET', body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth.token) headers.Authorization = `Bearer ${auth.token}`;
  let res;
  try {
    res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  } catch {
    const e = new Error('Нет связи с сервером. Проверьте интернет.');
    e.offline = true;
    throw e;
  }
  let data = {};
  try { data = await res.json(); } catch { /* пустой ответ */ }
  if (!res.ok) {
    const e = new Error(data.error || `Ошибка сервера (${res.status})`);
    e.status = res.status;
    e.code = data.code;
    throw e;
  }
  return data;
}

export const api = {
  register: (email, password, name) => request('/api/auth', { method: 'POST', body: { action: 'register', email, password, name } }),
  login: (email, password) => request('/api/auth', { method: 'POST', body: { action: 'login', email, password } }),
  telegram: (initData) => request('/api/telegram', { method: 'POST', body: { initData } }),
  attachEmail: (email, password) => request('/api/auth', { method: 'POST', body: { action: 'attach', email, password } }),
  linkCode: () => request('/api/telegram', { method: 'POST', body: { action: 'code' } }),
  unlinkTelegram: () => request('/api/telegram', { method: 'POST', body: { action: 'unlink' } }),
  load: () => request('/api/state'),
  save: (data) => request('/api/state', { method: 'PUT', body: { data } }),
};
