import { readFileSync } from 'fs'
import path from 'path'

/**
 * Load a text fixture file
 */
export const loadFixture = (filename: string): string => {
  const fixturePath = path.join(__dirname, '../fixtures', filename)
  return readFileSync(fixturePath, 'utf-8')
}

/**
 * Load an image fixture as a Buffer
 */
export const loadImageFixture = (filename: string): Buffer => {
  const imagePath = path.join(__dirname, '../fixtures/images', filename)
  return readFileSync(imagePath)
}

/**
 * Create a mock FormData with an image
 */
export const createMockFormData = (imageBuffer: Buffer, filename: string): FormData => {
  const blob = new Blob([imageBuffer], { type: 'image/jpeg' })
  const formData = new FormData()
  formData.append('image', blob, filename)
  return formData
}

/**
 * Wait for a specified number of milliseconds
 */
export const waitFor = (ms: number): Promise<void> => {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Create a mock Request object for testing API routes
 */
export const createMockRequest = (
  url: string,
  options: RequestInit = {}
): Request => {
  return new Request(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })
}
