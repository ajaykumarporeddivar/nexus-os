const WATI_URL = process.env.WATI_URL ?? ''
const WATI_KEY = process.env.WATI_API_KEY ?? ''

export interface WatiMessage {
  phone: string   // E.164 without +, e.g. "919876543210"
  message: string
}

export interface WatiTemplateMessage {
  phone: string
  templateName: string
  parameters?: Array<{ name: string; value: string }>
}

function headers() {
  return {
    Authorization: `Bearer ${WATI_KEY}`,
    'Content-Type': 'application/json',
  }
}

export async function sendWhatsApp({ phone, message }: WatiMessage): Promise<boolean> {
  if (!WATI_URL || !WATI_KEY) return false
  const clean = phone.replace(/\D/g, '')
  try {
    const res = await fetch(`${WATI_URL}/api/v1/sendSessionMessage/${clean}`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ messageText: message }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function sendWhatsAppTemplate({ phone, templateName, parameters = [] }: WatiTemplateMessage): Promise<boolean> {
  if (!WATI_URL || !WATI_KEY) return false
  const clean = phone.replace(/\D/g, '')
  try {
    const res = await fetch(`${WATI_URL}/api/v1/sendTemplateMessage`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ whatsappNumber: clean, template_name: templateName, parameters }),
    })
    return res.ok
  } catch {
    return false
  }
}

export async function checkWatiHealth(): Promise<{ ok: boolean; latencyMs: number }> {
  if (!WATI_URL || !WATI_KEY) return { ok: false, latencyMs: -1 }
  const t0 = Date.now()
  try {
    const res = await fetch(`${WATI_URL}/api/v1/getContacts?pageSize=1`, {
      headers: headers(),
      signal: AbortSignal.timeout(5000),
    })
    return { ok: res.ok, latencyMs: Date.now() - t0 }
  } catch {
    return { ok: false, latencyMs: Date.now() - t0 }
  }
}
