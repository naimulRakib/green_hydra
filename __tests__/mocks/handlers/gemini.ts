import { http, HttpResponse } from 'msw'

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

export const geminiHandlers = [
  http.post(`${GEMINI_BASE}/:model:generateContent`, async ({ request }) => {
    const body = await request.json()
    const prompt = JSON.stringify(body).toLowerCase()

    // Gatekeeper response (is_valid check)
    if (prompt.includes('is_valid') || prompt.includes('gatekeeper')) {
      return HttpResponse.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                is_valid: true,
                detected_crop: 'rice',
                gatekeeper_reason: null,
                _tokens_used: 150
              })
            }]
          }
        }]
      })
    }

    // Biotic diagnosis
    if (prompt.includes('biotic') || prompt.includes('disease') || prompt.includes('fungal')) {
      return HttpResponse.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                biotic_score: 0.85,
                disease_type: 'Biotic',
                stress_subtype: 'Biotic_Fungal',
                confidence: 0.82,
                disease_name_en: 'Rice Blast',
                disease_name_bn: 'ব্লাস্ট রোগ',
                weather_supports_disease: true,
                remedy_bn: 'ট্রাইসাইক্লাজল স্প্রে করুন প্রতি লিটার পানিতে ১ মিলি হারে',
                _tokens_used: 350
              })
            }]
          }
        }]
      })
    }

    // Abiotic diagnosis
    if (prompt.includes('abiotic') || prompt.includes('pollution') || prompt.includes('metal')) {
      return HttpResponse.json({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                abiotic_score: 0.75,
                disease_type: 'Abiotic',
                stress_subtype: 'Abiotic_Pollution',
                confidence: 0.70,
                visual_cues: 'leaf discoloration, necrotic spots',
                _tokens_used: 300
              })
            }]
          }
        }]
      })
    }

    // Default response
    return HttpResponse.json({ error: 'Unknown prompt type' }, { status: 400 })
  })
]
